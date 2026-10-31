from collections.abc import Callable
from datetime import timedelta
from functools import partial

import pytest
from django.utils import timezone

from accounts.models import User
from config.tests.concurrency import run_together
from events.models import Event
from registrations.models import Registration
from registrations.services import (
    TicketCheckedIn,
    TicketNotConfirmed,
    cancel,
    check_in,
    register,
    waitlist_position,
)

# Threads open their own connections, so the data must be committed, not rolled back at the end.
pytestmark = pytest.mark.django_db(transaction=True)


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


def test_parallel_registrations_for_the_last_seat_confirm_exactly_one(event: Event) -> None:
    emails = [f"user{i}@x.io" for i in range(8)]

    results = run_together([partial(register, event.id, e, "Name") for e in emails])

    assert all(r.created for r in results)
    assert sorted(statuses(event).values()) == ["confirmed"] + ["waitlisted"] * 7
    # The number each caller was told is the one the queue still gives them.
    for r in results:
        assert r.position == waitlist_position(Registration.objects.get(id=r.registration.id))
    assert sorted(r.position for r in results if r.position is not None) == list(range(1, 8))


def test_parallel_registrations_never_exceed_capacity(event: Event) -> None:
    event.capacity = 3
    event.save()

    run_together([partial(register, event.id, f"user{i}@x.io", "Name") for i in range(10)])

    confirmed = Registration.objects.filter(event=event, status="confirmed").count()
    assert confirmed == 3
    assert Registration.objects.filter(event=event).count() == 10


def test_parallel_registrations_of_one_email_make_one_registration(event: Event) -> None:
    results = run_together([partial(register, event.id, "a@x.io", "Ann") for _ in range(8)])

    assert Registration.objects.filter(event=event).count() == 1
    assert sum(r.created for r in results) == 1
    assert len({r.registration.id for r in results}) == 1


def test_parallel_registrations_differing_only_by_case_make_one_registration(
    event: Event,
) -> None:
    variants = ["a@x.io", "A@x.io", "a@X.IO", " A@X.io "]

    run_together([partial(register, event.id, v, "Ann") for v in variants])

    assert Registration.objects.filter(event=event).count() == 1


def test_parallel_cancels_of_one_token_promote_exactly_one(event: Event) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    register(event.id, "b@x.io", "Bob")
    register(event.id, "c@x.io", "Cid")

    run_together([partial(cancel, first.manage_token) for _ in range(6)])

    assert statuses(event) == {"a@x.io": "cancelled", "b@x.io": "confirmed", "c@x.io": "waitlisted"}


def test_cancel_in_parallel_with_a_registration_keeps_the_seat_for_the_queue(
    event: Event,
) -> None:
    first = register(event.id, "a@x.io", "Ann").registration
    register(event.id, "b@x.io", "Bob")

    calls: list[Callable[[], object]] = [
        partial(cancel, first.manage_token),
        partial(register, event.id, "c@x.io", "Cid"),
    ]
    run_together(calls)

    # Whichever runs first, the earlier waitlisted Bob gets the freed seat, not the newcomer.
    assert statuses(event) == {"a@x.io": "cancelled", "b@x.io": "confirmed", "c@x.io": "waitlisted"}


def test_parallel_cancels_of_different_tokens_fill_seats_from_the_queue_in_order(
    event: Event,
) -> None:
    event.capacity = 2
    event.save()
    a = register(event.id, "a@x.io", "A").registration
    b = register(event.id, "b@x.io", "B").registration
    for email in ("c@x.io", "d@x.io", "e@x.io"):
        register(event.id, email, "N")

    run_together([partial(cancel, a.manage_token), partial(cancel, b.manage_token)])

    assert statuses(event) == {
        "a@x.io": "cancelled",
        "b@x.io": "cancelled",
        "c@x.io": "confirmed",
        "d@x.io": "confirmed",
        "e@x.io": "waitlisted",
    }


def test_parallel_check_ins_of_one_code_mark_it_once(event: Event) -> None:
    registration = Registration.objects.create(
        event=event, email="a@x.io", name="Ann", status=Registration.Status.CONFIRMED
    )

    results = run_together(
        [partial(check_in, event.id, registration.ticket_code) for _ in range(8)]
    )

    assert sorted(r.already_checked_in for r in results) == [False] + [True] * 7
    registration.refresh_from_db()
    # Every repeat reports the time of the one check-in that passed.
    assert {r.registration.checked_in_at for r in results} == {registration.checked_in_at}


def test_check_in_in_parallel_with_a_cancel_lets_exactly_one_pass(event: Event) -> None:
    event.capacity = 8
    event.save()
    tickets = [register(event.id, f"u{i}@x.io", "Name").registration for i in range(8)]

    def try_check_in(code: str) -> bool:
        try:
            check_in(event.id, code)
        except TicketNotConfirmed:
            return False
        return True

    def try_cancel(token: str) -> bool:
        try:
            cancel(token)
        except TicketCheckedIn:
            return False
        return True

    # Cancels queue on the event lock, check-ins do not: each pair can interleave.
    calls: list[Callable[[], bool]] = []
    for t in tickets:
        calls += [partial(try_check_in, t.ticket_code), partial(try_cancel, t.manage_token)]
    results = run_together(calls)

    for t, checked_in, cancelled in zip(tickets, results[::2], results[1::2], strict=True):
        assert checked_in != cancelled
        t.refresh_from_db()
        # The outcome the caller was told is the one stored.
        assert t.status == ("confirmed" if checked_in else "cancelled")
        assert (t.checked_in_at is not None) == checked_in
