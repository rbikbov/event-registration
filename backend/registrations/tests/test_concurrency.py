import threading
from collections.abc import Callable, Sequence
from datetime import timedelta
from functools import partial

import pytest
from django.db import connection
from django.utils import timezone

from accounts.models import User
from events.models import Event
from registrations.models import Registration
from registrations.services import cancel, register, waitlist_position

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


def run_together[T](calls: Sequence[Callable[[], T]]) -> list[T]:
    """Run the calls in threads released at the same moment; re-raise the first failure."""
    barrier = threading.Barrier(len(calls))
    results: list[T | None] = [None] * len(calls)
    errors: list[BaseException] = []

    def worker(index: int) -> None:
        try:
            barrier.wait(timeout=10)
            results[index] = calls[index]()
        except BaseException as exc:
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(len(calls))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    if errors:
        raise errors[0]
    return results  # type: ignore[return-value]  # no None left: every worker either set it or raised


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
