"""Live event stats: `pg_notify` from the transaction that changes them, SSE to subscribers.

A notification carries only the event id; a subscriber reads a full snapshot from the database
on each one. So a lost or merged notification cannot leave wrong counts, only a later snapshot.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Callable
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


class StatsListener:
    """One LISTEN connection per process, shared by all streams in its event loop.

    It is opened by the first subscriber and closed after the last one leaves, so a process
    without open streams holds no extra connection.
    """

    def __init__(self) -> None:
        # A queue of one: a change while the previous one is not yet read adds nothing, the
        # snapshot read for it is read after both.
        self._subscribers: dict[int, set[asyncio.Queue[None]]] = {}
        self._lock = asyncio.Lock()
        self._connection: psycopg.AsyncConnection[Any] | None = None
        self._dispatch: asyncio.Task[None] | None = None

    @asynccontextmanager
    async def subscription(self, event_id: int) -> AsyncIterator[asyncio.Queue[None]]:
        """A queue that gets an item when the event's stats change.

        LISTEN is in effect when the context is entered: a change committed after that is not
        missed, so a snapshot read inside the context is never older than the next item.
        """
        queue: asyncio.Queue[None] = asyncio.Queue(maxsize=1)
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
            self._subscribers.setdefault(event_id, set()).add(queue)
        try:
            yield queue
        finally:
            async with self._lock:
                queues = self._subscribers[event_id]
                queues.discard(queue)
                if not queues:
                    del self._subscribers[event_id]
                if not self._subscribers:
                    await self._close()

    async def _deliver(self, listener: psycopg.AsyncConnection[Any]) -> None:
        async for notify in listener.notifies():
            for queue in self._subscribers.get(int(notify.payload), ()):
                if not queue.full():
                    queue.put_nowait(None)

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


async def stats_stream(event_id: int, snapshot: Callable[[], Any]) -> AsyncIterator[bytes]:
    """SSE messages `stats`: a snapshot right away, then one after each change of the event.

    `snapshot` is a synchronous read of the counts; its database connection is closed after
    each read, so an open stream holds none between changes.
    """

    def read() -> Any:
        try:
            return snapshot()
        finally:
            connection.close()

    async with listener.subscription(event_id) as changed:
        while True:
            data = await sync_to_async(read)()
            yield f"event: stats\ndata: {json.dumps(data)}\n\n".encode()
            await changed.get()
