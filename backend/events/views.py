from collections.abc import Iterable
from typing import Any

from django.db.models import QuerySet
from django.http import StreamingHttpResponse
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.parsers import BaseParser
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from config.exceptions import ValidationErrorSerializer
from events.models import Event
from events.realtime import stats_stream
from events.serializers import (
    EventSerializer,
    OrgEventSerializer,
    OrgEventStatsSerializer,
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


class IgnoreAccept(BaseContentNegotiation):
    """The first parser and renderer, whatever the request accepts.

    EventSource sends `Accept: text/event-stream`, which no DRF renderer offers, so the default
    negotiation answers 406. The stream itself bypasses the renderer; errors go out as JSON.
    """

    def select_parser(self, request: Request, parsers: Iterable[BaseParser]) -> BaseParser:
        return next(iter(parsers))

    def select_renderer(
        self, request: Request, renderers: Iterable[BaseRenderer], format_suffix: str | None = None
    ) -> tuple[BaseRenderer, str]:
        renderer = next(iter(renderers))
        return renderer, renderer.media_type


class OrgEventStreamView(APIView):
    """Live counts of the organizer's event panel, as server-sent events."""

    content_negotiation_class = IgnoreAccept

    @extend_schema(
        description=(
            "`text/event-stream`. Each message is `event: stats` with the counts as JSON in"
            " `data`: the first one right after connecting, then one after each change."
        ),
        responses={
            (200, "text/event-stream"): OrgEventStatsSerializer,
            403: OpenApiResponse(description="Another organizer's event"),
            404: OpenApiResponse(description="No such event"),
        },
    )
    def get(self, request: Request, event_id: int) -> StreamingHttpResponse:
        # Rights are checked once, on connecting.
        get_org_event(request.user, event_id)  # type: ignore[arg-type]  # IsAuthenticated: never AnonymousUser here

        def snapshot() -> dict[str, int]:
            event = Event.objects.with_registration_counts().get(pk=event_id)
            return OrgEventStatsSerializer(event).data

        response = StreamingHttpResponse(
            stats_stream(event_id, snapshot), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        # nginx buffers proxied responses by default; this header turns it off for the stream.
        response["X-Accel-Buffering"] = "no"
        return response


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
