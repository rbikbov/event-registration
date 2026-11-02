from datetime import UTC, datetime, timedelta

import pytest
from django.test import override_settings

from accounts.models import User
from emails.models import OutboxEmail
from events.models import Event
from registrations.models import Registration
from registrations.services import cancel, enqueue_reminders, register, update_event

pytestmark = pytest.mark.django_db

# The pass runs at NOW; the event starts in 12 hours, so its 24-hour window is open.
NOW = datetime(2030, 5, 17, 6, 0, tzinfo=UTC)
STARTS_AT = NOW + timedelta(hours=12)
# A seat taken two days before: before the window opened.
EARLY = NOW - timedelta(days=2)


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer, title="Meetup", starts_at=STARTS_AT, capacity=2
    )


def reminders() -> list[OutboxEmail]:
    return list(OutboxEmail.objects.filter(kind=OutboxEmail.Kind.REMINDER).order_by("to"))


@override_settings(FRONTEND_URL="https://events.example")
def test_open_window_reminds_each_seat_once(event: Event) -> None:
    ann = register(event.id, "a@x.io", "Ann", now=EARLY).registration
    bob = register(event.id, "b@x.io", "Bob", now=EARLY).registration

    assert enqueue_reminders(now=NOW) == 2
    assert enqueue_reminders(now=NOW + timedelta(minutes=1)) == 0

    to_ann, to_bob = reminders()
    assert (to_ann.to, to_bob.to) == ("a@x.io", "b@x.io")
    assert to_ann.dedup_key == f"reminder:{ann.id}:1"
    assert to_ann.subject == "Напоминание: Meetup"
    assert "17.05.2030 18:00 UTC" in to_ann.body
    # Not "in a day": the pass also runs late in the window (a reschedule into it, a worker
    # catching up), so the email states the date only.
    assert "сутки" not in to_ann.body
    assert ann.ticket_code in to_ann.body
    assert f"https://events.example/tickets/{ann.manage_token}" in to_ann.body
    assert bob.ticket_code in to_bob.body


def test_window_not_open_yet_reminds_nobody(event: Event) -> None:
    register(event.id, "a@x.io", "Ann", now=EARLY)

    assert enqueue_reminders(now=STARTS_AT - timedelta(hours=24, seconds=1)) == 0
    # The window opens exactly 24 hours before the start.
    assert enqueue_reminders(now=STARTS_AT - timedelta(hours=24)) == 1


def test_seat_taken_inside_the_window_gets_no_reminder(event: Event) -> None:
    # Not a second before the window: the seat came with a ticket email just now.
    register(event.id, "a@x.io", "Ann", now=STARTS_AT - timedelta(hours=24))
    register(event.id, "b@x.io", "Bob", now=NOW - timedelta(hours=1))

    assert enqueue_reminders(now=NOW) == 0


def test_waitlisted_cancelled_and_promoted_inside_the_window_get_no_reminder(
    event: Event,
) -> None:
    ann = register(event.id, "a@x.io", "Ann", now=EARLY).registration
    register(event.id, "b@x.io", "Bob", now=EARLY)
    register(event.id, "c@x.io", "Cid", now=EARLY)
    dan = register(event.id, "d@x.io", "Dan", now=EARLY).registration
    # Ann's seat goes to Cid, the waitlist head, inside the window; Dan still waits.
    cancel(ann.manage_token, now=NOW - timedelta(hours=1))
    dan.refresh_from_db()
    assert dan.status == Registration.Status.WAITLISTED

    assert enqueue_reminders(now=NOW) == 1
    assert [email.to for email in reminders()] == ["b@x.io"]


def test_started_event_gets_no_reminder(event: Event) -> None:
    register(event.id, "a@x.io", "Ann", now=EARLY)

    assert enqueue_reminders(now=STARTS_AT) == 0


def test_reschedule_brings_a_reminder_about_the_new_date(event: Event) -> None:
    register(event.id, "a@x.io", "Ann", now=EARLY)
    enqueue_reminders(now=NOW)
    new_start = STARTS_AT + timedelta(hours=6)

    update_event(event.id, {"starts_at": new_start}, now=NOW)

    assert enqueue_reminders(now=NOW) == 1
    old, new = sorted(reminders(), key=lambda email: email.dedup_key)
    assert (old.dedup_key[-2:], new.dedup_key[-2:]) == (":1", ":2")
    assert "18.05.2030 00:00 UTC" in new.body


def test_reschedule_out_of_the_window_waits_for_the_new_one(event: Event) -> None:
    register(event.id, "a@x.io", "Ann", now=EARLY)
    new_start = STARTS_AT + timedelta(days=3)

    update_event(event.id, {"starts_at": new_start}, now=NOW)

    assert enqueue_reminders(now=NOW) == 0
    assert enqueue_reminders(now=new_start - timedelta(hours=1)) == 1
