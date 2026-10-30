from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event
from registrations.models import Registration

pytestmark = pytest.mark.django_db


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=1,
    )


def url(event_id: int) -> str:
    return f"/api/events/{event_id}/registrations/"


def body(**overrides: Any) -> dict[str, Any]:
    return {"email": "a@x.io", "name": "Ann"} | overrides


def test_register_returns_201_and_status_without_secrets(event: Event) -> None:
    response = APIClient().post(url(event.id), body(), format="json")

    assert response.status_code == 201
    assert response.json() == {"status": "confirmed"}
    assert Registration.objects.get().event == event


def test_repeat_returns_200_and_no_second_registration(event: Event) -> None:
    client = APIClient()
    client.post(url(event.id), body(), format="json")

    response = client.post(url(event.id), body(email="A@X.io"), format="json")

    assert response.status_code == 200
    assert response.json() == {"status": "confirmed"}
    assert Registration.objects.count() == 1


def test_full_event_is_409(event: Event) -> None:
    APIClient().post(url(event.id), body(), format="json")

    response = APIClient().post(url(event.id), body(email="b@x.io"), format="json")

    assert response.status_code == 409
    assert Registration.objects.count() == 1


def test_unknown_event_is_404() -> None:
    assert APIClient().post(url(999), body(), format="json").status_code == 404


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"email": ""}, "email", "blank"),
        ({"email": "not-an-email"}, "email", "invalid"),
        ({"email": "a" * 250 + "@x.io"}, "email", "max_length"),
        ({"name": ""}, "name", "blank"),
        ({"name": "   "}, "name", "blank"),
        ({"name": "x" * 201}, "name", "max_length"),
    ],
)
def test_invalid_field_is_400_with_code(
    event: Event, overrides: dict[str, Any], field: str, code: str
) -> None:
    response = APIClient().post(url(event.id), body(**overrides), format="json")

    assert response.status_code == 400
    assert response.json() == {"errors": {field: [code]}}
    assert not Registration.objects.exists()


def test_missing_fields_are_400(event: Event) -> None:
    response = APIClient().post(url(event.id), {}, format="json")

    assert response.json() == {"errors": {"email": ["required"], "name": ["required"]}}


def test_signed_in_user_registers_without_csrf_token(event: Event) -> None:
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(event.organizer)

    assert client.post(url(event.id), body(), format="json").status_code == 201
