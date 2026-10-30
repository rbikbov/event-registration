from datetime import datetime

from django.utils import timezone
from rest_framework import serializers

from events.models import Event


class EventSerializer(serializers.ModelSerializer[Event]):
    class Meta:
        model = Event
        fields = ("id", "title", "description", "starts_at", "capacity")
        read_only_fields = ("id",)

    def validate_starts_at(self, value: datetime) -> datetime:
        if value <= timezone.now():
            raise serializers.ValidationError("Start must be in the future.", code="past")
        return value
