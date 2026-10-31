from datetime import timedelta

import pytest
from django.utils import timezone
from pytest_django.fixtures import DjangoAssertNumQueries
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event
from registrations.models import Registration

pytestmark = pytest.mark.django_db


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


@pytest.fixture
def client(organizer: User) -> APIClient:
    client = APIClient()
    client.force_login(organizer)
    return client


def make_event(organizer: User) -> Event:
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        description="Talks and pizza",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=5,
    )


def url(event_id: int) -> str:
    return f"/api/org/events/{event_id}/"


def test_detail_has_the_event_and_its_counts(client: APIClient, organizer: User) -> None:
    event = make_event(organizer)
    other = make_event(organizer)
    now = timezone.now()
    for email, status, checked_in_at in [
        ("a@x.io", "confirmed", now),
        ("b@x.io", "confirmed", None),
        ("c@x.io", "confirmed", now),
        ("d@x.io", "waitlisted", None),
        ("e@x.io", "cancelled", None),
    ]:
        Registration.objects.create(
            event=event, email=email, name="N", status=status, checked_in_at=checked_in_at
        )
    Registration.objects.create(
        event=other, email="a@x.io", name="N", status="confirmed", checked_in_at=now
    )

    response = client.get(url(event.id))

    assert response.status_code == 200
    assert response.json() == {
        "id": event.id,
        "title": "Meetup",
        "description": "Talks and pizza",
        "starts_at": event.starts_at.isoformat().replace("+00:00", "Z"),
        "capacity": 5,
        "confirmed": 3,
        "waitlisted": 1,
        "checked_in": 2,
        "free_seats": 2,
        "cancelled": 1,
    }


def test_detail_of_an_event_without_registrations_has_zero_counts(
    client: APIClient, organizer: User
) -> None:
    body = client.get(url(make_event(organizer).id)).json()

    assert (
        body["confirmed"],
        body["waitlisted"],
        body["checked_in"],
        body["free_seats"],
        body["cancelled"],
    ) == (0, 0, 0, 5, 0)


def test_detail_of_another_organizers_event_is_403(client: APIClient) -> None:
    other = User.objects.create_user(email="other@example.com", password="x")

    assert client.get(url(make_event(other).id)).status_code == 403


def test_detail_of_a_missing_event_is_404(client: APIClient, organizer: User) -> None:
    event = make_event(organizer)

    assert client.get(url(event.id + 1)).status_code == 404


def test_detail_needs_a_session(organizer: User) -> None:
    assert APIClient().get(url(make_event(organizer).id)).status_code == 401


def test_detail_counts_in_one_query(
    client: APIClient, organizer: User, django_assert_num_queries: DjangoAssertNumQueries
) -> None:
    event = make_event(organizer)
    for i in range(3):
        Registration.objects.create(event=event, email=f"{i}@x.io", name="N", status="confirmed")

    # Session and user, then the event with its counts.
    with django_assert_num_queries(3):
        client.get(url(event.id))
