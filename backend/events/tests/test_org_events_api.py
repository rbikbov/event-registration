from datetime import timedelta
from typing import Any

import pytest
from django.db import IntegrityError
from django.utils import timezone
from pytest_django.fixtures import DjangoAssertNumQueries
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event

pytestmark = pytest.mark.django_db

URL = "/api/org/events/"


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


@pytest.fixture
def client(organizer: User) -> APIClient:
    client = APIClient()
    client.force_login(organizer)
    return client


def payload(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "title": "Meetup",
        "description": "Talks and pizza",
        "starts_at": (timezone.now() + timedelta(days=7)).isoformat(),
        "capacity": 30,
    }
    return data | overrides


def make_event(organizer: User, **fields: Any) -> Event:
    defaults: dict[str, Any] = {
        "title": "Meetup",
        "starts_at": timezone.now() + timedelta(days=7),
        "capacity": 10,
    }
    return Event.objects.create(organizer=organizer, **(defaults | fields))


def test_create_makes_the_caller_the_organizer(client: APIClient, organizer: User) -> None:
    response = client.post(URL, payload(), format="json")

    assert response.status_code == 201
    event = Event.objects.get()
    assert event.organizer == organizer
    assert response.json() == {
        "id": event.id,
        "title": "Meetup",
        "description": "Talks and pizza",
        "starts_at": response.json()["starts_at"],
        "capacity": 30,
    }


def test_create_ignores_a_client_supplied_organizer(client: APIClient, organizer: User) -> None:
    other = User.objects.create_user(email="other@example.com", password="x")

    client.post(URL, payload(organizer=other.id), format="json")

    assert Event.objects.get().organizer == organizer


def test_description_is_optional(client: APIClient) -> None:
    data = payload()
    del data["description"]

    assert client.post(URL, data, format="json").status_code == 201


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"title": ""}, "title", "blank"),
        ({"title": "x" * 201}, "title", "max_length"),
        ({"description": "x" * 2001}, "description", "max_length"),
        ({"capacity": 0}, "capacity", "min_value"),
        ({"capacity": -5}, "capacity", "min_value"),
        ({"capacity": 10001}, "capacity", "max_value"),
        ({"capacity": "many"}, "capacity", "invalid"),
        ({"starts_at": "tomorrow"}, "starts_at", "invalid"),
        ({"starts_at": "2020-01-01T10:00:00Z"}, "starts_at", "past"),
    ],
)
def test_create_rejects_invalid_field_with_code(
    client: APIClient, overrides: dict[str, Any], field: str, code: str
) -> None:
    response = client.post(URL, payload(**overrides), format="json")

    assert response.status_code == 400
    assert response.json() == {"errors": {field: [code]}}
    assert not Event.objects.exists()


def test_create_requires_all_main_fields(client: APIClient) -> None:
    response = client.post(URL, {}, format="json")

    assert response.status_code == 400
    assert response.json() == {
        "errors": {
            "title": ["required"],
            "starts_at": ["required"],
            "capacity": ["required"],
        }
    }


def test_list_has_only_own_events_ordered_by_start(client: APIClient, organizer: User) -> None:
    other = User.objects.create_user(email="other@example.com", password="x")
    soon = timezone.now() + timedelta(days=1)
    later = make_event(organizer, title="Later", starts_at=soon + timedelta(days=5))
    earlier = make_event(organizer, title="Earlier", starts_at=soon)
    make_event(other, title="Not mine")

    response = client.get(URL)

    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [earlier.id, later.id]


def test_list_is_empty_for_new_organizer(client: APIClient) -> None:
    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == []


def test_list_query_count_does_not_depend_on_number_of_events(
    client: APIClient, organizer: User, django_assert_num_queries: DjangoAssertNumQueries
) -> None:
    make_event(organizer)
    with django_assert_num_queries(3):
        client.get(URL)

    for _ in range(5):
        make_event(organizer)
    with django_assert_num_queries(3):
        client.get(URL)


@pytest.mark.parametrize("method", ["get", "post"])
def test_guest_gets_401(method: str) -> None:
    response = getattr(APIClient(), method)(URL)

    assert response.status_code == 401


def test_create_requires_csrf_token(organizer: User) -> None:
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(organizer)

    response = client.post(URL, payload(), format="json")

    assert response.status_code == 403
    assert not Event.objects.exists()


def test_database_rejects_non_positive_capacity(organizer: User) -> None:
    with pytest.raises(IntegrityError):
        make_event(organizer, capacity=0)


def test_for_organizer_returns_only_that_users_events(organizer: User) -> None:
    other = User.objects.create_user(email="other@example.com", password="x")
    mine = make_event(organizer)
    make_event(other)

    assert list(Event.objects.for_organizer(organizer)) == [mine]
