import asyncio
import gc
import json
import threading
import warnings
from collections.abc import AsyncGenerator
from typing import Any, NoReturn

import psycopg
import pytest
from asgiref.sync import sync_to_async
from django.db import connection

from events import realtime
from events.realtime import StatsListener, notify_stats_changed, snapshot_stream

# The listener connects to the test database, which exists only with the db fixtures.
pytestmark = pytest.mark.django_db(transaction=True)


def notify(event_id: int) -> None:
    try:
        notify_stats_changed(event_id)
    finally:
        # A connection left open in the worker thread keeps the test database from being dropped.
        connection.close()


def fail_listen(monkeypatch: pytest.MonkeyPatch) -> type[BaseException]:
    monkeypatch.setattr(realtime, "CHANNEL", "not a channel")
    return psycopg.errors.SyntaxError


def cancel_listen(monkeypatch: pytest.MonkeyPatch) -> type[BaseException]:
    # What a client disconnecting meanwhile does: the request task is cancelled in the await.
    async def cancelled(*args: Any, **kwargs: Any) -> NoReturn:
        raise asyncio.CancelledError

    monkeypatch.setattr(psycopg.AsyncConnection, "execute", cancelled)
    return asyncio.CancelledError


@pytest.mark.parametrize("break_listen", [fail_listen, cancel_listen])
async def test_a_listen_that_does_not_complete_closes_its_connection_and_lets_the_next_one_start(
    monkeypatch: pytest.MonkeyPatch, break_listen: Any
) -> None:
    listener = StatsListener()
    with warnings.catch_warnings(record=True) as caught, monkeypatch.context() as patch:
        warnings.simplefilter("always")
        error = break_listen(patch)
        with pytest.raises(error):
            async with listener.subscription(1, lambda event_id: event_id):
                pass
        # A connection dropped without close() is closed by the garbage collector, quietly but
        # for psycopg's ResourceWarning: the warning is what tells the leak.
        gc.collect()
    assert [w for w in caught if issubclass(w.category, ResourceWarning)] == []

    async with listener.subscription(1, lambda event_id: event_id) as snapshots:
        await sync_to_async(notify)(1)

        assert await asyncio.wait_for(snapshots.get(), timeout=5) == 1


async def data(stream: AsyncGenerator[bytes]) -> Any:
    chunk = await asyncio.wait_for(anext(stream), timeout=5)
    return json.loads(chunk.decode().split("data: ", 1)[1])


def open_backends(pids: list[int]) -> set[int]:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pid FROM pg_stat_activity WHERE pid = ANY(%s)", [pids])
            return {pid for (pid,) in cursor.fetchall()}
    finally:
        connection.close()


async def test_subscribers_of_an_event_share_one_snapshot_read_per_change() -> None:
    reads: list[int] = []

    def snapshot(event_id: int) -> dict[str, int]:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_backend_pid()")
            reads.append(cursor.fetchone()[0])
        return {"event": event_id, "read": len(reads)}

    streams = [snapshot_stream(1, snapshot) for _ in range(3)]
    try:
        for stream in streams:
            await data(stream)
        # Each one joining is a read, and the ones already there get it too: the streams
        # before the last have a snapshot waiting. No read is running, the last one has ended.
        joins = len(reads)

        await sync_to_async(notify)(1)

        for stream in streams:
            while (await data(stream))["read"] <= joins:
                pass
        # One read, so one connection: N viewers of an event cost what one does.
        assert len(reads) == joins + 1
        # And no connection is left to them between changes; a backend ends a moment after
        # its client closes it.
        for _ in range(50):
            if not await sync_to_async(open_backends)(reads):
                break
            await asyncio.sleep(0.1)
        assert await sync_to_async(open_backends)(reads) == set()
    finally:
        for stream in streams:
            await stream.aclose()


async def test_a_failed_snapshot_read_ends_the_streams_of_the_event() -> None:
    reads: list[int] = []

    def snapshot(event_id: int) -> int:
        reads.append(event_id)
        if len(reads) > 1:
            raise LookupError("deleted meanwhile")
        return event_id

    stream = snapshot_stream(1, snapshot)
    try:
        await anext(stream)
        await sync_to_async(notify)(1)

        with pytest.raises(LookupError):
            await asyncio.wait_for(anext(stream), timeout=5)
    finally:
        await stream.aclose()


async def test_a_new_subscriber_gets_no_snapshot_older_than_its_first() -> None:
    database = {"version": 0}
    # The first read after `hold` is set takes its version, then waits for `release`: a read
    # that began before a later commit and ends after it.
    hold, holding, release = threading.Event(), threading.Event(), threading.Event()

    def snapshot(event_id: int) -> int:
        version = database["version"]
        if hold.is_set():
            hold.clear()
            holding.set()
            release.wait(timeout=5)
        return version

    first, second = snapshot_stream(1, snapshot), snapshot_stream(1, snapshot)
    try:
        assert await data(first) == 0
        database["version"] = 1
        hold.set()
        await sync_to_async(notify)(1)
        await asyncio.to_thread(holding.wait, 5)
        # Committed while the read of version 1 is still running.
        database["version"] = 2

        joined = asyncio.create_task(data(second))
        # Room for a snapshot of its own, read before the held one is released.
        await asyncio.wait({joined}, timeout=0.5)
        release.set()
        received = [await joined]
        database["version"] = 3
        await sync_to_async(notify)(1)
        while received[-1] != 3:
            received.append(await data(second))

        assert received == sorted(received)
    finally:
        release.set()
        await first.aclose()
        await second.aclose()
