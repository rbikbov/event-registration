from django.core.exceptions import PermissionDenied
from django.db.models import QuerySet
from django.http import Http404

from accounts.models import User
from events.models import Event


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
