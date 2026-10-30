from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from events.models import Event
from registrations.models import Registration
from registrations.services import cancel, register

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


def statuses(event: Event) -> dict[str, str]:
    return {r.email: r.status for r in Registration.objects.filter(event=event)}


def test_cancel_confirmed_promotes_the_first_waitlisted(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")
    now = timezone.now()

    cancel(first.manage_token, now=now)

    assert statuses(event) == {"a@x.io": "cancelled", "b@x.io": "confirmed", "c@x.io": "waitlisted"}
    promoted = Registration.objects.get(email="b@x.io")
    assert promoted.confirmed_at == now
    assert Registration.objects.get(email="a@x.io").cancelled_at == now


def test_waitlist_shifts_after_a_promotion(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")

    cancel(first.manage_token)

    assert register(event.id, "c@x.io", "Cid").position == 1


def test_cancel_without_a_waitlist_just_frees_the_seat(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration

    cancel(first.manage_token)

    assert statuses(event) == {"a@x.io": "cancelled"}
    assert register(event.id, "b@x.io", "Bob").registration.status == "confirmed"


def test_cancel_from_the_waitlist_promotes_nobody(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    waiting = register(event.id, "b@x.io", "Bob").registration
    register(event.id, "c@x.io", "Cid")

    cancel(waiting.manage_token)

    assert statuses(event) == {"a@x.io": "confirmed", "b@x.io": "cancelled", "c@x.io": "waitlisted"}


def test_repeated_cancel_does_not_promote_a_second_person(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")

    cancel(first.manage_token)
    again = cancel(first.manage_token)

    assert again.status == "cancelled"
    assert statuses(event) == {"a@x.io": "cancelled", "b@x.io": "confirmed", "c@x.io": "waitlisted"}


def test_promotion_follows_queued_at_then_id(event: Event) -> None:
    now = timezone.now()
    first = register(event.id, "a@x.io", "Ann", now=now).registration
    register(event.id, "late@x.io", "Late", now=now + timedelta(minutes=5))
    register(event.id, "early@x.io", "Early", now=now + timedelta(minutes=1))

    cancel(first.manage_token)

    assert statuses(event)["early@x.io"] == "confirmed"
    assert statuses(event)["late@x.io"] == "waitlisted"


def test_promotion_breaks_a_queued_at_tie_by_id(event: Event) -> None:
    now = timezone.now()
    first = register(event.id, "a@x.io", "Ann", now=now).registration
    second = register(event.id, "b@x.io", "Bob", now=now)
    register(event.id, "c@x.io", "Cid", now=now)
    assert second.position == 1

    cancel(first.manage_token)

    assert statuses(event) == {"a@x.io": "cancelled", "b@x.io": "confirmed", "c@x.io": "waitlisted"}


def test_cancel_with_an_unknown_token_raises() -> None:
    with pytest.raises(Registration.DoesNotExist):
        cancel("nope")


def test_register_after_cancel_revives_the_row_with_a_new_ticket_code(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    old_code, old_token = first.ticket_code, first.manage_token
    cancel(first.manage_token)
    now = timezone.now()

    result = register(event.id, "a@x.io", "Ann again", now=now)

    assert result.created is True
    assert result.registration.id == first.id
    assert result.registration.status == "confirmed"
    assert result.registration.cancelled_at is None
    assert result.registration.ticket_code != old_code
    assert result.registration.manage_token == old_token
    assert result.registration.queued_at == now
    assert result.registration.confirmed_at == now
    assert Registration.objects.count() == 1


def test_register_after_cancel_on_a_full_event_goes_to_the_waitlist_tail(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    cancel(first.manage_token)
    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")

    result = register(event.id, "a@x.io", "Ann")

    assert result.registration.status == "waitlisted"
    assert result.position == 2
    assert result.registration.confirmed_at is None


def test_revived_from_the_waitlist_goes_to_the_tail(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")
    waiting = register(event.id, "b@x.io", "Bob").registration
    register(event.id, "c@x.io", "Cid")
    cancel(waiting.manage_token)

    result = register(event.id, "b@x.io", "Bob")

    assert result.registration.status == "waitlisted"
    assert result.position == 2


def test_revived_registration_can_be_cancelled_and_promotes_the_next(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    cancel(first.manage_token)
    revived = register(event.id, "a@x.io", "Ann").registration
    register(event.id, "b@x.io", "Bob")

    cancel(revived.manage_token)

    assert statuses(event) == {"a@x.io": "cancelled", "b@x.io": "confirmed"}


def url(token: str) -> str:
    return f"/api/tickets/{token}/cancel/"


def test_cancel_api_returns_200_and_status(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration

    response = APIClient().post(url(first.manage_token))

    assert response.status_code == 200
    assert response.json() == {"status": "cancelled"}


def test_cancel_api_is_idempotent(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    client = APIClient()
    client.post(url(first.manage_token))

    response = client.post(url(first.manage_token))

    assert response.status_code == 200
    assert response.json() == {"status": "cancelled"}


def test_cancel_api_unknown_token_is_404() -> None:
    assert APIClient().post(url("nope")).status_code == 404


def test_cancel_api_works_for_a_signed_in_user_without_csrf_token(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(event.organizer)

    assert client.post(url(first.manage_token)).status_code == 200
