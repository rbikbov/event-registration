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
        starts_at=timezone.now() + timedelta(days=7),
        capacity=10,
    )


@pytest.fixture
def event(organizer: User) -> Event:
    return make_event(organizer)


def url(event_id: int) -> str:
    return f"/api/org/events/{event_id}/registrations/"


def add(event: Event, email: str, status: str, minute: int, **fields: object) -> Registration:
    # Queue times are set here, not taken from the clock: the list is ordered by them.
    queued_at = timezone.now().replace(microsecond=0) + timedelta(minutes=minute)
    return Registration.objects.create(
        event=event,
        email=email,
        name=email[0].upper(),
        status=status,
        queued_at=queued_at,
        **fields,
    )


def test_list_has_every_registration_in_queue_order(client: APIClient, event: Event) -> None:
    checked_in_at = timezone.now()
    b = add(event, "b@x.io", "waitlisted", 2)
    a = add(event, "a@x.io", "confirmed", 1, checked_in_at=checked_in_at)
    c = add(event, "c@x.io", "cancelled", 3)
    d = add(event, "d@x.io", "waitlisted", 4)
    add(make_event(event.organizer), "a@x.io", "confirmed", 0)

    response = client.get(url(event.id))

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": a.id,
            "name": "A",
            "email": "a@x.io",
            "status": "confirmed",
            "checked_in_at": checked_in_at.isoformat().replace("+00:00", "Z"),
        },
        {
            "id": b.id,
            "name": "B",
            "email": "b@x.io",
            "status": "waitlisted",
            "position": 1,
            "checked_in_at": None,
        },
        {"id": c.id, "name": "C", "email": "c@x.io", "status": "cancelled", "checked_in_at": None},
        {
            "id": d.id,
            "name": "D",
            "email": "d@x.io",
            "status": "waitlisted",
            "position": 2,
            "checked_in_at": None,
        },
    ]


@pytest.mark.parametrize("status", ["confirmed", "waitlisted", "cancelled"])
def test_list_filters_by_status(client: APIClient, event: Event, status: str) -> None:
    add(event, "a@x.io", "confirmed", 1)
    add(event, "b@x.io", "waitlisted", 2)
    add(event, "c@x.io", "cancelled", 3)
    add(event, "d@x.io", status, 4)

    rows = client.get(url(event.id), {"status": status}).json()

    assert [row["status"] for row in rows] == [status, status]


def test_filtered_waitlist_keeps_the_queue_positions(client: APIClient, event: Event) -> None:
    add(event, "a@x.io", "confirmed", 1)
    add(event, "b@x.io", "waitlisted", 2)
    add(event, "c@x.io", "waitlisted", 3)

    rows = client.get(url(event.id), {"status": "waitlisted"}).json()

    assert [(row["email"], row["position"]) for row in rows] == [("b@x.io", 1), ("c@x.io", 2)]


def test_list_of_an_event_without_registrations_is_empty(client: APIClient, event: Event) -> None:
    response = client.get(url(event.id))

    assert response.status_code == 200
    assert response.json() == []


def test_list_comes_in_pages_of_50(client: APIClient, event: Event) -> None:
    for i in range(51):
        add(event, f"r{i:02}@x.io", "confirmed", i)

    pages = [client.get(url(event.id), {"page": page}).json() for page in (1, 2, 3)]

    assert [row["email"] for row in pages[0]] == [f"r{i:02}@x.io" for i in range(50)]
    assert [row["email"] for row in pages[1]] == ["r50@x.io"]
    # Past the end: an empty page, not an error; the counts tell the number of pages.
    assert pages[2] == []
    assert client.get(url(event.id)).json() == pages[0]


@pytest.mark.parametrize("query", [{}, {"status": "waitlisted"}])
def test_positions_on_the_second_page_go_on_from_the_first(
    client: APIClient, event: Event, query: dict[str, str]
) -> None:
    add(event, "a@x.io", "confirmed", 0)
    for i in range(51):
        add(event, f"w{i:02}@x.io", "waitlisted", 1 + i)

    rows = client.get(url(event.id), {**query, "page": "2"}).json()

    assert [row["position"] for row in rows] == ([50, 51] if not query else [51])


@pytest.mark.parametrize(
    ("page", "code"),
    # Past the bound the OFFSET would overflow bigint: a 500 instead of a 400.
    [("0", "min_value"), ("x", "invalid"), ("1000001", "max_value")],
)
def test_bad_page_is_400(client: APIClient, event: Event, page: str, code: str) -> None:
    response = client.get(url(event.id), {"page": page})

    assert response.status_code == 400
    assert response.json() == {"errors": {"page": [code]}}


def test_unknown_status_is_400(client: APIClient, event: Event) -> None:
    response = client.get(url(event.id), {"status": "gone"})

    assert response.status_code == 400
    assert response.json() == {"errors": {"status": ["invalid_choice"]}}


def test_list_of_another_organizers_event_is_403(client: APIClient) -> None:
    other = User.objects.create_user(email="other@example.com", password="x")

    assert client.get(url(make_event(other).id)).status_code == 403


def test_list_of_a_missing_event_is_404(client: APIClient, event: Event) -> None:
    assert client.get(url(event.id + 1)).status_code == 404


def test_list_needs_a_session(event: Event) -> None:
    assert APIClient().get(url(event.id)).status_code == 401


def test_list_query_count_does_not_depend_on_number_of_registrations(
    client: APIClient, event: Event, django_assert_num_queries: DjangoAssertNumQueries
) -> None:
    add(event, "a@x.io", "confirmed", 1)
    # Session and user, the event, the registrations.
    with django_assert_num_queries(4):
        client.get(url(event.id))

    for i in range(60):
        add(event, f"w{i}@x.io", "waitlisted", 2 + i)
    with django_assert_num_queries(4):
        client.get(url(event.id))
    with django_assert_num_queries(4):
        client.get(url(event.id), {"page": 2})
