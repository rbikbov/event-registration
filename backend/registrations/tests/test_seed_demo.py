from collections.abc import Iterator
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from emails.models import OutboxEmail
from events.models import Event
from registrations.services import enqueue_reminders

pytestmark = pytest.mark.django_db


@pytest.fixture
def debug_on() -> Iterator[None]:
    with override_settings(DEBUG=True):
        yield


def statuses(event: Event) -> list[str]:
    return sorted(event.registrations.values_list("status", flat=True))


@pytest.mark.usefixtures("debug_on")
def test_seeds_a_full_event_and_one_that_is_due_for_reminders() -> None:
    call_command("seed_demo")

    week, tomorrow = Event.objects.filter(organizer__email="demo@example.com").order_by(
        "-starts_at"
    )
    assert week.capacity == 2
    assert statuses(week) == ["confirmed", "confirmed", "waitlisted"]
    assert tomorrow.capacity == 10
    assert statuses(tomorrow) == ["confirmed"] * 3
    for event in (week, tomorrow):
        assert "демо" in event.title.lower()
        assert all(
            e.endswith("@example.com") for e in event.registrations.values_list("email", flat=True)
        )
    # Every registration went through `register`: each has its ticket or waitlist email.
    assert OutboxEmail.objects.count() == 6
    # A minute later, as the worker would: the reminders of the event tomorrow.
    assert enqueue_reminders(now=timezone.now() + timedelta(minutes=1)) == 3


@pytest.mark.usefixtures("debug_on")
def test_each_run_adds_new_events() -> None:
    call_command("seed_demo")
    call_command("seed_demo")

    assert Event.objects.count() == 4


@override_settings(DEBUG=False)
def test_without_debug_seeds_nothing() -> None:
    call_command("seed_demo")

    assert Event.objects.count() == 0
