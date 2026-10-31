import logging
import traceback
from datetime import UTC, datetime, timedelta
from typing import Literal

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from emails.models import OutboxEmail
from registrations.models import Registration

logger = logging.getLogger(__name__)

BATCH_SIZE = 20
# A failed email is tried again after 30 s, 60 s, 120 s, 240 s; the fifth failure is final.
MAX_ATTEMPTS = 5
FIRST_RETRY_DELAY = timedelta(seconds=30)

SUBJECTS = {
    OutboxEmail.Kind.TICKET: "Билет: {title}",
    OutboxEmail.Kind.WAITLISTED: "Лист ожидания: {title}",
    OutboxEmail.Kind.PROMOTED: "Освободилось место: {title}",
}


def enqueue_email(
    kind: Literal[OutboxEmail.Kind.TICKET, OutboxEmail.Kind.PROMOTED], registration: Registration
) -> None:
    """Queue an email about a seat, with the ticket code; call it in the transaction of the change.

    The waitlist email needs the position and has a function of its own, `enqueue_waitlisted`.
    """
    _enqueue(kind, registration, {})


def enqueue_waitlisted(registration: Registration, position: int) -> None:
    """Queue the waitlist email with the position the caller has just counted under the lock."""
    _enqueue(OutboxEmail.Kind.WAITLISTED, registration, {"position": position})


def _enqueue(kind: OutboxEmail.Kind, registration: Registration, extra: dict[str, object]) -> None:
    """Queue an email about a registration change.

    The text is rendered now, so it shows the state at the change. The key includes the ticket
    code: a repeat of the same change queues nothing, a revival after cancelling (new code)
    queues a new email.
    """
    event = registration.event
    context = {
        "name": registration.name,
        "title": event.title,
        # Events have no time zone of their own; the ticket page shows the browser's local time.
        "starts_at": event.starts_at.astimezone(UTC).strftime("%d.%m.%Y %H:%M UTC"),
        "ticket_code": registration.ticket_code,
        "manage_url": f"{settings.FRONTEND_URL}/tickets/{registration.manage_token}",
        **extra,
    }
    email = OutboxEmail(
        kind=kind,
        registration=registration,
        dedup_key=f"{kind}:{registration.id}:{registration.ticket_code}",
        to=registration.email,
        # One line: a line break in a header makes Django refuse to send the message.
        subject=SUBJECTS[kind].format(title=" ".join(event.title.split())),
        body=render_to_string(f"emails/{kind}.txt", context),
    )
    # ON CONFLICT DO NOTHING: the unique dedup_key keeps one email per change.
    OutboxEmail.objects.bulk_create([email], ignore_conflicts=True)


def process_batch(*, now: datetime | None = None) -> list[int]:
    """Send up to BATCH_SIZE due pending emails; return the ids of the sent ones.

    The rows stay locked until the batch is committed, and SKIP LOCKED lets another worker take
    other rows meanwhile instead of waiting or sending the same email. Delivery is at least
    once: a crash after SMTP but before the commit sends the email again.

    An email that fails is retried later and does not stop the batch.
    """
    with transaction.atomic():
        now = now or timezone.now()
        emails = list(
            OutboxEmail.objects.select_for_update(skip_locked=True)
            .filter(status=OutboxEmail.Status.PENDING, next_attempt_at__lte=now)
            .order_by("next_attempt_at", "id")[:BATCH_SIZE]
        )
        sent = []
        for email in emails:
            # A connection per email: after an SMTP error a shared one may be left broken.
            try:
                EmailMessage(email.subject, email.body, to=[email.to]).send()
            # Any error, not only SMTP and network ones (OSError): a bug that rolled the batch
            # back would resend the emails already sent in it and never fail this one.
            except Exception as error:
                _record_failure(email, error, now)
                continue
            email.status = OutboxEmail.Status.SENT
            email.sent_at = now
            email.save(update_fields=["status", "sent_at"])
            sent.append(email.id)
        return sent


def _record_failure(email: OutboxEmail, error: Exception, now: datetime) -> None:
    email.attempts += 1
    email.last_error = f"{type(error).__name__}: {error}"
    if email.attempts >= MAX_ATTEMPTS:
        email.status = OutboxEmail.Status.FAILED
    else:
        email.next_attempt_at = now + FIRST_RETRY_DELAY * 2 ** (email.attempts - 1)
    email.save(update_fields=["attempts", "last_error", "status", "next_attempt_at"])
    # The class only: the error text may hold the address.
    args = (email.id, email.attempts, MAX_ATTEMPTS, type(error).__name__)
    if isinstance(error, OSError):  # SMTP and network errors; smtplib's are OSError too.
        logger.warning("Email %s not sent (attempt %s of %s): %s", *args)
    else:
        # A bug: the stack shows where it failed. Its frames hold code lines, not values, so
        # unlike the message they carry no address.
        stack = "".join(traceback.format_tb(error.__traceback__))
        logger.error("Email %s not sent (attempt %s of %s): %s\n%s", *args, stack)
