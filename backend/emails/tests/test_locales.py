from datetime import UTC, datetime

import pytest

from emails.models import OutboxEmail
from emails.services import email_time, render_email

# Every kind of email renders in both languages: the Russian ones are not sent until a language
# switch (docs/decisions.md, 2026-11-21 01:19), so this is what keeps them working.
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


@pytest.mark.parametrize("locale", ["en", "ru"])
@pytest.mark.parametrize("kind", list(OutboxEmail.Kind))
def test_every_email_renders_in_both_languages(kind: OutboxEmail.Kind, locale: str) -> None:
    subject, body = render_email(kind, CONTEXT, locale)

    assert subject.endswith(": Meetup")
    assert "Meetup" in body
    assert "https://events.example/tickets/token" in body


@pytest.mark.parametrize(
    ("locale", "expected"),
    [("en", "07 Jan 2031 09:05 UTC"), ("ru", "07.01.2031 09:05 UTC")],
)
def test_email_time_is_written_the_way_of_the_language(locale: str, expected: str) -> None:
    assert email_time(datetime(2031, 1, 7, 9, 5, tzinfo=UTC), locale) == expected
