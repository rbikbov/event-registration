from dataclasses import dataclass
from datetime import datetime

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from emails.models import OutboxEmail
from emails.services import enqueue_email, enqueue_waitlisted
from events.models import Event
from registrations.models import Registration, new_ticket_code


@dataclass(frozen=True)
class RegisterResult:
    registration: Registration
    created: bool
    position: int | None


@dataclass(frozen=True)
class Ticket:
    registration: Registration
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
    A seat comes with a ticket email, the waitlist with one that has the position; it is queued
    in the same transaction, the worker sends it.
    A cancelled registration is revived: seat or waitlist is decided anew, the ticket code is
    reissued and the place in the queue is the end of it.

    The event row is locked for the whole transaction, so registrations for one event run one
    after another: two requests cannot take the same last seat or insert the same email twice.
    The queue order is the order of the locks.
    Raises Event.DoesNotExist for an unknown event.
    """
    email = email.strip().lower()
    with transaction.atomic():
        event = Event.objects.select_for_update().get(pk=event_id)
        # Read after the lock: a time taken before it lets a later request queue ahead of an
        # earlier one and shifts the positions already reported.
        now = now or timezone.now()
        existing = Registration.objects.filter(event=event, email=email).first()
        if existing is not None and existing.status != Registration.Status.CANCELLED:
            return RegisterResult(existing, created=False, position=waitlist_position(existing))
        confirmed = _confirmed_count(event) < event.capacity
        status = Registration.Status.CONFIRMED if confirmed else Registration.Status.WAITLISTED
        confirmed_at = now if confirmed else None
        if existing is None:
            registration = Registration.objects.create(
                event=event,
                email=email,
                name=name,
                status=status,
                queued_at=now,
                confirmed_at=confirmed_at,
            )
        else:
            registration = existing
            registration.name = name
            registration.status = status
            registration.queued_at = now
            registration.confirmed_at = confirmed_at
            registration.cancelled_at = None
            registration.ticket_code = new_ticket_code()
            registration.save()
        position = waitlist_position(registration)
        # No position is a seat: waitlist_position counts only the waitlisted.
        if position is None:
            enqueue_email(OutboxEmail.Kind.TICKET, registration)
        else:
            enqueue_waitlisted(registration, position)
        return RegisterResult(registration, created=True, position=position)


def cancel(manage_token: str, *, now: datetime | None = None) -> Registration:
    """Cancel a registration by its manage token; a cancelled seat goes to the waitlist head.

    The promoted one gets an email with the ticket code, queued in the same transaction.
    Cancelling twice, or cancelling from the waitlist, promotes nobody. Raises
    Registration.DoesNotExist for an unknown token.
    """
    with transaction.atomic():
        event_id = Registration.objects.values_list("event_id", flat=True).get(
            manage_token=manage_token
        )
        # The status is read only after the lock: a concurrent cancel or promotion changes it.
        Event.objects.select_for_update().get(pk=event_id)
        # After the lock, like in `register`: the promotion time is when it really happened.
        now = now or timezone.now()
        registration = Registration.objects.get(manage_token=manage_token)
        if registration.status == Registration.Status.CANCELLED:
            return registration
        was_confirmed = registration.status == Registration.Status.CONFIRMED
        registration.status = Registration.Status.CANCELLED
        registration.cancelled_at = now
        registration.save()
        if was_confirmed:
            _promote_first_waitlisted(event_id, now)
        return registration


def get_ticket(manage_token: str) -> Ticket:
    """The registration behind a manage token, with its event and waitlist place.

    A plain read without the event lock: nothing is decided from it, and the lock would queue
    it behind registrations. A promotion between the two queries leaves a stale position
    (0 for the promoted one itself) until the next read.
    Raises Registration.DoesNotExist for an unknown token.
    """
    registration = Registration.objects.select_related("event").get(manage_token=manage_token)
    return Ticket(registration, position=waitlist_position(registration))


def _confirmed_count(event: Event) -> int:
    return Registration.objects.filter(event=event, status=Registration.Status.CONFIRMED).count()


def _promote_first_waitlisted(event_id: int, now: datetime) -> None:
    first = (
        Registration.objects.filter(event_id=event_id, status=Registration.Status.WAITLISTED)
        .order_by("queued_at", "id")
        .first()
    )
    if first is not None:
        first.status = Registration.Status.CONFIRMED
        first.confirmed_at = now
        first.save()
        enqueue_email(OutboxEmail.Kind.PROMOTED, first)
