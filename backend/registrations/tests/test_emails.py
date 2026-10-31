from datetime import timedelta

import pytest
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from emails.models import OutboxEmail
from events.models import Event
from registrations.models import Registration
from registrations.services import cancel, register

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


def emails_of(email: str) -> list[OutboxEmail]:
    return list(OutboxEmail.objects.filter(to=email).order_by("id"))


def fill(event: Event) -> list[Registration]:
    return [register(event.id, f"seat{i}@x.io", "Seat").registration for i in range(event.capacity)]


def test_register_on_the_waitlist_queues_waitlisted_with_the_position(event: Event) -> None:
    fill(event)

    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")

    [bob] = emails_of("b@x.io")
    [cid] = emails_of("c@x.io")
    assert bob.kind == cid.kind == OutboxEmail.Kind.WAITLISTED
    assert "№1" in bob.body
    assert "№2" in cid.body
    # The code is good only with a seat: the waitlist email does not carry it.
    assert Registration.objects.get(email="b@x.io").ticket_code not in bob.body


def test_cancel_confirmed_queues_promoted_for_the_waitlist_head(event: Event) -> None:
    first, _ = fill(event)
    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")

    cancel(first.manage_token)

    _, promoted = emails_of("b@x.io")
    assert promoted.kind == OutboxEmail.Kind.PROMOTED
    assert Registration.objects.get(email="b@x.io").ticket_code in promoted.body
    assert [e.kind for e in emails_of("c@x.io")] == [OutboxEmail.Kind.WAITLISTED]
    assert [e.kind for e in emails_of(first.email)] == [OutboxEmail.Kind.TICKET]


def test_cancel_from_the_waitlist_queues_no_email(event: Event) -> None:
    fill(event)
    waitlisted = register(event.id, "b@x.io", "Bob").registration
    before = OutboxEmail.objects.count()

    cancel(waitlisted.manage_token)

    assert OutboxEmail.objects.count() == before


def test_repeated_cancel_queues_no_email(event: Event) -> None:
    first, _ = fill(event)
    register(event.id, "b@x.io", "Bob")
    cancel(first.manage_token)
    before = OutboxEmail.objects.count()

    cancel(first.manage_token)

    assert OutboxEmail.objects.count() == before


def test_cancel_with_an_empty_waitlist_queues_no_email(event: Event) -> None:
    first, _ = fill(event)
    before = OutboxEmail.objects.count()

    cancel(first.manage_token)

    assert OutboxEmail.objects.count() == before


def test_revival_after_cancel_queues_a_new_email_with_the_new_code(event: Event) -> None:
    registration = register(event.id, "a@x.io", "Ann").registration
    cancel(registration.manage_token)

    revived = register(event.id, "a@x.io", "Ann").registration

    old, new = emails_of("a@x.io")
    assert new.kind == OutboxEmail.Kind.TICKET
    assert revived.ticket_code != registration.ticket_code
    assert revived.ticket_code in new.body
    assert old.dedup_key != new.dedup_key


def test_revival_onto_the_waitlist_queues_a_new_waitlisted(event: Event) -> None:
    fill(event)
    registration = register(event.id, "b@x.io", "Bob").registration
    register(event.id, "c@x.io", "Cid")
    cancel(registration.manage_token)

    register(event.id, "b@x.io", "Bob")

    first, second = emails_of("b@x.io")
    assert first.kind == second.kind == OutboxEmail.Kind.WAITLISTED
    # Revived at the end of the queue, behind Cid.
    assert "№2" in second.body
