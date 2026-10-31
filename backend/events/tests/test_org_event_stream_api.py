from datetime import timedelta

import pytest
from asgiref.sync import sync_to_async
from django.test import AsyncClient
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event
from events.tests.sse import SSE, checked_in, next_message, stream
from registrations.models import Registration

# The stream runs in other threads with their own connections: the data must be committed.
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


@pytest.fixture
def event(organizer: User) -> Event:
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=5,
    )


@pytest.fixture
async def client(organizer: User) -> AsyncClient:
    client = AsyncClient()
    await client.aforce_login(organizer)
    return client


def confirmed(event: Event, email: str) -> Registration:
    return Registration.objects.create(
        event=event, email=email, name="N", status=Registration.Status.CONFIRMED
    )


def url(event_id: int) -> str:
    return f"/api/org/events/{event_id}/stream/"


async def test_stream_starts_with_a_snapshot(client: AsyncClient, event: Event) -> None:
    await sync_to_async(confirmed)(event, "a@x.io")
    await sync_to_async(Registration.objects.create)(
        event=event, email="b@x.io", name="N", status=Registration.Status.WAITLISTED
    )

    async with stream(client, url(event.id)) as response:
        assert response["Content-Type"] == "text/event-stream"
        assert response["Cache-Control"] == "no-cache"
        assert response["X-Accel-Buffering"] == "no"
        # The event as GET /api/org/events/{id}/ has it: the panel takes it whole.
        assert await next_message(response) == (
            "snapshot",
            {
                "id": event.id,
                "title": "Meetup",
                "description": "",
                "starts_at": event.starts_at.isoformat().replace("+00:00", "Z"),
                "capacity": 5,
                "confirmed": 1,
                "waitlisted": 1,
                "checked_in": 0,
                "free_seats": 4,
            },
        )


async def test_check_in_sends_a_new_snapshot(client: AsyncClient, event: Event) -> None:
    ticket = await sync_to_async(confirmed)(event, "a@x.io")

    async with stream(client, url(event.id)) as response:
        await next_message(response)
        await sync_to_async(checked_in)(event.id, ticket.ticket_code)

        _, snapshot = await next_message(response)
        assert snapshot["checked_in"] == 1


async def test_changes_in_a_row_end_with_the_latest_snapshot(
    client: AsyncClient, event: Event
) -> None:
    first = await sync_to_async(confirmed)(event, "a@x.io")
    second = await sync_to_async(confirmed)(event, "b@x.io")

    async with stream(client, url(event.id)) as response:
        await next_message(response)
        await sync_to_async(checked_in)(event.id, first.ticket_code)
        await sync_to_async(checked_in)(event.id, second.ticket_code)

        # The first change may already be read when the second commits: its snapshot can come
        # first, the last one must have both. A stream stuck on 1 fails on the timeout.
        counts = [(await next_message(response))[1]["checked_in"]]
        while counts[-1] != 2:
            counts.append((await next_message(response))[1]["checked_in"])
        assert counts in ([2], [1, 2])


# Errors are plain JSON responses, so the synchronous client: AsyncClient leaves the connection of
# a non-streaming response open (a server closes it on request_finished), and it would keep the
# test database from being dropped.
def test_stream_of_another_organizers_event_is_403(organizer: User) -> None:
    other = User.objects.create_user(email="other@example.com", password="x")
    event = Event.objects.create(
        organizer=other, title="Other", starts_at=timezone.now() + timedelta(days=7), capacity=5
    )
    client = APIClient()
    client.force_login(organizer)

    response = client.get(url(event.id), HTTP_ACCEPT=SSE["accept"])

    assert response.status_code == 403
    assert response["Content-Type"] == "application/json"


def test_stream_of_a_missing_event_is_404(organizer: User, event: Event) -> None:
    client = APIClient()
    client.force_login(organizer)

    assert client.get(url(event.id + 1), HTTP_ACCEPT=SSE["accept"]).status_code == 404


def test_stream_needs_a_session(event: Event) -> None:
    assert APIClient().get(url(event.id), HTTP_ACCEPT=SSE["accept"]).status_code == 401
