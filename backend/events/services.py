from django.core.exceptions import PermissionDenied
from django.http import Http404

from accounts.models import User
from events.models import Event


def get_org_event(user: User, event_id: int) -> Event:
    """The event by id if `user` organizes it: Http404 if there is none, PermissionDenied
    if it is someone else's. Existence is no secret, the public API shows any event by id.
    """
    try:
        event = Event.objects.get(pk=event_id)
    except Event.DoesNotExist:
        raise Http404 from None
    if event.organizer_id != user.id:
        raise PermissionDenied
    return event
