from dataclasses import dataclass
from datetime import datetime

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from events.models import Event
from registrations.models import Registration


@dataclass(frozen=True)
class RegisterResult:
    registration: Registration
    created: bool
    position: int | None


def waitlist_position(registration: Registration) -> int | None:
    """1-based place in the event's waitlist; None unless the registration is waitlisted.

    Counted, not stored: a cancellation would otherwise have to renumber the whole queue.
    """
    if registration.status != Registration.Status.WAITLISTED:
        return None
    return Registration.objects.filter(
        Q(queued_at__lt=registration.queued_at)
        | Q(queued_at=registration.queued_at, id__lte=registration.id),
        event_id=registration.event_id,
        status=Registration.Status.WAITLISTED,
    ).count()


def register(
    event_id: int, email: str, name: str, *, now: datetime | None = None
) -> RegisterResult:
    """Register an email for an event; a repeat returns the existing registration.

    A new registration is confirmed while seats remain, otherwise it joins the waitlist.

    The event row is locked for the whole transaction, so registrations for one event run one
    after another: two requests cannot take the same last seat or insert the same email twice.
    Raises Event.DoesNotExist for an unknown event.
    """
    now = now or timezone.now()
    email = email.strip().lower()
    with transaction.atomic():
        event = Event.objects.select_for_update().get(pk=event_id)
        existing = Registration.objects.filter(event=event, email=email).first()
        if existing is not None:
            return RegisterResult(existing, created=False, position=waitlist_position(existing))
        taken = Registration.objects.filter(
            event=event, status=Registration.Status.CONFIRMED
        ).count()
        confirmed = taken < event.capacity
        registration = Registration.objects.create(
            event=event,
            email=email,
            name=name,
            status=Registration.Status.CONFIRMED if confirmed else Registration.Status.WAITLISTED,
            queued_at=now,
            confirmed_at=now if confirmed else None,
        )
        return RegisterResult(registration, created=True, position=waitlist_position(registration))
