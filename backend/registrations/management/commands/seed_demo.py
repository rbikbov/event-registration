from datetime import timedelta
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.management.commands.create_demo_users import DEMO_ORGANIZER
from accounts.models import User
from events.models import Event
from registrations.services import register


class Command(BaseCommand):
    help = (
        "Add two demo events of the demo organizer with participants: a full one in a week and "
        "one tomorrow that is due for reminders (only with DJANGO_DEBUG=true)."
    )

    def handle(self, *args: Any, **options: Any) -> None:
        # Made-up people and emails to them do not belong to a deployment without DEBUG.
        if not settings.DEBUG:
            self.stderr.write("DEBUG is off: demo data is not created.")
            return
        call_command("create_demo_users")
        organizer = User.objects.get(email=DEMO_ORGANIZER[0])
        now = timezone.now()

        # Not idempotent on purpose: each run adds new events, so the one "tomorrow" is fresh
        # even when the previous one has started or been reminded of.
        full = Event.objects.create(
            organizer=organizer,
            title="Demo: a workshop with two seats",
            description="Both seats are taken, the third participant is on the waitlist.",
            starts_at=now + timedelta(days=7),
            capacity=2,
        )
        for i in range(1, 4):
            register(full.id, f"guest{i}@example.com", f"Guest {i}", now=now)

        # Inside the 24-hour window, with seats taken two days ago, that is before the window:
        # the worker's next reminder pass, within 30 s, queues a reminder for each.
        tomorrow = Event.objects.create(
            organizer=organizer,
            title="Demo: a meetup tomorrow",
            description="The participants will get a reminder a day before.",
            starts_at=now + timedelta(hours=23),
            capacity=10,
        )
        for i in range(1, 4):
            register(
                tomorrow.id, f"member{i}@example.com", f"Member {i}", now=now - timedelta(days=2)
            )

        self.stdout.write(f"Demo events {full.id} and {tomorrow.id} are ready.")
