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
from registrations.models import Registration
from registrations.serializers import (
    RegisterRequestSerializer,
    RegistrationResultSerializer,
    TicketSerializer,
)
from registrations.services import cancel, get_ticket, register


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


class TicketView(APIView):
    """The ticket by the secret manage token from the email: status, code or waitlist place."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        responses={
            200: TicketSerializer,
            404: OpenApiResponse(description="Unknown token"),
        },
    )
    def get(self, request: Request, manage_token: str) -> Response:
        try:
            ticket = get_ticket(manage_token)
        except Registration.DoesNotExist:
            raise NotFound from None
        registration = ticket.registration
        payload: dict[str, Any] = {
            "status": registration.status,
            "name": registration.name,
            "event": registration.event,
        }
        if registration.status == Registration.Status.CONFIRMED:
            payload["ticket_code"] = registration.ticket_code
        if ticket.position is not None:
            payload["position"] = ticket.position
        return Response(TicketSerializer(payload).data)


class CancelView(APIView):
    """Cancels a registration by the secret manage token. Repeating it changes nothing."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        request=None,
        responses={
            200: RegistrationResultSerializer,
            404: OpenApiResponse(description="Unknown token"),
        },
    )
    def post(self, request: Request, manage_token: str) -> Response:
        try:
            registration = cancel(manage_token)
        except Registration.DoesNotExist:
            raise NotFound from None
        return Response(RegistrationResultSerializer({"status": registration.status}).data)
