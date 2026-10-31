import secrets
from typing import ClassVar

from django.db import models
from django.utils import timezone

from events.models import Event

# No 0/O and 1/I: the code is read aloud and typed at the entrance.
TICKET_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
TICKET_CODE_LENGTH = 8


def new_ticket_code() -> str:
    return "".join(secrets.choice(TICKET_CODE_ALPHABET) for _ in range(TICKET_CODE_LENGTH))


def new_manage_token() -> str:
    return secrets.token_urlsafe(32)


class Registration(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "confirmed"
        WAITLISTED = "waitlisted"
        CANCELLED = "cancelled"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registrations")
    email = models.EmailField()
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=10, choices=Status.choices)
    queued_at = models.DateTimeField(default=timezone.now)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    ticket_code = models.CharField(
        max_length=TICKET_CODE_LENGTH, unique=True, default=new_ticket_code
    )
    manage_token = models.CharField(max_length=64, unique=True, default=new_manage_token)
    checked_in_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["event", "email"], name="registration_event_email_uniq"
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["confirmed", "waitlisted", "cancelled"]),
                name="registration_status_valid",
            ),
            # A ticket that let someone in is neither cancelled nor back on the waitlist.
            models.CheckConstraint(
                condition=models.Q(checked_in_at__isnull=True) | models.Q(status="confirmed"),
                name="registration_checked_in_is_confirmed",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.email} ({self.status})"
