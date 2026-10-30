from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from pytest_django.fixtures import DjangoAssertNumQueries
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event
from registrations.services import register

pytestmark = pytest.mark.django_db

URL = "/api/events/"


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


def make_event(organizer: User, **fields: Any) -> Event:
    defaults: dict[str, Any] = {
        "title": "Meetup",
        "description": "Talks and pizza",
        "starts_at": timezone.now() + timedelta(days=7),
        "capacity": 3,
    }
    return Event.objects.create(organizer=organizer, **(defaults | fields))


def test_list_is_open_to_guests_and_has_free_seats(organizer: User) -> None:
    event = make_event(organizer, capacity=3)
    register(event.id, "a@x.io", "Ann")

    response = APIClient().get(URL)

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": event.id,
            "title": "Meetup",
            "starts_at": response.json()[0]["starts_at"],
            "capacity": 3,
            "free_seats": 2,
        }
    ]


def test_list_has_only_future_events_by_start(organizer: User) -> None:
    soon = timezone.now() + timedelta(days=1)
    later = make_event(organizer, starts_at=soon + timedelta(days=3))
    earlier = make_event(organizer, starts_at=soon)
    make_event(organizer, starts_at=timezone.now() - timedelta(days=1))

    response = APIClient().get(URL)

    assert [row["id"] for row in response.json()] == [earlier.id, later.id]


def test_list_query_count_does_not_depend_on_number_of_events(
    organizer: User, django_assert_num_queries: DjangoAssertNumQueries
) -> None:
    make_event(organizer)
    with django_assert_num_queries(1):
        APIClient().get(URL)

    for _ in range(5):
        register(make_event(organizer).id, "a@x.io", "Ann")
    with django_assert_num_queries(1):
        APIClient().get(URL)


def test_detail_has_description_and_free_seats(organizer: User) -> None:
    event = make_event(organizer, capacity=1)
    register(event.id, "a@x.io", "Ann")

    response = APIClient().get(f"{URL}{event.id}/")

    assert response.status_code == 200
    assert response.json() == {
        "id": event.id,
        "title": "Meetup",
        "description": "Talks and pizza",
        "starts_at": response.json()["starts_at"],
        "capacity": 1,
        "free_seats": 0,
    }


def test_detail_of_unknown_event_is_404() -> None:
    assert APIClient().get(f"{URL}999/").status_code == 404
