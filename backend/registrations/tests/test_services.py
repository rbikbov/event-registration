from datetime import timedelta
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import User
from events.models import Event
from registrations.models import Registration
from registrations.services import EventFull, register

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


def test_register_raises_when_no_seats_are_left(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")

    with pytest.raises(EventFull):
        register(event.id, "c@x.io", "Cid")

    assert Registration.objects.filter(status=Registration.Status.CONFIRMED).count() == 2


def test_repeat_on_a_full_event_returns_the_existing_registration(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")

    assert register(event.id, "a@x.io", "Ann").created is False


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
