"""Pages and periods of both event lists: the public one and the organizer's.

The organizer's own events are in both, so each test runs on each list.
"""

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events import services
from events.models import Event

pytestmark = pytest.mark.django_db


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


@pytest.fixture(params=["/api/events/", "/api/org/events/"])
def get(request: pytest.FixtureRequest, organizer: User) -> Any:
    client = APIClient()
    if "/org/" in request.param:
        client.force_login(organizer)

    def get(**params: Any) -> Any:
        return client.get(request.param, params)

    return get


@pytest.fixture
def page_size(monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setattr(services, "EVENTS_PAGE_SIZE", 2)
    return 2


def make_events(organizer: User, days: list[int]) -> list[int]:
    now = timezone.now()
    return [
        Event.objects.create(
            organizer=organizer, title="Meetup", starts_at=now + timedelta(days=d), capacity=5
        ).id
        for d in days
    ]


def ids(response: Any) -> list[int]:
    return [row["id"] for row in response.json()["results"]]


def test_upcoming_by_default_soonest_first(get: Any, organizer: User) -> None:
    later, sooner = make_events(organizer, [5, 1])
    make_events(organizer, [-1])

    response = get()

    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert ids(response) == [sooner, later]
    assert ids(get(period="upcoming")) == [sooner, later]


def test_past_has_only_started_events_most_recent_first(get: Any, organizer: User) -> None:
    long_ago, recent = make_events(organizer, [-10, -1])
    make_events(organizer, [1])

    response = get(period="past")

    assert response.json()["count"] == 2
    assert ids(response) == [recent, long_ago]


# Past is the upcoming order turned back in time: at the same start, the event upcoming shows
# second (created earlier, smaller id) goes first.
def test_past_mirrors_the_upcoming_order_at_the_same_start(get: Any, organizer: User) -> None:
    starts_at = timezone.now() - timedelta(days=1)
    first, second = (
        Event.objects.create(organizer=organizer, title="M", starts_at=starts_at, capacity=5).id
        for _ in range(2)
    )

    assert ids(get(period="past")) == [first, second]


def test_pages_go_on_in_order_with_the_total_count(
    get: Any, organizer: User, page_size: int
) -> None:
    events = make_events(organizer, [1, 2, 3, 4, 5])

    pages = [get(page=n).json() for n in (1, 2, 3)]

    assert [page["count"] for page in pages] == [5, 5, 5]
    assert [[row["id"] for row in page["results"]] for page in pages] == [
        events[0:2],
        events[2:4],
        events[4:5],
    ]


def test_page_past_the_end_is_empty_with_the_count(
    get: Any, organizer: User, page_size: int
) -> None:
    make_events(organizer, [1, 2, 3])

    response = get(page=3)

    assert response.status_code == 200
    assert response.json() == {"count": 3, "results": []}


@pytest.mark.parametrize(
    ("params", "field", "code"),
    [
        ({"period": "soon"}, "period", "invalid_choice"),
        ({"page": 0}, "page", "min_value"),
        ({"page": 10**6 + 1}, "page", "max_value"),
        ({"page": "x"}, "page", "invalid"),
    ],
)
def test_bad_query_is_400_with_a_code(
    get: Any, params: dict[str, Any], field: str, code: str
) -> None:
    response = get(**params)

    assert response.status_code == 400
    assert response.json() == {"errors": {field: [code]}}
