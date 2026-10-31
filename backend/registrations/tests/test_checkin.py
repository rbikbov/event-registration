from collections.abc import Callable
from datetime import timedelta

import pytest
from django.db import IntegrityError, connection
from django.utils import timezone

from accounts.models import User
from events.models import Event
from registrations.models import Registration
from registrations.services import TicketNotConfirmed, check_in, mask_email

pytestmark = pytest.mark.django_db


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password="x")


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


def confirmed(event: Event, email: str = "ann@x.io") -> Registration:
    return Registration.objects.create(
        event=event, email=email, name="Ann", status=Registration.Status.CONFIRMED
    )


def test_check_in_marks_a_confirmed_ticket(event: Event) -> None:
    registration = confirmed(event)
    now = timezone.now()

    result = check_in(event.id, registration.ticket_code, now=now)

    assert not result.already_checked_in
    assert result.registration.id == registration.id
    assert result.registration.checked_in_at == now
    registration.refresh_from_db()
    assert registration.checked_in_at == now


@pytest.mark.parametrize(
    "typed",
    [
        lambda code: code.lower(),
        lambda code: f"  {code[:4]}-{code[4:]} ",
        lambda code: f"{code[:4]} {code[4:]}",
    ],
    ids=["lower case", "dash and padding", "inner space"],
)
def test_check_in_accepts_the_code_as_typed_at_the_entrance(
    event: Event, typed: Callable[[str], str]
) -> None:
    registration = confirmed(event)

    check_in(event.id, typed(registration.ticket_code))

    registration.refresh_from_db()
    assert registration.checked_in_at is not None


def test_a_repeat_check_in_reports_the_first_time_and_changes_nothing(event: Event) -> None:
    registration = confirmed(event)
    first = timezone.now()
    check_in(event.id, registration.ticket_code, now=first)

    result = check_in(event.id, registration.ticket_code, now=first + timedelta(minutes=5))

    assert result.already_checked_in
    assert result.registration.checked_in_at == first
    registration.refresh_from_db()
    assert registration.checked_in_at == first


@pytest.mark.parametrize("status", [Registration.Status.WAITLISTED, Registration.Status.CANCELLED])
def test_check_in_of_a_ticket_that_is_not_confirmed_raises_and_marks_nothing(
    event: Event, status: str
) -> None:
    registration = Registration.objects.create(
        event=event, email="a@x.io", name="Ann", status=status
    )

    with pytest.raises(TicketNotConfirmed):
        check_in(event.id, registration.ticket_code)

    registration.refresh_from_db()
    assert registration.checked_in_at is None


def test_a_promotion_right_after_the_update_is_not_reported_as_a_repeat(event: Event) -> None:
    registration = Registration.objects.create(
        event=event, email="a@x.io", name="Ann", status=Registration.Status.WAITLISTED
    )
    promoted = False

    # A cancel with a promotion may commit between the UPDATE and the read that follows it:
    # `check_in` takes no event lock. Replay that moment right after the UPDATE.
    def promote_after_the_update(execute, sql, params, many, context):  # type: ignore[no-untyped-def]  # Django's execute_wrapper signature
        nonlocal promoted
        result = execute(sql, params, many, context)
        if not promoted and sql.startswith("UPDATE"):
            promoted = True
            Registration.objects.filter(id=registration.id).update(
                status=Registration.Status.CONFIRMED
            )
        return result

    with connection.execute_wrapper(promote_after_the_update), pytest.raises(TicketNotConfirmed):
        check_in(event.id, registration.ticket_code)

    assert promoted
    registration.refresh_from_db()
    assert registration.checked_in_at is None


def test_check_in_of_an_unknown_code_raises(event: Event) -> None:
    confirmed(event)

    with pytest.raises(Registration.DoesNotExist):
        check_in(event.id, "ZZZZZZZZ")


def test_check_in_of_another_events_code_raises_and_marks_nothing(
    event: Event, organizer: User
) -> None:
    other = confirmed(make_event(organizer))

    with pytest.raises(Registration.DoesNotExist):
        check_in(event.id, other.ticket_code)

    other.refresh_from_db()
    assert other.checked_in_at is None


@pytest.mark.parametrize("status", [Registration.Status.WAITLISTED, Registration.Status.CANCELLED])
def test_only_a_confirmed_registration_can_be_checked_in_in_the_database(
    event: Event, status: str
) -> None:
    with pytest.raises(IntegrityError):
        Registration.objects.create(
            event=event, email="a@x.io", name="Ann", status=status, checked_in_at=timezone.now()
        )


@pytest.mark.parametrize(
    ("email", "masked"),
    [
        ("ivan@gmail.com", "iv***@gmail.com"),
        ("ann@x.io", "an***@x.io"),
        ("jo@x.io", "j***@x.io"),
        ("j@x.io", "j***@x.io"),
    ],
)
def test_mask_email_keeps_the_start_of_the_mailbox_and_the_domain(email: str, masked: str) -> None:
    assert mask_email(email) == masked
