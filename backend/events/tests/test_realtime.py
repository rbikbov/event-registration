import asyncio

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


async def test_a_failed_listen_leaves_the_listener_to_start_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    listener = StatsListener()
    # What a cancellation on disconnect does at the same point: LISTEN does not complete.
    monkeypatch.setattr(realtime, "CHANNEL", "not a channel")
    with pytest.raises(psycopg.errors.SyntaxError):
        async with listener.subscription(1):
            pass
    monkeypatch.undo()

    async with listener.subscription(1) as changed:
        await sync_to_async(notify)(1)

        await asyncio.wait_for(changed.get(), timeout=5)
