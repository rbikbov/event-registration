from datetime import datetime

from django.utils import timezone
from rest_framework import serializers

from events.models import Event


class EventSerializer(serializers.ModelSerializer[Event]):
    # Annotated on the list; a just-created event has no registrations.
    confirmed = serializers.IntegerField(read_only=True, default=0)
    waitlisted = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Event
        fields = ("id", "title", "description", "starts_at", "capacity", "confirmed", "waitlisted")
        read_only_fields = ("id",)

    def validate_starts_at(self, value: datetime) -> datetime:
        return future_start(value)


def future_start(value: datetime) -> datetime:
    if value <= timezone.now():
        raise serializers.ValidationError("Start must be in the future.", code="past")
    return value


class OrgEventSerializer(serializers.ModelSerializer[Event]):
    """The organizer's event panel: the event and its counts, annotated by the queryset."""

    confirmed = serializers.IntegerField(read_only=True)
    waitlisted = serializers.IntegerField(read_only=True)
    checked_in = serializers.IntegerField(read_only=True)
    free_seats = serializers.IntegerField(read_only=True)
    # With the other counts, the number of pages of the participant list for any filter.
    cancelled = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = (
            "id",
            "title",
            "description",
            "starts_at",
            "capacity",
            "confirmed",
            "waitlisted",
            "checked_in",
            "free_seats",
            "cancelled",
        )
        read_only_fields = fields


# Validates against the event as `instance` with `partial=True`; `save()` is not used: the change
# has side effects (emails, promotion), the service makes it under the event lock.
class EventUpdateSerializer(serializers.ModelSerializer[Event]):
    """The fields of the event the organizer changes; any subset of them, checked as on creation."""

    class Meta:
        model = Event
        fields = ("title", "description", "starts_at", "capacity")

    def validate_starts_at(self, value: datetime) -> datetime:
        # A start sent unchanged is no reschedule: an event under way keeps its past start.
        if self.instance is not None and value == self.instance.starts_at:
            return value
        return future_start(value)


class PublicEventListSerializer(serializers.ModelSerializer[Event]):
    free_seats = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = ("id", "title", "starts_at", "capacity", "free_seats")
        read_only_fields = fields


class PublicEventSerializer(serializers.ModelSerializer[Event]):
    free_seats = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = ("id", "title", "description", "starts_at", "capacity", "free_seats")
        read_only_fields = fields
