import smtplib
import socket
from collections.abc import Callable, Iterator, Sequence
from datetime import datetime, timedelta

import pytest
from django.core import mail
from django.core.mail import EmailMessage
from django.core.mail.backends import smtp
from django.core.mail.backends.locmem import EmailBackend
from django.db.models import Max
from django.test import override_settings
from django.utils import timezone

from accounts.models import User
from emails.models import OutboxEmail
from emails.services import BATCH_SIZE, MAX_ATTEMPTS, enqueue_email, process_batch
from events.models import Event
from registrations.models import Registration

pytestmark = pytest.mark.django_db


def smtp_refusal(address: str) -> Exception:
    return smtplib.SMTPRecipientsRefused({address: (550, b"No such user")})


class RefusingBackend(EmailBackend):
    """The locmem backend that refuses the addresses in `refused`, as an SMTP server would."""

    refused: frozenset[str] = frozenset()
    error: Callable[[str], Exception] = staticmethod(smtp_refusal)

    def send_messages(self, messages: Sequence[EmailMessage]) -> int:
        for message in messages:
            for address in message.to:
                if address in self.refused:
                    raise self.error(address)
        return super().send_messages(messages)


Refuse = Callable[..., None]


@pytest.fixture
def refuse(monkeypatch: pytest.MonkeyPatch) -> Iterator[Refuse]:
    """Make the mail backend refuse the given addresses: `refuse("a@x.io")`; `refuse()` stops.

    `error=` makes the refusal another exception than the SMTP one.
    """

    def refuse_addresses(*addresses: str, error: Callable[[str], Exception] = smtp_refusal) -> None:
        monkeypatch.setattr(RefusingBackend, "refused", frozenset(addresses))
        monkeypatch.setattr(RefusingBackend, "error", staticmethod(error))

    with override_settings(EMAIL_BACKEND=f"{__name__}.RefusingBackend"):
        yield refuse_addresses


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=100,
    )


def queue_ticket(event: Event, email: str) -> OutboxEmail:
    registration = Registration.objects.create(
        event=event, email=email, name="Ann", status=Registration.Status.CONFIRMED
    )
    enqueue_email(OutboxEmail.Kind.TICKET, registration)
    return OutboxEmail.objects.get(registration=registration)


def due() -> datetime:
    """The latest queuing time: every queued email is due by it.

    Not the clock now: the wall clock may step back (WSL2 does by about 0.4 s every 30 s), and
    the emails queued before the step are then not due yet.
    """
    latest: datetime = OutboxEmail.objects.aggregate(latest=Max("next_attempt_at"))["latest"]
    return latest


def queue_in_order(event: Event, addresses: Sequence[str]) -> list[OutboxEmail]:
    """Queue tickets a millisecond apart, in the order given: the test, not the clock, sets it."""
    queued = [queue_ticket(event, address) for address in addresses]
    start = due()
    for i, email in enumerate(queued):
        email.next_attempt_at = start + timedelta(milliseconds=i)
        email.save(update_fields=["next_attempt_at"])
    return queued


def test_pending_email_is_sent_and_marked_sent(event: Event) -> None:
    queued = queue_ticket(event, "a@x.io")
    now = due()

    sent = process_batch(now=now)

    assert sent == [queued.id]
    [message] = mail.outbox
    assert message.to == ["a@x.io"]
    assert message.subject == queued.subject
    assert message.body == queued.body
    queued.refresh_from_db()
    assert queued.status == OutboxEmail.Status.SENT
    assert queued.sent_at == now


def test_sent_email_is_not_sent_again(event: Event) -> None:
    queue_ticket(event, "a@x.io")
    process_batch(now=due())

    assert process_batch(now=due()) == []
    assert len(mail.outbox) == 1


def test_email_waits_for_its_next_attempt(event: Event) -> None:
    queued = queue_ticket(event, "a@x.io")
    queued.next_attempt_at = timezone.now() + timedelta(minutes=1)
    queued.save()

    assert process_batch() == []
    assert mail.outbox == []


def test_batch_takes_the_oldest_due_emails_up_to_its_size(event: Event) -> None:
    queued = queue_in_order(event, [f"u{i}@x.io" for i in range(BATCH_SIZE + 1)])

    sent = process_batch(now=due())

    assert sent == [email.id for email in queued[:BATCH_SIZE]]
    assert process_batch(now=due()) == [queued[-1].id]


def test_event_title_with_line_breaks_is_sent_with_a_one_line_subject(event: Event) -> None:
    # A line break in a header makes Django refuse the whole message.
    event.title = "Meetup\r\nafter work"
    event.save()
    queue_ticket(event, "a@x.io")

    process_batch(now=due())

    [message] = mail.outbox
    assert message.subject == "Билет: Meetup after work"


