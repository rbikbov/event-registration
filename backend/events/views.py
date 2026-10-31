from typing import Any

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from config.exceptions import ValidationErrorSerializer
from events.models import Event
from events.serializers import (
    EventSerializer,
    OrgEventSerializer,
    PublicEventListSerializer,
    PublicEventSerializer,
)
from events.services import get_org_event


class OrgEventListView(ListCreateAPIView[Event]):
    """The signed-in organizer's own events; creating one makes the caller its organizer."""

    serializer_class = EventSerializer

    @extend_schema(responses={201: EventSerializer, 400: ValidationErrorSerializer})
    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().post(request, *args, **kwargs)

    def get_queryset(self):  # type: ignore[no-untyped-def]
        return Event.objects.for_organizer(self.request.user).with_registration_counts()  # type: ignore[arg-type]

    def perform_create(self, serializer: BaseSerializer[Event]) -> None:
        serializer.save(organizer=self.request.user)


class OrgEventDetailView(APIView):
    """The organizer's event panel: the event with its registration counts."""

    @extend_schema(
        responses={
            200: OrgEventSerializer,
            403: OpenApiResponse(description="Another organizer's event"),
            404: OpenApiResponse(description="No such event"),
        },
    )
    def get(self, request: Request, event_id: int) -> Response:
        event = get_org_event(
            request.user,  # type: ignore[arg-type]  # IsAuthenticated: never AnonymousUser here
            event_id,
            Event.objects.with_registration_counts(),
        )
        return Response(OrgEventSerializer(event).data)


class PublicEventListView(ListAPIView[Event]):
    """Future events with their free seat count (full ones stay in the list), for everyone."""

    # No session authentication: a public endpoint must not depend on cookies or CSRF.
    authentication_classes = ()
    permission_classes = (AllowAny,)
    serializer_class = PublicEventListSerializer

    def get_queryset(self) -> QuerySet[Event]:
        return Event.objects.upcoming().with_registration_counts()


class PublicEventDetailView(RetrieveAPIView[Event]):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    serializer_class = PublicEventSerializer

    def get_queryset(self) -> QuerySet[Event]:
        return Event.objects.with_registration_counts()
