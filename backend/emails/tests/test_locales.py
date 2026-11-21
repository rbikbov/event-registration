import re
from datetime import UTC, datetime

import pytest

from emails.models import OutboxEmail
from emails.services import email_time, render_email

CONTEXT = {
    "name": "Ann",
    "title": "Meetup",
    "starts_at": "17 May 2030 18:30 UTC",
    "old_starts_at": "16 May 2030 18:30 UTC",
    "ticket_code": "ABCD2345",
    "manage_url": "https://events.example/tickets/token",
    "position": 2,
    "confirmed": True,
}

SUBJECTS = {
    OutboxEmail.Kind.TICKET: "Ticket: Meetup",
    OutboxEmail.Kind.WAITLISTED: "Waitlist: Meetup",
    OutboxEmail.Kind.PROMOTED: "A seat became free: Meetup",
    OutboxEmail.Kind.RESCHEDULED: "Event rescheduled: Meetup",
    OutboxEmail.Kind.REMINDER: "Reminder: Meetup",
}


@pytest.mark.parametrize("kind", list(OutboxEmail.Kind))
def test_every_email_is_english(kind: OutboxEmail.Kind) -> None:
    subject, body = render_email(kind, CONTEXT)

    assert subject == SUBJECTS[kind]
    assert body.startswith("Hello, Ann!")
    assert "View or cancel your registration: https://events.example/tickets/token" in body
    assert not re.search("[\\u0400-\\u04ff]", subject + body)


@pytest.mark.parametrize("kind", list(OutboxEmail.Kind))
def test_the_russian_version_of_every_email_renders(kind: OutboxEmail.Kind) -> None:
    subject, body = render_email(kind, CONTEXT, "ru")

    assert subject.endswith(": Meetup")
    assert "https://events.example/tickets/token" in body


@pytest.mark.parametrize(
    ("locale", "expected"),
    [("en", "7 Jan 2031 09:05 UTC"), ("ru", "07.01.2031 09:05 UTC")],
)
def test_email_time_is_written_the_way_of_the_language(locale: str, expected: str) -> None:
    assert email_time(datetime(2031, 1, 7, 9, 5, tzinfo=UTC), locale) == expected
