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


def test_patch_changes_only_the_fields_sent(client: APIClient, event: Event) -> None:
    response = client.patch(url(event.id), {"title": "Renamed"}, format="json")

    assert response.status_code == 200
    event.refresh_from_db()
    assert (event.title, event.capacity) == ("Renamed", 1)


def test_patch_with_a_larger_capacity_promotes(client: APIClient, event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")

    body = client.patch(url(event.id), {"capacity": 2}, format="json").json()

    assert (body["capacity"], body["confirmed"], body["waitlisted"]) == (2, 2, 0)
    assert OutboxEmail.objects.filter(kind=OutboxEmail.Kind.PROMOTED, to="b@x.io").exists()


def test_patch_with_capacity_below_confirmed_is_400(client: APIClient, event: Event) -> None:
    event.capacity = 2
    event.save()
    register(event.id, "a@x.io", "Ann")
    register(event.id, "b@x.io", "Bob")

    response = client.patch(url(event.id), {"capacity": 1, "title": "Renamed"}, format="json")

    assert response.status_code == 400
    assert response.json() == {"errors": {"capacity": ["below_confirmed"]}}
    event.refresh_from_db()
    assert (event.capacity, event.title) == (2, "Meetup")


@pytest.mark.parametrize(
    ("body", "field", "code"),
    [
        ({"title": "  "}, "title", "blank"),
        ({"title": "x" * 201}, "title", "max_length"),
        ({"description": "x" * 2001}, "description", "max_length"),
        ({"capacity": 0}, "capacity", "min_value"),
        ({"capacity": 10001}, "capacity", "max_value"),
        ({"starts_at": "garbage"}, "starts_at", "invalid"),
    ],
)
def test_patch_validates_fields_as_creation_does(
    client: APIClient, event: Event, body: dict[str, object], field: str, code: str
) -> None:
    response = client.patch(url(event.id), body, format="json")

    assert response.status_code == 400
    assert response.json() == {"errors": {field: [code]}}


def test_patch_with_a_start_in_the_past_is_400(client: APIClient, event: Event) -> None:
    past = timezone.now() - timedelta(hours=1)

    response = client.patch(url(event.id), {"starts_at": iso(past)}, format="json")

    assert response.status_code == 400
    assert response.json() == {"errors": {"starts_at": ["past"]}}
    assert OutboxEmail.objects.count() == 0


def test_patch_of_a_started_event_keeps_its_unchanged_start(
    client: APIClient, event: Event
) -> None:
    # The form sends what changed, but a client may send the whole event back: the start of an
    # event under way is no error while it stays the same.
    event.starts_at = timezone.now() - timedelta(hours=1)
    event.save()

    response = client.patch(
        url(event.id), {"starts_at": iso(event.starts_at), "title": "Renamed"}, format="json"
    )

    assert response.status_code == 200
    event.refresh_from_db()
    assert (event.title, event.schedule_version) == ("Renamed", 1)


def test_a_started_event_is_rescheduled_into_the_future(client: APIClient, event: Event) -> None:
    event.starts_at = timezone.now() - timedelta(hours=1)
    event.save()
    new_start = timezone.now() + timedelta(days=1)

    response = client.patch(url(event.id), {"starts_at": iso(new_start)}, format="json")

    assert response.status_code == 200
    assert response.json()["starts_at"] == iso(new_start)


def test_patch_of_another_organizers_event_is_403(client: APIClient) -> None:
    other = User.objects.create_user(email="other@example.com", password="x")
    foreign = Event.objects.create(
        organizer=other, title="Theirs", starts_at=timezone.now() + timedelta(days=1), capacity=1
    )

    response = client.patch(url(foreign.id), {"title": "Mine"}, format="json")

    assert response.status_code == 403
    foreign.refresh_from_db()
    assert foreign.title == "Theirs"


def test_patch_of_a_missing_event_is_404(client: APIClient, event: Event) -> None:
    assert client.patch(url(event.id + 1), {"title": "X"}, format="json").status_code == 404


def test_patch_needs_a_session(event: Event) -> None:
    response = APIClient().patch(url(event.id), {"title": "X"}, format="json")

    assert response.status_code == 401
    event.refresh_from_db()
    assert event.title == "Meetup"
