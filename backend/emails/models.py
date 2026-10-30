from typing import ClassVar

from django.db import models
from django.utils import timezone

from registrations.models import Registration


class OutboxEmail(models.Model):
    """An email queued in the transaction of the change it reports; a worker sends it later.

    Subject and body are a snapshot taken at that change: sending does not re-read the
    registration, which may have changed by then.
    """

    class Kind(models.TextChoices):
        TICKET = "ticket"
        WAITLISTED = "waitlisted"
        PROMOTED = "promoted"

    class Status(models.TextChoices):
        PENDING = "pending"
        SENT = "sent"
        FAILED = "failed"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    registration = models.ForeignKey(Registration, on_delete=models.CASCADE, related_name="emails")
    dedup_key = models.CharField(max_length=100, unique=True)
    to = models.EmailField()
    subject = models.CharField(max_length=300)
    body = models.TextField()
    status = models.CharField(max_length=7, choices=Status.choices, default=Status.PENDING)
    attempts = models.IntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(kind__in=["ticket", "waitlisted", "promoted"]),
                name="outboxemail_kind_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["pending", "sent", "failed"]),
                name="outboxemail_status_valid",
            ),
        ]
        indexes: ClassVar[list[models.Index]] = [
            # The worker picks pending emails that are due.
            models.Index(fields=["status", "next_attempt_at"], name="outboxemail_due_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.kind} #{self.id} ({self.status})"
