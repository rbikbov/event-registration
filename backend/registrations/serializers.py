from typing import Any

from rest_framework import serializers

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
