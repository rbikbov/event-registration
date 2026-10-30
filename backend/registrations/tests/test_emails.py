from datetime import timedelta

import pytest
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from emails.models import OutboxEmail
from events.models import Event
from registrations.services import register

pytestmark = pytest.mark.django_db


class Rollback(Exception):
    pass


@pytest.fixture
def event() -> Event:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    return Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=2,
    )


def test_register_on_a_seat_queues_one_ticket_email(event: Event) -> None:
    registration = register(event.id, "a@x.io", "Ann").registration

    email = OutboxEmail.objects.get()
    assert email.kind == OutboxEmail.Kind.TICKET
    assert email.registration == registration
    assert registration.ticket_code in email.body
    assert f"/tickets/{registration.manage_token}" in email.body


def test_repeated_register_queues_no_more_emails(event: Event) -> None:
    register(event.id, "a@x.io", "Ann")

    register(event.id, "A@x.io", "Ann")

    assert OutboxEmail.objects.count() == 1


def test_rolled_back_register_leaves_no_email(event: Event) -> None:
    with pytest.raises(Rollback), transaction.atomic():
        register(event.id, "a@x.io", "Ann")
        raise Rollback

    assert OutboxEmail.objects.count() == 0
