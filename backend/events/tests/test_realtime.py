import asyncio
import gc
import warnings
from typing import Any, NoReturn

import psycopg
import pytest
from asgiref.sync import sync_to_async
from django.db import connection

from events import realtime
from events.realtime import StatsListener, notify_stats_changed

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
            async with listener.subscription(1):
                pass
        # A connection dropped without close() is closed by the garbage collector, quietly but
        # for psycopg's ResourceWarning: the warning is what tells the leak.
        gc.collect()
    assert [w for w in caught if issubclass(w.category, ResourceWarning)] == []

    async with listener.subscription(1) as changed:
        await sync_to_async(notify)(1)

        await asyncio.wait_for(changed.get(), timeout=5)
