from datetime import UTC, datetime
from typing import Literal

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from emails.models import OutboxEmail
from registrations.models import Registration

BATCH_SIZE = 20

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
    """
    with transaction.atomic():
        now = now or timezone.now()
        emails = list(
            OutboxEmail.objects.select_for_update(skip_locked=True)
            .filter(status=OutboxEmail.Status.PENDING, next_attempt_at__lte=now)
            .order_by("next_attempt_at", "id")[:BATCH_SIZE]
        )
        if not emails:
            return []
        # One SMTP connection for the whole batch.
        with get_connection() as connection:
            for email in emails:
                EmailMessage(email.subject, email.body, to=[email.to], connection=connection).send()
                email.status = OutboxEmail.Status.SENT
                email.sent_at = now
                email.save(update_fields=["status", "sent_at"])
        return [email.id for email in emails]
