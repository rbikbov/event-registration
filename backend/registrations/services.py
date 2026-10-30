from dataclasses import dataclass
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from events.models import Event
from registrations.models import Registration


class EventFull(Exception):
    """The event has no free seats."""


@dataclass(frozen=True)
class RegisterResult:
    registration: Registration
    created: bool


def register(
    event_id: int, email: str, name: str, *, now: datetime | None = None
) -> RegisterResult:
    """Register an email for an event; a repeat returns the existing registration.

    The event row is locked for the whole transaction, so registrations for one event run one
    after another: two requests cannot take the same last seat or insert the same email twice.
    Raises Event.DoesNotExist for an unknown event and EventFull when no seat is left.
    """
    now = now or timezone.now()
    email = email.strip().lower()
    with transaction.atomic():
        event = Event.objects.select_for_update().get(pk=event_id)
        existing = Registration.objects.filter(event=event, email=email).first()
        if existing is not None:
            return RegisterResult(existing, created=False)
        taken = Registration.objects.filter(
            event=event, status=Registration.Status.CONFIRMED
        ).count()
        if taken >= event.capacity:
            raise EventFull
        registration = Registration.objects.create(
            event=event,
            email=email,
            name=name,
            status=Registration.Status.CONFIRMED,
            queued_at=now,
            confirmed_at=now,
        )
        return RegisterResult(registration, created=True)