def test_failed_send_is_retried_later(event: Event, refuse: Refuse) -> None:
    refuse("a@x.io")
    queued = queue_ticket(event, "a@x.io")
    now = due()

    assert process_batch(now=now) == []

    queued.refresh_from_db()
    assert queued.status == OutboxEmail.Status.PENDING
    assert queued.attempts == 1
    assert queued.next_attempt_at == now + timedelta(seconds=30)
    assert queued.last_error.startswith("SMTPRecipientsRefused")
    assert queued.sent_at is None
    # Not due yet.
    assert process_batch(now=now + timedelta(seconds=29)) == []


def test_pause_between_attempts_doubles_and_the_last_attempt_fails_the_email(
    event: Event,
    refuse: Refuse,
) -> None:
    refuse("a@x.io")
    queued = queue_ticket(event, "a@x.io")
    now = due()
    pauses = []

    for _ in range(MAX_ATTEMPTS - 1):
        process_batch(now=now)
        queued.refresh_from_db()
        pauses.append(queued.next_attempt_at - now)
        now = queued.next_attempt_at
    process_batch(now=now)

    assert pauses == [timedelta(seconds=s) for s in (30, 60, 120, 240)]
    queued.refresh_from_db()
    assert queued.status == OutboxEmail.Status.FAILED
    assert queued.attempts == MAX_ATTEMPTS
    assert process_batch(now=now + timedelta(days=1)) == []
    assert mail.outbox == []


def test_email_is_sent_when_the_server_accepts_it_again(event: Event, refuse: Refuse) -> None:
    refuse("a@x.io")
    queued = queue_ticket(event, "a@x.io")
    now = due()
    process_batch(now=now)

    refuse()
    later = now + timedelta(seconds=30)

    assert process_batch(now=later) == [queued.id]
    queued.refresh_from_db()
    assert queued.status == OutboxEmail.Status.SENT
    assert queued.sent_at == later
    assert len(mail.outbox) == 1


def invalid_address(address: str) -> Exception:
    return ValueError(f'Invalid address "{address}"')


# Not only SMTP errors: a bug that rolled the batch back would resend the emails already sent.
@pytest.mark.parametrize("error", [smtp_refusal, invalid_address])
def test_failed_email_does_not_stop_the_batch(
    event: Event, refuse: Refuse, error: Callable[[str], Exception]
) -> None:
    refuse("bad@x.io", error=error)
    first, bad, last = queue_in_order(event, ["a@x.io", "bad@x.io", "b@x.io"])

    assert process_batch(now=due()) == [first.id, last.id]

    assert [m.to for m in mail.outbox] == [["a@x.io"], ["b@x.io"]]
    statuses = dict(OutboxEmail.objects.values_list("id", "status"))
    assert statuses == {
        first.id: OutboxEmail.Status.SENT,
        bad.id: OutboxEmail.Status.PENDING,
        last.id: OutboxEmail.Status.SENT,
    }


def test_failure_is_logged_with_the_email_id_and_error_class_only(
    event: Event,
    refuse: Refuse,
    caplog: pytest.LogCaptureFixture,
) -> None:
    refuse("secret@x.io")
    queued = queue_ticket(event, "secret@x.io")

    process_batch(now=due())

    [record] = caplog.records
    assert record.levelname == "WARNING"
    assert str(queued.id) in caplog.text
    assert "SMTPRecipientsRefused" in caplog.text
    assert "secret@x.io" not in caplog.text


def test_bug_is_logged_as_an_error_with_the_stack_but_not_the_message(
    event: Event,
    refuse: Refuse,
    caplog: pytest.LogCaptureFixture,
) -> None:
    # A failing network is expected; a failing code needs the place it failed at.
    refuse("secret@x.io", error=invalid_address)
    queued = queue_ticket(event, "secret@x.io")

    process_batch(now=due())

    [record] = caplog.records
    assert record.levelname == "ERROR"
    assert str(queued.id) in caplog.text
    assert "ValueError" in caplog.text
    assert "in send_messages" in caplog.text
    assert "secret@x.io" not in caplog.text
    assert "Invalid address" not in caplog.text


def test_smtp_backend_does_not_wait_forever() -> None:
    # Without a timeout a server that accepts and stays silent holds the batch and its row locks.
    assert smtp.EmailBackend().timeout is not None


def test_silent_smtp_server_is_retried_like_a_refusal(event: Event) -> None:
    # The kernel accepts the connection into the backlog; nobody ever sends the greeting.
    with socket.create_server(("127.0.0.1", 0)) as server:
        port = server.getsockname()[1]
        queued = queue_ticket(event, "a@x.io")
        with override_settings(
            EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
            EMAIL_HOST="127.0.0.1",
            EMAIL_PORT=port,
            EMAIL_TIMEOUT=0.2,
        ):
            assert process_batch(now=due()) == []

    queued.refresh_from_db()
    assert queued.status == OutboxEmail.Status.PENDING
    assert queued.attempts == 1
    assert queued.last_error.endswith("timed out")
