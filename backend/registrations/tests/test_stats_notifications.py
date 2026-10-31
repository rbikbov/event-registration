from collections.abc import Callable, Iterator
from datetime import timedelta

import psycopg
import pytest
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from events.models import Event
from events.realtime import CHANNEL, connection_params
from registrations.models import Registration
from registrations.services import check_in

# Postgres delivers a notification only on commit: the data must really be committed.
pytestmark = pytest.mark.django_db(transaction=True)


class Rollback(Exception):
    pass


@pytest.fixture
def notifications() -> Iterator[Callable[[], list[str]]]:
    """Payloads of the stats notifications committed since the previous call."""
    with psycopg.connect(**connection_params(), autocommit=True) as listener:
        listener.execute(f"LISTEN {CHANNEL}")

        def received() -> list[str]:
            # Delivery is asynchronous: a short wait instead of a single poll.
            return [notify.payload for notify in listener.notifies(timeout=0.3)]

        yield received


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=10,
    )


@pytest.fixture
def ticket(event: Event) -> Registration:
    return Registration.objects.create(
        event=event, email="ann@x.io", name="Ann", status=Registration.Status.CONFIRMED
    )


def test_first_check_in_notifies_after_commit(
    event: Event, ticket: Registration, notifications: Callable[[], list[str]]
) -> None:
    check_in(event.id, ticket.ticket_code)

    assert notifications() == [str(event.id)]


def test_rolled_back_check_in_does_not_notify(
    event: Event, ticket: Registration, notifications: Callable[[], list[str]]
) -> None:
    with pytest.raises(Rollback), transaction.atomic():
        check_in(event.id, ticket.ticket_code)
        raise Rollback

    assert notifications() == []


def test_repeat_check_in_does_not_notify(
    event: Event, ticket: Registration, notifications: Callable[[], list[str]]
) -> None:
    check_in(event.id, ticket.ticket_code)
    notifications()

    check_in(event.id, ticket.ticket_code)

    assert notifications() == []
