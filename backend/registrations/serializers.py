from typing import Any

from rest_framework import serializers

from events.models import Event
from registrations.models import Registration


class RegisterRequestSerializer(serializers.Serializer[None]):
    email = serializers.EmailField(max_length=254)
    name = serializers.CharField(max_length=200)


class RegistrationResultSerializer(serializers.Serializer[dict[str, Any]]):
    """What the participant sees: no ticket code or manage token, they go out by email only.

    `position` is present only for a waitlisted registration.
    """

    status = serializers.ChoiceField(choices=Registration.Status.choices)
    position = serializers.IntegerField(min_value=1, required=False)


class CheckInRequestSerializer(serializers.Serializer[None]):
    code = serializers.CharField(max_length=32)


class CheckInResultSerializer(serializers.Serializer[dict[str, Any]]):
    """What the entrance screen shows: no full email, the queue can see the screen.

    A repeat is `already_checked_in` with the time of the first check-in.
    """

    result = serializers.ChoiceField(choices=["checked_in", "already_checked_in"])
    name = serializers.CharField()
    masked_email = serializers.CharField()
    checked_in_at = serializers.DateTimeField()


class TicketEventSerializer(serializers.ModelSerializer[Event]):
    class Meta:
        model = Event
        fields = ("id", "title", "starts_at")
        read_only_fields = fields


class TicketSerializer(serializers.Serializer[dict[str, Any]]):
    """The ticket page behind the manage token from the email.

    `ticket_code` is present only for a confirmed registration, `position` only for a
    waitlisted one. `checked_in_at` is null until the ticket is checked in at the entrance.
    """

    status = serializers.ChoiceField(choices=Registration.Status.choices)
    ticket_code = serializers.CharField(required=False)
    position = serializers.IntegerField(min_value=1, required=False)
    name = serializers.CharField()
    checked_in_at = serializers.DateTimeField(allow_null=True)
    event = TicketEventSerializer()
