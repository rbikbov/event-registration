from datetime import UTC, datetime

import pytest
from django.test import override_settings
from django.utils import timezone

from accounts.models import User
from emails.models import OutboxEmail
from emails.services import enqueue_email
from events.models import Event
from registrations.models import Registration

pytestmark = pytest.mark.django_db


@pytest.fixture
def registration() -> Registration:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    event = Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=datetime(2030, 5, 17, 18, 30, tzinfo=UTC),
        capacity=2,
    )
    return Registration.objects.create(
        event=event,
        email="a@x.io",
        name="Ann O'Neil",
        status=Registration.Status.CONFIRMED,
        confirmed_at=timezone.now(),
    )


@override_settings(FRONTEND_URL="https://events.example")
def test_ticket_email_is_a_snapshot_with_code_date_and_link(registration: Registration) -> None:
    enqueue_email(OutboxEmail.Kind.TICKET, registration)

    email = OutboxEmail.objects.get()
    assert email.kind == OutboxEmail.Kind.TICKET
    assert email.status == OutboxEmail.Status.PENDING
    assert email.to == "a@x.io"
    assert "Meetup" in email.subject
    assert registration.ticket_code in email.body
    assert f"https://events.example/tickets/{registration.manage_token}" in email.body
    assert "17.05.2030 18:30 UTC" in email.body
    # Plain text: no HTML escaping of the name.
    assert "Ann O'Neil" in email.body


def test_same_dedup_key_is_queued_once(registration: Registration) -> None:
    enqueue_email(OutboxEmail.Kind.TICKET, registration)
    enqueue_email(OutboxEmail.Kind.TICKET, registration)

    assert OutboxEmail.objects.count() == 1
    assert OutboxEmail.objects.get().dedup_key == (
        f"ticket:{registration.id}:{registration.ticket_code}"
    )
