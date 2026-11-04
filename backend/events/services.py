from dataclasses import dataclass
from typing import Literal

from django.core.exceptions import PermissionDenied
from django.db.models import QuerySet
from django.http import Http404

from accounts.models import User
from events.models import Event, EventQuerySet

EVENTS_PAGE_SIZE = 20

Period = Literal["upcoming", "past"]
PERIODS: tuple[Period, ...] = ("upcoming", "past")


@dataclass(frozen=True)
class EventPage:
    count: int
    results: list[Event]


def event_page(events: EventQuerySet, period: Period, page: int) -> EventPage:
    """A page of `events` from 1, upcoming or past, with their registration counts and the
    number of events of the period; past the end, no events and the same count.
    """
    events = events.upcoming() if period == "upcoming" else events.past()
    start = (page - 1) * EVENTS_PAGE_SIZE
    rows = events.with_registration_counts()[start : start + EVENTS_PAGE_SIZE]
    return EventPage(count=events.count(), results=list(rows))


def get_org_event(user: User, event_id: int, queryset: QuerySet[Event] | None = None) -> Event:
    """The event by id if `user` organizes it: Http404 if there is none, PermissionDenied
    if it is someone else's. Existence is no secret, the public API shows any event by id.

    `queryset` adds annotations to the same query, such as the registration counts.
    """
    if queryset is None:
        queryset = Event.objects.all()
    try:
        event = queryset.get(pk=event_id)
    except Event.DoesNotExist:
        raise Http404 from None
    if event.organizer_id != user.id:
        raise PermissionDenied
    return event
