from datetime import UTC, timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from emails.models import OutboxEmail
from events.models import Event
from registrations.models import Registration
from registrations.services import cancel, register, update_event

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
