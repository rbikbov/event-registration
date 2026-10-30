from typing import Any

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from config.exceptions import ValidationErrorSerializer
from events.models import Event
from registrations.serializers import RegisterRequestSerializer, RegistrationResultSerializer
from registrations.services import register


class RegisterView(APIView):
    """Registers a participant by email. Open to everyone and independent of the session."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        request=RegisterRequestSerializer,
        responses={
            200: RegistrationResultSerializer,
            201: RegistrationResultSerializer,
            400: ValidationErrorSerializer,
            404: OpenApiResponse(description="No such event"),
        },
    )
    def post(self, request: Request, event_id: int) -> Response:
        serializer = RegisterRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = register(event_id, **serializer.validated_data)
        except Event.DoesNotExist:
            raise NotFound from None
        payload: dict[str, Any] = {"status": result.registration.status}
        if result.position is not None:
            payload["position"] = result.position
        return Response(
            RegistrationResultSerializer(payload).data,
            status=status.HTTP_201_CREATED if result.created else status.HTTP_200_OK,
        )
