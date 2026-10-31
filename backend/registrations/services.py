from dataclasses import dataclass
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Case, F, Max, Q, QuerySet, When, Window
from django.db.models.functions import RowNumber
from django.utils import timezone

from emails.models import OutboxEmail
from emails.services import enqueue_email, enqueue_waitlisted
from events.models import Event
from events.realtime import notify_stats_changed
from registrations.models import Registration, new_ticket_code


@dataclass(frozen=True)
class RegisterResult:
    registration: Registration
    created: bool
    position: int | None


@dataclass(frozen=True)
class CheckInResult:
    registration: Registration
    already_checked_in: bool


class TicketNotConfirmed(Exception):
    """The ticket is on the waitlist or cancelled: it lets nobody in."""


class TicketCheckedIn(Exception):
    """The ticket has let its holder in: the seat is taken and cannot be given up."""


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
    reissued and the place in the queue is the end of it. A new or revived registration
    notifies the event's stats stream, a repeat does not.

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
        queued_at = _queue_time(event, now)
        confirmed = _confirmed_count(event) < event.capacity
        status = Registration.Status.CONFIRMED if confirmed else Registration.Status.WAITLISTED
        confirmed_at = now if confirmed else None
        if existing is None:
            registration = Registration.objects.create(
                event=event,
                email=email,
                name=name,
                status=status,
                queued_at=queued_at,
                confirmed_at=confirmed_at,
            )
        else:
            registration = existing
            registration.name = name
            registration.status = status
            registration.queued_at = queued_at
            registration.confirmed_at = confirmed_at
            registration.cancelled_at = None
            registration.ticket_code = new_ticket_code()
            registration.save()
        notify_stats_changed(event.id)
        position = waitlist_position(registration)
        # No position is a seat: waitlist_position counts only the waitlisted.
        if position is None:
            enqueue_email(OutboxEmail.Kind.TICKET, registration)
        else:
            enqueue_waitlisted(registration, position)
        return RegisterResult(registration, created=True, position=position)


def _queue_time(event: Event, now: datetime) -> datetime:
    """`now`, or just after the event's latest queue time if `now` is not later than it.

    Call it under the event lock. The wall clock may step back between two requests (NTP, a VM
    clock sync); a later request would then queue ahead of an earlier one.
    """
    latest: datetime | None = Registration.objects.filter(event=event).aggregate(
        latest=Max("queued_at")
    )["latest"]
    if latest is None or now > latest:
        return now
    return latest + timedelta(microseconds=1)


def cancel(manage_token: str, *, now: datetime | None = None) -> Registration:
    """Cancel a registration by its manage token; a cancelled seat goes to the waitlist head.

    The promoted one gets an email with the ticket code, queued in the same transaction.
    Cancelling twice, or cancelling from the waitlist, promotes nobody. A cancellation notifies
    the event's stats stream, a repeat does not. Raises
    Registration.DoesNotExist for an unknown token and TicketCheckedIn for a checked-in ticket.
    """
    with transaction.atomic():
        event_id = Registration.objects.values_list("event_id", flat=True).get(
            manage_token=manage_token
        )
        # The status is read only after the lock: a concurrent cancel or promotion changes it.
        Event.objects.select_for_update().get(pk=event_id)
        # After the lock, like in `register`: the promotion time is when it really happened.
        now = now or timezone.now()
        # The row lock too: `check_in` takes no event lock, only the row, so without it a check-in
        # committed between this read and the save would be overwritten by the cancellation.
        registration = Registration.objects.select_for_update().get(manage_token=manage_token)
        if registration.status == Registration.Status.CANCELLED:
            return registration
        if registration.checked_in_at is not None:
            raise TicketCheckedIn
        was_confirmed = registration.status == Registration.Status.CONFIRMED
        registration.status = Registration.Status.CANCELLED
        registration.cancelled_at = now
        registration.save()
        if was_confirmed:
            _promote_first_waitlisted(event_id, now)
        # One notification with the promotion: the subscribers read the counts after both.
        notify_stats_changed(event_id)
        return registration


def check_in(event_id: int, code: str, *, now: datetime | None = None) -> CheckInResult:
    """Mark the confirmed ticket with `code` at the event as checked in.

    One conditional UPDATE: it locks the row, so of concurrent requests with one code only the
    first passes the WHERE; the others wait for its commit, read the row and report a repeat
    with the time of the first check-in. The code is taken as typed at the entrance: any case,
    spaces and dashes. The first check-in notifies the event's stats stream, a repeat does not:
    the counts are the same. Raises Registration.DoesNotExist when the event has no such ticket and
    TicketNotConfirmed for a waitlisted or cancelled one.
    """
    code = "".join(code.split()).replace("-", "").upper()
    now = now or timezone.now()
    tickets = Registration.objects.filter(event_id=event_id, ticket_code=code)
    with transaction.atomic():
        marked = tickets.filter(
            status=Registration.Status.CONFIRMED, checked_in_at__isnull=True
        ).update(checked_in_at=now)
        registration = tickets.get()
        # Decided by the field the UPDATE checked, not by the status: a promotion committed
        # between the two queries shows a confirmed ticket that is still not checked in.
        # A checked-in ticket is always confirmed (CHECK in the database).
        if not marked and registration.checked_in_at is None:
            raise TicketNotConfirmed
        if marked:
            notify_stats_changed(event_id)
        return CheckInResult(registration, already_checked_in=not marked)


PAGE_SIZE = 50


def event_registrations(
    event_id: int, status: str | None = None, page: int = 1
) -> QuerySet[Registration]:
    """A page of the event's registrations in queue order, all or of one `status`.

    For the organizer, PAGE_SIZE a page from 1; past the end, an empty one. A waitlisted
    registration has its `position`, the others None: numbered in the same query by a window
    over the waitlist, in the order waitlist_position counts. The status filter is applied
    before the window, and the page after it: the numbers on a page go on from the previous.
    """
    queue_order = (F("queued_at").asc(), F("id").asc())
    registrations = Registration.objects.filter(event_id=event_id)
    if status is not None:
        registrations = registrations.filter(status=status)
    return registrations.annotate(
        position=Case(
            When(
                status=Registration.Status.WAITLISTED,
                then=Window(RowNumber(), partition_by=F("status"), order_by=queue_order),
            )
        )
    ).order_by(*queue_order)[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]


def mask_email(email: str) -> str:
    """`iv***@gmail.com`: enough to tell two people of one name apart at the entrance."""
    mailbox, _, domain = email.partition("@")
    shown = 2 if len(mailbox) > 2 else 1
    return f"{mailbox[:shown]}***@{domain}"


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
