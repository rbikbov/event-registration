from datetime import timedelta
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import User
from events.models import Event
from registrations.models import Registration
from registrations.services import register, waitlist_position

pytestmark = pytest.mark.django_db


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=2,
    )


def test_register_confirms_when_a_seat_is_free(event: Event) -> None:
    now = timezone.now()

    result = register(event.id, "a@x.io", "Ann", now=now)

    assert result.created is True
    assert result.registration.status == Registration.Status.CONFIRMED
    assert result.registration.confirmed_at == now
    assert result.registration.name == "Ann"


def test_register_issues_distinct_ticket_code_and_manage_token(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    second = register(event.id, "b@x.io", "Bob").registration

    assert first.ticket_code != second.ticket_code
    assert first.manage_token != second.manage_token
    assert not set(first.ticket_code) & set("01OI")


@pytest.mark.parametrize("again", ["a@x.io", "A@X.IO", "  a@x.io "])
def test_register_again_returns_the_same_registration(event: Event, again: str) -> None:
    first = register(event.id, "a@x.io", "Ann")

    second = register(event.id, again, "Other name")

    assert second.created is False
    assert second.registration.id == first.registration.id
    assert second.registration.name == "Ann"
    assert Registration.objects.count() == 1


def test_repeat_by_a_registered_email_does_not_take_a_second_seat(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "a@x.io", "Ann")

    assert register(event.id, "b@x.io", "Bob").created is True


@pytest.mark.parametrize("other", ["a.b@x.io", "a+t@x.io"])
def test_email_differing_by_dot_or_tag_is_a_different_registration(
    event: Event, other: str
) -> None:
    event.capacity = 3
    event.save()
    register(event.id, "ab@x.io", "Ann")

    assert register(event.id, other, "Bob").created is True
    assert Registration.objects.count() == 2


def test_register_stores_the_email_in_lower_case(event: Event) -> None:
    register(event.id, "Ann@X.io", "Ann")

    assert Registration.objects.get().email == "ann@x.io"


def test_register_waitlists_when_no_seats_are_left(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")

    result = register(event.id, "c@x.io", "Cid")

    assert result.created is True
    assert result.registration.status == Registration.Status.WAITLISTED
    assert result.registration.confirmed_at is None
    assert result.position == 1
    assert Registration.objects.filter(status=Registration.Status.CONFIRMED).count() == 2


def test_confirmed_registration_has_no_position(event: Event) -> None:
    assert register(event.id, "a@x.io", "Ann").position is None


def test_waitlist_positions_grow_in_registration_order(event: Event) -> None:
    event.capacity = 1
    event.save()
    register(event.id, "a@x.io", "Ann")

    positions = [register(event.id, f"w{i}@x.io", "W").position for i in range(3)]

    assert positions == [1, 2, 3]


def test_repeat_on_the_waitlist_keeps_the_position(event: Event) -> None:
    event.capacity = 1
    event.save()
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")

    again = register(event.id, "C@x.io", "Cid")

    assert again.created is False
    assert again.position == 2


def test_waitlist_order_breaks_a_queued_at_tie_by_id(event: Event) -> None:
    event.capacity = 1
    event.save()
    register(event.id, "a@x.io", "Ann")
    first = register(event.id, "b@x.io", "Bob").registration
    second = register(event.id, "c@x.io", "Cid").registration
    # `register` never queues two at one time; a tie is made by hand.
    Registration.objects.filter(id__in=[first.id, second.id]).update(queued_at=first.queued_at)

    assert (waitlist_position(first), waitlist_position(second)) == (1, 2)


def test_clock_stepping_back_does_not_queue_a_later_registration_first(event: Event) -> None:
    # The wall clock may step back between two requests; the queue is the order of the locks.
    event.capacity = 1
    event.save()
    now = timezone.now()
    register(event.id, "a@x.io", "Ann", now=now)
    first = register(event.id, "first@x.io", "First", now=now + timedelta(minutes=5))
    second = register(event.id, "second@x.io", "Second", now=now + timedelta(minutes=1))

    assert (first.position, second.position) == (1, 2)
    assert waitlist_position(first.registration) == 1


def test_other_events_waitlist_does_not_shift_the_position(event: Event) -> None:
    other = Event.objects.create(
        organizer=event.organizer, title="Other", starts_at=event.starts_at, capacity=1
    )
    event.capacity = 1
    event.save()
    for target in (event, other):
        register(target.id, "a@x.io", "Ann")
    register(other.id, "w@x.io", "W")

    assert register(event.id, "b@x.io", "Bob").position == 1


def test_register_for_an_unknown_event_raises(event: Event) -> None:
    with pytest.raises(Event.DoesNotExist):
        register(event.id + 1, "a@x.io", "Ann")


def test_same_email_may_register_for_different_events(event: Event) -> None:
    other = Event.objects.create(
        organizer=event.organizer, title="Other", starts_at=event.starts_at, capacity=1
    )

    register(event.id, "a@x.io", "Ann")

    assert register(other.id, "a@x.io", "Ann").created is True


def registration_fields(event: Event, **overrides: Any) -> dict[str, Any]:
    return {"event": event, "email": "a@x.io", "name": "Ann", "status": "confirmed"} | overrides


def test_database_rejects_a_second_registration_with_the_same_email(event: Event) -> None:
    Registration.objects.create(**registration_fields(event))

    with pytest.raises(IntegrityError), transaction.atomic():
        Registration.objects.create(**registration_fields(event))


def test_database_rejects_an_unknown_status(event: Event) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        Registration.objects.create(**registration_fields(event, status="gone"))
