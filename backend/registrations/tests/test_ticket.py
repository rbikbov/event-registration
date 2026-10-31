from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event
from registrations.models import Registration
from registrations.services import cancel, check_in, get_ticket, register

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


def test_get_ticket_of_a_waitlisted_registration_has_its_position(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")
    waiting = register(event.id, "c@x.io", "Cid").registration

    ticket = get_ticket(waiting.manage_token)

    assert ticket.registration == waiting
    assert ticket.position == 2


def test_get_ticket_of_a_confirmed_registration_has_no_position(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration

    assert get_ticket(first.manage_token).position is None


def test_get_ticket_with_an_unknown_token_raises() -> None:
    with pytest.raises(Registration.DoesNotExist):
        get_ticket("nope")


def url(token: str) -> str:
    return f"/api/tickets/{token}/"


def event_payload(event: Event) -> dict[str, object]:
    return {
        "id": event.id,
        "title": "Meetup",
        "starts_at": event.starts_at.isoformat().replace("+00:00", "Z"),
    }


def test_ticket_api_confirmed_shows_the_code(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration

    response = APIClient().get(url(first.manage_token))

    assert response.status_code == 200
    assert response.json() == {
        "status": "confirmed",
        "ticket_code": first.ticket_code,
        "name": "Ann",
        "checked_in_at": None,
        "event": event_payload(event),
    }


def test_ticket_api_checked_in_shows_the_time_of_the_check_in(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    result = check_in(event.id, first.ticket_code)
    checked_in_at = result.registration.checked_in_at
    assert checked_in_at is not None

    response = APIClient().get(url(first.manage_token))

    assert response.status_code == 200
    assert response.json()["checked_in_at"] == checked_in_at.isoformat().replace("+00:00", "Z")


def test_ticket_api_waitlisted_shows_the_position_and_no_code(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    waiting = register(event.id, "b@x.io", "Bob").registration

    response = APIClient().get(url(waiting.manage_token))

    assert response.status_code == 200
    assert response.json() == {
        "status": "waitlisted",
        "position": 1,
        "name": "Bob",
        "checked_in_at": None,
        "event": event_payload(event),
    }


def test_ticket_api_cancelled_shows_neither_code_nor_position(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    cancel(first.manage_token)

    response = APIClient().get(url(first.manage_token))

    assert response.status_code == 200
    assert response.json() == {
        "status": "cancelled",
        "name": "Ann",
        "checked_in_at": None,
        "event": event_payload(event),
    }


def test_ticket_api_unknown_token_is_404() -> None:
    assert APIClient().get(url("nope")).status_code == 404
