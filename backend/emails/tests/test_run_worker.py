import pytest
from django.db import connection

from emails.management.commands import run_worker
from emails.management.commands.run_worker import (
    DB_ERROR_PAUSE,
    POLL_INTERVAL,
    REMINDER_INTERVAL,
    Command,
)


# transaction=True: recovering from the error closes the connection, which a test transaction
# would not survive.
@pytest.mark.django_db(transaction=True)
def test_lost_database_connection_is_logged_and_the_next_poll_reconnects(
    caplog: pytest.LogCaptureFixture,
) -> None:
    command = Command()
    command.poll()
    # The database drops the connection under the worker.
    connection.connection.close()

    assert command.poll() == DB_ERROR_PAUSE
    assert "Outbox poll failed: OperationalError" in caplog.text

    assert command.poll() == POLL_INTERVAL


@pytest.mark.django_db
def test_worker_polls_again_at_once_after_sending(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(run_worker, "process_batch", lambda: [1])

    assert Command().poll() == 0


@pytest.mark.django_db
def test_worker_queues_reminders_once_an_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    passes: list[float] = []
    clock = [1000.0]
    monkeypatch.setattr("time.monotonic", lambda: clock[0])

    def enqueue_reminders() -> int:
        passes.append(clock[0])
        return 0

    monkeypatch.setattr(run_worker, "enqueue_reminders", enqueue_reminders)
    command = Command()

    command.poll()
    clock[0] += REMINDER_INTERVAL - 1
    command.poll()
    clock[0] += 1
    command.poll()

    assert passes == [1000.0, 1000.0 + REMINDER_INTERVAL]
