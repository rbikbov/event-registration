from datetime import timedelta
from typing import Any

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import User
from events.models import Event
from registrations.services import register

pytestmark = pytest.mark.django_db

ADD_URL = "/admin/events/event/add/"
CHANGELIST_URL = "/admin/events/event/"


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


@pytest.fixture
def admin_client() -> Client:
    client = Client()
    client.force_login(User.objects.create_superuser(email="admin@example.com", password="x"))
    return client


@pytest.fixture
def event(organizer: User) -> Event:
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=2,
    )


def form_data(organizer: User, starts_at: Any, **overrides: Any) -> dict[str, Any]:
    local = timezone.localtime(starts_at)
    data = {
        "organizer": organizer.pk,
        "title": "Meetup",
        "description": "",
        "starts_at_0": local.strftime("%Y-%m-%d"),
        "starts_at_1": local.strftime("%H:%M:%S"),
        "capacity": 2,
    }
    return data | overrides


def test_add_rejects_a_start_in_the_past(admin_client: Client, organizer: User) -> None:
    response = admin_client.post(ADD_URL, form_data(organizer, timezone.now() - timedelta(days=1)))

    assert response.status_code == 200
    assert "starts_at" in response.context["adminform"].form.errors
    assert not Event.objects.exists()


def test_add_accepts_a_start_in_the_future(admin_client: Client, organizer: User) -> None:
    response = admin_client.post(ADD_URL, form_data(organizer, timezone.now() + timedelta(days=1)))

    assert response.status_code == 302
    assert Event.objects.count() == 1


def test_change_keeps_capacity_start_and_organizer(
    admin_client: Client, organizer: User, event: Event
) -> None:
    # Changing them needs the event lock and side effects (promotion, emails), not a plain save.
    other = User.objects.create_user(email="other@example.com", password="x")
    data = form_data(other, event.starts_at + timedelta(days=1), title="Renamed", capacity=99)

    response = admin_client.post(f"{CHANGELIST_URL}{event.pk}/change/", data)

    assert response.status_code == 302
    event.refresh_from_db()
    assert event.title == "Renamed"
    assert (event.capacity, event.organizer_id) == (2, organizer.pk)


def test_event_with_registrations_is_not_deleted(admin_client: Client, event: Event) -> None:
    register(event.pk, "a@example.com", "A")

    admin_client.post(f"{CHANGELIST_URL}{event.pk}/delete/", {"post": "yes"})
    admin_client.post(
        CHANGELIST_URL,
        {"action": "delete_selected", "_selected_action": [event.pk], "post": "yes"},
    )

    assert Event.objects.filter(pk=event.pk).exists()


def test_event_without_registrations_is_deleted(admin_client: Client, event: Event) -> None:
    admin_client.post(f"{CHANGELIST_URL}{event.pk}/delete/", {"post": "yes"})

    assert not Event.objects.filter(pk=event.pk).exists()
