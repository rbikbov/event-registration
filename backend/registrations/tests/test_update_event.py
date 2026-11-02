from datetime import UTC, timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from emails.models import OutboxEmail
from events.models import Event
from registrations.models import Registration
from registrations.services import CapacityBelowConfirmed, cancel, register, update_event

pytestmark = pytest.mark.django_db


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=1,
    )


def rescheduled() -> list[OutboxEmail]:
    return list(OutboxEmail.objects.filter(kind=OutboxEmail.Kind.RESCHEDULED).order_by("to"))


def test_reschedule_emails_confirmed_and_waitlisted_and_bumps_the_version(event: Event) -> None:
    seat = register(event.id, "a@x.io", "Ann").registration
    waiting = register(event.id, "b@x.io", "Bob").registration
    gone = register(event.id, "c@x.io", "Cid").registration
    cancel(gone.manage_token)
    old_start = event.starts_at
    new_start = old_start + timedelta(days=1)

    updated = update_event(event.id, {"starts_at": new_start})

    assert (updated.starts_at, updated.schedule_version) == (new_start, 2)
    event.refresh_from_db()
    assert (event.starts_at, event.schedule_version) == (new_start, 2)
    to_seat, to_waiting = rescheduled()
    assert (to_seat.to, to_waiting.to) == ("a@x.io", "b@x.io")
    assert to_seat.dedup_key == f"rescheduled:{seat.id}:2"
    assert seat.ticket_code in to_seat.body
    # The waitlist email has no code and no position: the position goes stale, the link does not.
    assert waiting.ticket_code not in to_waiting.body
    assert "№" not in to_waiting.body
    old = old_start.astimezone(UTC).strftime("%d.%m.%Y %H:%M UTC")
    new = new_start.astimezone(UTC).strftime("%d.%m.%Y %H:%M UTC")
    for email in (to_seat, to_waiting):
        assert email.subject == "Событие перенесено: Meetup"
        assert old in email.body
        assert new in email.body
    assert f"/tickets/{seat.manage_token}" in to_seat.body
    assert f"/tickets/{waiting.manage_token}" in to_waiting.body


def test_the_same_start_changes_neither_the_version_nor_emails(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")

    updated = update_event(event.id, {"starts_at": event.starts_at})

    assert updated.schedule_version == 1
    assert rescheduled() == []


def test_each_reschedule_emails_again(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")

    update_event(event.id, {"starts_at": event.starts_at + timedelta(days=1)})
    update_event(event.id, {"starts_at": event.starts_at + timedelta(days=2)})

    assert [e.dedup_key.rsplit(":", 1)[1] for e in rescheduled()] == ["2", "3"]
    assert Registration.objects.get().status == Registration.Status.CONFIRMED


def test_unknown_event_raises(event: Event) -> None:
    with pytest.raises(Event.DoesNotExist):
        update_event(event.id + 1, {"starts_at": event.starts_at})


def statuses(event: Event) -> dict[str, str]:
    return dict(Registration.objects.filter(event=event).values_list("email", "status"))


def promoted() -> list[str]:
    return list(
        OutboxEmail.objects.filter(kind=OutboxEmail.Kind.PROMOTED)
        .order_by("id")
        .values_list("to", flat=True)
    )


def test_title_and_description_change_without_emails(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")

    updated = update_event(event.id, {"title": "Renamed", "description": "New room"})

    assert (updated.title, updated.description, updated.schedule_version) == (
        "Renamed",
        "New room",
        1,
    )
    event.refresh_from_db()
    assert (event.title, event.description) == ("Renamed", "New room")
    assert OutboxEmail.objects.exclude(kind=OutboxEmail.Kind.TICKET).count() == 0


def test_larger_capacity_promotes_the_waitlist_head_in_order(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    for email in ("b@x.io", "c@x.io", "d@x.io"):
        register(event.id, email, "W")

    update_event(event.id, {"capacity": 3})

    assert statuses(event) == {
        "a@x.io": "confirmed",
        "b@x.io": "confirmed",
        "c@x.io": "confirmed",
        "d@x.io": "waitlisted",
    }
    assert promoted() == ["b@x.io", "c@x.io"]
    head = Registration.objects.get(email="b@x.io")
    assert head.confirmed_at is not None
    assert head.ticket_code in OutboxEmail.objects.get(to="b@x.io", kind="promoted").body


def test_capacity_beyond_the_waitlist_promotes_everyone_waiting(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")

    update_event(event.id, {"capacity": 10})

    assert set(statuses(event).values()) == {"confirmed"}
    assert promoted() == ["b@x.io"]


def test_capacity_below_confirmed_changes_nothing(event: Event) -> None:
    event.capacity = 3
    event.save()
    for email in ("a@x.io", "b@x.io"):
        register(event.id, email, "N")
    new_start = event.starts_at + timedelta(days=1)

    with pytest.raises(CapacityBelowConfirmed) as raised:
        update_event(event.id, {"capacity": 1, "title": "Renamed", "starts_at": new_start})

    assert raised.value.confirmed == 2
    event.refresh_from_db()
    assert (event.capacity, event.title, event.schedule_version) == (3, "Meetup", 1)
    assert rescheduled() == []


def test_capacity_down_to_confirmed_is_allowed_and_promotes_nobody(event: Event) -> None:
    event.capacity = 3
    event.save()
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")

    updated = update_event(event.id, {"capacity": 2})

    assert updated.capacity == 2
    assert promoted() == []
