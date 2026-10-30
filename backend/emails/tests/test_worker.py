from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from accounts.models import User
from emails.models import OutboxEmail
from emails.services import BATCH_SIZE, enqueue_email, process_batch
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
        capacity=100,
    )


def queue_ticket(event: Event, email: str) -> OutboxEmail:
    registration = Registration.objects.create(
        event=event, email=email, name="Ann", status=Registration.Status.CONFIRMED
    )
    enqueue_email(OutboxEmail.Kind.TICKET, registration)
    return OutboxEmail.objects.get(registration=registration)


def test_pending_email_is_sent_and_marked_sent(event: Event) -> None:
    queued = queue_ticket(event, "a@x.io")
    now = timezone.now()

    sent = process_batch(now=now)

    assert sent == [queued.id]
    [message] = mail.outbox
    assert message.to == ["a@x.io"]
    assert message.subject == queued.subject
    assert message.body == queued.body
    queued.refresh_from_db()
    assert queued.status == OutboxEmail.Status.SENT
    assert queued.sent_at == now


def test_sent_email_is_not_sent_again(event: Event) -> None:
    queue_ticket(event, "a@x.io")
    process_batch()

    assert process_batch() == []
    assert len(mail.outbox) == 1


def test_email_waits_for_its_next_attempt(event: Event) -> None:
    queued = queue_ticket(event, "a@x.io")
    queued.next_attempt_at = timezone.now() + timedelta(minutes=1)
    queued.save()

    assert process_batch() == []
    assert mail.outbox == []


def test_batch_takes_the_oldest_due_emails_up_to_its_size(event: Event) -> None:
    queued = [queue_ticket(event, f"u{i}@x.io") for i in range(BATCH_SIZE + 1)]

    sent = process_batch()

    assert sent == [email.id for email in queued[:BATCH_SIZE]]
    assert process_batch() == [queued[-1].id]
