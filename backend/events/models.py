from typing import ClassVar, Self

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Count, F, Q
from django.utils import timezone

from accounts.models import User

MAX_CAPACITY = 10000


class EventQuerySet(models.QuerySet["Event"]):
    def for_organizer(self, user: User) -> Self:
        return self.filter(organizer=user).order_by("starts_at", "id")

    def upcoming(self) -> Self:
        return self.filter(starts_at__gt=timezone.now()).order_by("starts_at", "id")

    def with_registration_counts(self) -> Self:
        # Statuses are Registration.Status values; events cannot import registrations (it imports
        # events), so the counts go through the reverse relation by string value.
        return self.annotate(
            confirmed=Count("registrations", filter=Q(registrations__status="confirmed")),
            waitlisted=Count("registrations", filter=Q(registrations__status="waitlisted")),
            # A checked-in ticket is always confirmed (a CHECK on Registration).
            checked_in=Count("registrations", filter=Q(registrations__checked_in_at__isnull=False)),
            free_seats=F("capacity") - F("confirmed"),
        )


class Event(models.Model):
    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="events"
    )
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=2000, blank=True)
    starts_at = models.DateTimeField()
    capacity = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(MAX_CAPACITY)]
    )

    objects: ClassVar[EventQuerySet] = EventQuerySet.as_manager()  # type: ignore[assignment]  # manager built from the queryset

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(condition=models.Q(capacity__gt=0), name="event_capacity_gt_0"),
        ]

    def __str__(self) -> str:
        return self.title
