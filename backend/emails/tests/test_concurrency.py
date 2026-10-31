from datetime import timedelta
from functools import partial

import pytest
from django.core import mail
from django.db.models import Max
from django.utils import timezone

from accounts.models import User
from config.tests.concurrency import run_together
from emails.models import OutboxEmail
from emails.services import BATCH_SIZE, enqueue_email, process_batch
from events.models import Event
from registrations.models import Registration

# Threads open their own connections, so the data must be committed, not rolled back at the end.
pytestmark = pytest.mark.django_db(transaction=True)


def test_two_workers_send_each_email_once() -> None:
    organizer = User.objects.create_user(email="organizer@example.com", password="x")
    event = Event.objects.create(
        organizer=organizer,
        title="Meetup",
        starts_at=timezone.now() + timedelta(days=7),
        capacity=100,
    )
    # Two batches: with the rows locked, each worker gets its own.
    for i in range(2 * BATCH_SIZE):
        registration = Registration.objects.create(
            event=event, email=f"u{i}@x.io", name="Ann", status=Registration.Status.CONFIRMED
        )
        enqueue_email(OutboxEmail.Kind.TICKET, registration)

    # The latest queuing time, not the clock now: the wall clock may step back (WSL2 does by
    # about 0.4 s every 30 s), and the emails queued before the step are then not due yet.
    due = OutboxEmail.objects.aggregate(latest=Max("next_attempt_at"))["latest"]
    batch = partial(process_batch, now=due)

    sent = run_together([batch, batch])

    all_ids = sorted(OutboxEmail.objects.values_list("id", flat=True))
    assert sorted(sent[0] + sent[1]) == all_ids
    assert sorted(m.to[0] for m in mail.outbox) == sorted(
        f"u{i}@x.io" for i in range(2 * BATCH_SIZE)
    )
    assert set(OutboxEmail.objects.values_list("status", flat=True)) == {OutboxEmail.Status.SENT}
