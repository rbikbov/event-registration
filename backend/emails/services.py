from datetime import UTC

from django.conf import settings
from django.template.loader import render_to_string

from emails.models import OutboxEmail
from registrations.models import Registration

SUBJECTS = {
    OutboxEmail.Kind.TICKET: "Билет: {title}",
}


def enqueue_email(kind: OutboxEmail.Kind, registration: Registration) -> None:
    """Queue an email about a registration change; call it in the transaction of that change.

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
    }
    email = OutboxEmail(
        kind=kind,
        registration=registration,
        dedup_key=f"{kind}:{registration.id}:{registration.ticket_code}",
        to=registration.email,
        subject=SUBJECTS[kind].format(title=event.title),
        body=render_to_string(f"emails/{kind}.txt", context),
    )
    # ON CONFLICT DO NOTHING: the unique dedup_key keeps one email per change.
    OutboxEmail.objects.bulk_create([email], ignore_conflicts=True)
