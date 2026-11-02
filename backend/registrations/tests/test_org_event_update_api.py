from datetime import datetime, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from emails.models import OutboxEmail
from events.models import Event
from registrations.services import register

pytestmark = pytest.mark.django_db


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


@pytest.fixture
def client(organizer: User) -> APIClient:
    client = APIClient()
    client.force_login(organizer)
    return client


@pytest.fixture
def event(organizer: User) -> Event:
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=1,
    )


def url(event_id: int) -> str:
    return f"/api/org/events/{event_id}/"


def iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def test_patch_reschedules_and_answers_with_the_event_and_counts(
    client: APIClient, event: Event
) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")
    new_start = event.starts_at + timedelta(days=1)

    response = client.patch(url(event.id), {"starts_at": iso(new_start)}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert body["starts_at"] == iso(new_start)
    assert (body["confirmed"], body["waitlisted"], body["free_seats"]) == (1, 1, 0)
    assert OutboxEmail.objects.filter(kind=OutboxEmail.Kind.RESCHEDULED).count() == 2
