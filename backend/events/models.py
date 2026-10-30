from typing import ClassVar, Self

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from accounts.models import User

MAX_CAPACITY = 10000


class EventQuerySet(models.QuerySet["Event"]):
    def for_organizer(self, user: User) -> Self:
        return self.filter(organizer=user).order_by("starts_at", "id")


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
