from typing import Any

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from config.exceptions import Conflict, ValidationErrorSerializer
from events.models import Event
from events.services import get_org_event
from registrations.models import Registration
from registrations.serializers import (
    CheckInRequestSerializer,
    CheckInResultSerializer,
    OrgRegistrationSerializer,
    RegisterRequestSerializer,
    RegistrationFilterSerializer,
    RegistrationResultSerializer,
    TicketSerializer,
)
from registrations.services import (
    TicketCheckedIn,
    TicketNotConfirmed,
    cancel,
    check_in,
    event_registrations,
    get_ticket,
    mask_email,
    register,
)


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
            "checked_in_at": registration.checked_in_at,
            "event": registration.event,
        }
        if registration.status == Registration.Status.CONFIRMED:
            payload["ticket_code"] = registration.ticket_code
        if ticket.position is not None:
            payload["position"] = ticket.position
        return Response(TicketSerializer(payload).data)


class CancelView(APIView):
    """Cancels a registration by the secret manage token. Repeating it changes nothing.

    A checked-in ticket cannot be cancelled: its holder has already taken the seat.
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        request=None,
        responses={
            200: RegistrationResultSerializer,
            404: OpenApiResponse(description="Unknown token"),
            409: OpenApiResponse(description="The ticket is checked in at the entrance"),
        },
    )
    def post(self, request: Request, manage_token: str) -> Response:
        try:
            registration = cancel(manage_token)
        except Registration.DoesNotExist:
            raise NotFound from None
        except TicketCheckedIn:
            raise Conflict from None
        return Response(RegistrationResultSerializer({"status": registration.status}).data)


class CheckInView(APIView):
    """The organizer checks a ticket in by the code the participant shows at the entrance."""

    @extend_schema(
        request=CheckInRequestSerializer,
        responses={
            200: CheckInResultSerializer,
            400: ValidationErrorSerializer,
            403: OpenApiResponse(description="Another organizer's event"),
            404: OpenApiResponse(description="No such event, or no such ticket at it"),
            409: OpenApiResponse(description="The ticket is waitlisted or cancelled"),
        },
    )
    def post(self, request: Request, event_id: int) -> Response:
        event = get_org_event(request.user, event_id)  # type: ignore[arg-type]  # IsAuthenticated: never AnonymousUser here
        serializer = CheckInRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = check_in(event.id, serializer.validated_data["code"])
        except Registration.DoesNotExist:
            raise NotFound from None
        except TicketNotConfirmed:
            raise Conflict from None
        registration = result.registration
        payload = {
            "result": "already_checked_in" if result.already_checked_in else "checked_in",
            "name": registration.name,
            "masked_email": mask_email(registration.email),
            "checked_in_at": registration.checked_in_at,
        }
        return Response(CheckInResultSerializer(payload).data)


class OrgRegistrationListView(ListAPIView[Registration]):
    """A page of the event's participants for the organizer, in queue order, of one status or all.

    The number of pages comes from the counts of the event, not from this response.
    """

    serializer_class = OrgRegistrationSerializer

    @extend_schema(
        parameters=[RegistrationFilterSerializer],
        responses={
            200: OrgRegistrationSerializer(many=True),
            400: ValidationErrorSerializer,
            403: OpenApiResponse(description="Another organizer's event"),
            404: OpenApiResponse(description="No such event"),
        },
    )
    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().get(request, *args, **kwargs)

    def get_queryset(self) -> QuerySet[Registration]:
        event = get_org_event(self.request.user, self.kwargs["event_id"])  # type: ignore[arg-type]  # IsAuthenticated: never AnonymousUser here
        query = RegistrationFilterSerializer(data=self.request.query_params)
        query.is_valid(raise_exception=True)
        return event_registrations(
            event.id, query.validated_data.get("status"), query.validated_data["page"]
        )
