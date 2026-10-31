from datetime import timedelta

import pytest
from django.utils import timezone
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
        starts_at=timezone.now() + timedelta(days=7),
        capacity=10,
    )


@pytest.fixture
def event(organizer: User) -> Event:
    return make_event(organizer)


@pytest.fixture
def registration(event: Event) -> Registration:
    return Registration.objects.create(
        event=event, email="ivan@gmail.com", name="Ivan", status=Registration.Status.CONFIRMED
    )


def url(event_id: int) -> str:
    return f"/api/org/events/{event_id}/checkin/"


def test_checkin_returns_the_name_and_a_masked_email(
    client: APIClient, event: Event, registration: Registration
) -> None:
    response = client.post(url(event.id), {"code": registration.ticket_code}, format="json")

    assert response.status_code == 200
    registration.refresh_from_db()
    assert registration.checked_in_at is not None
    assert response.json() == {
        "result": "checked_in",
        "name": "Ivan",
        "masked_email": "iv***@gmail.com",
        "checked_in_at": registration.checked_in_at.isoformat().replace("+00:00", "Z"),
    }


def test_a_repeat_checkin_is_200_with_the_first_time(
    client: APIClient, event: Event, registration: Registration
) -> None:
    client.post(url(event.id), {"code": registration.ticket_code}, format="json")
    registration.refresh_from_db()
    assert registration.checked_in_at is not None

    response = client.post(url(event.id), {"code": registration.ticket_code}, format="json")

    assert response.status_code == 200
    assert response.json() == {
        "result": "already_checked_in",
        "name": "Ivan",
        "masked_email": "iv***@gmail.com",
        "checked_in_at": registration.checked_in_at.isoformat().replace("+00:00", "Z"),
    }


@pytest.mark.parametrize("status", [Registration.Status.WAITLISTED, Registration.Status.CANCELLED])
def test_checkin_of_a_ticket_that_is_not_confirmed_is_409(
    client: APIClient, event: Event, registration: Registration, status: str
) -> None:
    registration.status = status
    registration.save()

    response = client.post(url(event.id), {"code": registration.ticket_code}, format="json")

    assert response.status_code == 409
    registration.refresh_from_db()
    assert registration.checked_in_at is None


def test_checkin_of_an_unknown_code_is_404(client: APIClient, event: Event) -> None:
    response = client.post(url(event.id), {"code": "ZZZZZZZZ"}, format="json")

    assert response.status_code == 404


def test_checkin_of_another_events_code_is_404(
    client: APIClient, organizer: User, registration: Registration
) -> None:
    other = make_event(organizer)

    response = client.post(url(other.id), {"code": registration.ticket_code}, format="json")

    assert response.status_code == 404
    registration.refresh_from_db()
    assert registration.checked_in_at is None


def test_checkin_at_another_organizers_event_is_403(
    event: Event, registration: Registration
) -> None:
    stranger = User.objects.create_user(email="stranger@example.com", password="x")
    client = APIClient()
    client.force_login(stranger)

    response = client.post(url(event.id), {"code": registration.ticket_code}, format="json")

    assert response.status_code == 403
    registration.refresh_from_db()
    assert registration.checked_in_at is None


def test_checkin_at_a_missing_event_is_404(client: APIClient, event: Event) -> None:
    response = client.post(url(event.id + 1), {"code": "ZZZZZZZZ"}, format="json")

    assert response.status_code == 404


def test_checkin_needs_a_session(event: Event, registration: Registration) -> None:
    response = APIClient().post(url(event.id), {"code": registration.ticket_code}, format="json")

    assert response.status_code == 401


def test_checkin_requires_csrf_token(
    organizer: User, event: Event, registration: Registration
) -> None:
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(organizer)

    response = client.post(url(event.id), {"code": registration.ticket_code}, format="json")

    assert response.status_code == 403


@pytest.mark.parametrize("code", ["", "   "])
def test_checkin_without_a_code_is_400(client: APIClient, event: Event, code: str) -> None:
    response = client.post(url(event.id), {"code": code}, format="json")

    assert response.status_code == 400
    assert response.json() == {"errors": {"code": ["blank"]}}
