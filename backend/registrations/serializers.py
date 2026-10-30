from rest_framework import serializers

from registrations.models import Registration


class RegisterRequestSerializer(serializers.Serializer[None]):
    email = serializers.EmailField(max_length=254)
    name = serializers.CharField(max_length=200)


class RegistrationResultSerializer(serializers.ModelSerializer[Registration]):
    """What the participant sees: no ticket code or manage token, they go out by email only."""

    class Meta:
        model = Registration
        fields = ("status",)
        read_only_fields = fields
