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
        if value <= timezone.now():
            raise serializers.ValidationError("Start must be in the future.", code="past")
        return value


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
