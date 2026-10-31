"""Live events: `pg_notify` from the transaction that changes the counts, SSE to subscribers.

A notification carries only the event id; the whole event is read from the database on each one,
once for all the subscribers of the process. So a lost or merged notification cannot leave wrong
counts, only a later snapshot.
"""

import asyncio
import json
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from contextlib import asynccontextmanager, suppress
from typing import Any

import psycopg
from asgiref.sync import sync_to_async
from django.db import connection, connections

CHANNEL = "event_stats"


def notify_stats_changed(event_id: int) -> None:
    """Tell the subscribers of the event that its counts changed.

    Call it in the transaction that changes them: Postgres delivers the notification on commit
    and drops it on rollback, so nobody reads the counts before they are visible.
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_notify(%s, %s)", [CHANNEL, str(event_id)])


def connection_params() -> dict[str, Any]:
    """psycopg parameters of the default database (in tests, the test database)."""
    settings = connections["default"].settings_dict
    return {
        "dbname": settings["NAME"],
        "user": settings["USER"],
        "password": settings["PASSWORD"],
        "host": settings["HOST"],
        "port": settings["PORT"],
    }


Snapshot = Callable[[int], Any]


def read_snapshot(snapshot: Snapshot, event_id: int) -> Any:
    """`snapshot` of the event, with its database connection closed after the read.

    So an open stream holds no connection between changes.
    """
    try:
        return snapshot(event_id)
    finally:
        connection.close()


def put_latest(queue: asyncio.Queue[Any], item: Any) -> None:
    if queue.full():
        queue.get_nowait()
    queue.put_nowait(item)


class Feed:
    """The subscribers of one snapshot of one event: a change is read once for all of them.

    Reads go one after another, and a read goes only to the subscribers that were there when it
    began: a subscriber never gets a snapshot older than one it already has.
    """

    def __init__(self, event_id: int, snapshot: Snapshot) -> None:
        self.event_id = event_id
        self.snapshot = snapshot
        # A queue of one per subscriber: a snapshot not yet sent is replaced by a newer one.
        self.queues: set[asyncio.Queue[Any]] = set()
        self._stale = False
        self._reading: asyncio.Task[None] | None = None

    def changed(self) -> None:
        self._stale = True
        if self._reading is None:
            self._reading = asyncio.create_task(self._read())

    def joined(self, queue: asyncio.Queue[Any]) -> None:
        # Its first snapshot is read by the feed too: a read of its own could end before a read
        # of the feed that began earlier, and that older one would come next.
        self.queues.add(queue)
        self.changed()

    async def _read(self) -> None:
        # A change or a subscriber while a read is running came after the read began, so it is
        # read again; the changes in between are all in that one read.
        try:
            while self._stale:
                self._stale = False
                readers = set(self.queues)
                try:
                    # Not thread-sensitive: the task outlives the request that started it, and
                    # that request's thread with it.
                    item = await sync_to_async(read_snapshot, thread_sensitive=False)(
                        self.snapshot, self.event_id
                    )
                except Exception as error:
                    item = error
                # Not to the ones that left meanwhile.
                for queue in readers & self.queues:
                    put_latest(queue, item)
        finally:
            self._reading = None

    async def close(self) -> None:
        if self._reading is not None:
            self._reading.cancel()
            with suppress(asyncio.CancelledError):
                await self._reading


class StatsListener:
    """One LISTEN connection per process, shared by all streams in its event loop.

    It is opened by the first subscriber and closed after the last one leaves, so a process
    without open streams holds no extra connection.
    """

    def __init__(self) -> None:
        self._feeds: dict[int, dict[Snapshot, Feed]] = {}
        self._lock = asyncio.Lock()
        self._connection: psycopg.AsyncConnection[Any] | None = None
        self._dispatch: asyncio.Task[None] | None = None

    @asynccontextmanager
    async def subscription(
        self, event_id: int, snapshot: Snapshot
    ) -> AsyncIterator[asyncio.Queue[Any]]:
        """A queue of `snapshot`s of the event: the first one, then one after each change.

        An item is the snapshot or the exception that reading it raised. LISTEN is in effect
        before the first snapshot is read: a change committed after that read began is not
        missed, it brings another snapshot.
        """
        queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=1)
        async with self._lock:
            if self._connection is None:
                listening = await psycopg.AsyncConnection.connect(
                    **connection_params(), autocommit=True
                )
                # Kept only once LISTEN is in effect: a connection kept after a failed or
                # cancelled LISTEN (a client disconnects meanwhile) would look started to the
                # next subscribers, and nothing would deliver to them.
                try:
                    await listening.execute(f"LISTEN {CHANNEL}")
                except BaseException:
                    await listening.close()
                    raise
                self._connection = listening
                self._dispatch = asyncio.create_task(self._deliver(listening))
            feeds = self._feeds.setdefault(event_id, {})
            feed = feeds.setdefault(snapshot, Feed(event_id, snapshot))
            feed.joined(queue)
        try:
            yield queue
        finally:
            async with self._lock:
                feed.queues.discard(queue)
                if not feed.queues:
                    del feeds[snapshot]
                    await feed.close()
                if not feeds:
                    del self._feeds[event_id]
                if not self._feeds:
                    await self._close()

    async def _deliver(self, listener: psycopg.AsyncConnection[Any]) -> None:
        async for notify in listener.notifies():
            for feed in self._feeds.get(int(notify.payload), {}).values():
                feed.changed()

    async def _close(self) -> None:
        if self._dispatch is not None:
            self._dispatch.cancel()
            with suppress(asyncio.CancelledError):
                await self._dispatch
            self._dispatch = None
        if self._connection is not None:
            await self._connection.close()
            self._connection = None


listener = StatsListener()


async def snapshot_stream(event_id: int, snapshot: Snapshot) -> AsyncGenerator[bytes]:
    """SSE messages `snapshot`: one right away, then one after each change of the event.

    `snapshot` is a synchronous read of the event as its GET has it, read once for all the
    streams of the process that pass the same function for the event.
    """
    async with listener.subscription(event_id, snapshot) as snapshots:
        while True:
            data = await snapshots.get()
            if isinstance(data, Exception):
                raise data
            yield f"event: snapshot\ndata: {json.dumps(data)}\n\n".encode()
