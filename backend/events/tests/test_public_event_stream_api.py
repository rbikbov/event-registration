from datetime import timedelta

import pytest
from asgiref.sync import sync_to_async
from django.test import AsyncClient
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event
from events.tests.sse import SSE, next_message, registered, stream

# The stream runs in other threads with their own connections: the data must be committed.
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=5,
    )


def url(event_id: int) -> str:
    return f"/api/events/{event_id}/stream/"


async def test_stream_starts_with_the_event_as_its_get_has_it(event: Event) -> None:
    await sync_to_async(registered)(event.id, "a@x.io")
    detail = await sync_to_async(lambda: APIClient().get(f"/api/events/{event.id}/").json())()

    # No session: the event page is public.
    async with stream(AsyncClient(), url(event.id)) as response:
        assert response["Content-Type"] == "text/event-stream"
        assert response["Cache-Control"] == "no-cache"
        assert response["X-Accel-Buffering"] == "no"
        assert await next_message(response) == ("snapshot", detail)
        assert detail["free_seats"] == 4


async def test_registration_sends_a_new_snapshot(event: Event) -> None:
    async with stream(AsyncClient(), url(event.id)) as response:
        await next_message(response)
        await sync_to_async(registered)(event.id, "a@x.io")

        _, snapshot = await next_message(response)
        assert snapshot["free_seats"] == 4


# A plain JSON response, so the synchronous client (see test_org_event_stream_api.py).
def test_stream_of_a_missing_event_is_404(event: Event) -> None:
    response = APIClient().get(url(event.id + 1), HTTP_ACCEPT=SSE["accept"])

    assert response.status_code == 404
    assert response["Content-Type"] == "application/json"
