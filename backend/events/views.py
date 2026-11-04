from collections.abc import Iterable
from typing import Any

from django.db.models import QuerySet
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.generics import CreateAPIView, RetrieveAPIView
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.parsers import BaseParser
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from config.exceptions import ValidationErrorSerializer
from events.models import Event, EventQuerySet
from events.realtime import Snapshot, snapshot_stream
from events.serializers import (
    EventListQuerySerializer,
    EventSerializer,
    OrgEventPageSerializer,
    OrgEventSerializer,
    PublicEventPageSerializer,
    PublicEventSerializer,
)
from events.services import EventPage, event_page, get_org_event


def requested_page(request: Request, events: EventQuerySet) -> EventPage:
    query = EventListQuerySerializer(data=request.query_params)
    query.is_valid(raise_exception=True)
    return event_page(events, query.validated_data["period"], query.validated_data["page"])


class OrgEventListView(CreateAPIView[Event]):
    """The signed-in organizer's own events, a page of a period; creating one makes the caller
    its organizer.
    """

    serializer_class = EventSerializer

    # An APIView's GET reads as "retrieve"; the id names it a list, as before the pages.
    @extend_schema(
        operation_id="org_events_list",
        parameters=[EventListQuerySerializer],
        responses={200: OrgEventPageSerializer, 400: ValidationErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        events = Event.objects.for_organizer(request.user)  # type: ignore[arg-type]  # IsAuthenticated: never AnonymousUser here
        return Response(OrgEventPageSerializer(requested_page(request, events)).data)

    @extend_schema(responses={201: EventSerializer, 400: ValidationErrorSerializer})
    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().post(request, *args, **kwargs)

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


def snapshot_response(event_id: int, snapshot: Snapshot) -> StreamingHttpResponse:
    response = StreamingHttpResponse(
        snapshot_stream(event_id, snapshot), content_type="text/event-stream"
    )
    response["Cache-Control"] = "no-cache"
    # Turns nginx proxy buffering off for the stream: buffering alone does not hold it back,
    # buffering with gzip does (measured behind nginx 1.30).
    response["X-Accel-Buffering"] = "no"
    return response


# Snapshots at module level: streams share a snapshot read by one function, a closure per
# request would make each stream read its own.
def org_event_snapshot(event_id: int) -> dict[str, Any]:
    event = Event.objects.with_registration_counts().get(pk=event_id)
    return OrgEventSerializer(event).data


class OrgEventStreamView(APIView):
    """The organizer's event panel live: the event with its counts, as server-sent events."""

    content_negotiation_class = IgnoreAccept

    @extend_schema(
        description=(
            "`text/event-stream`. Each message is `event: snapshot` with the event as JSON in"
            " `data`, as GET of the event has it: the first one right after connecting, then"
            " one after each change of its counts."
        ),
        responses={
            (200, "text/event-stream"): OrgEventSerializer,
            403: OpenApiResponse(description="Another organizer's event"),
            404: OpenApiResponse(description="No such event"),
        },
    )
    def get(self, request: Request, event_id: int) -> StreamingHttpResponse:
        # Rights are checked once, on connecting.
        get_org_event(request.user, event_id)  # type: ignore[arg-type]  # IsAuthenticated: never AnonymousUser here

        return snapshot_response(event_id, org_event_snapshot)


class PublicEventListView(APIView):
    """A page of upcoming or past events with their free seat count (full ones stay in the
    list), for everyone.
    """

    # No session authentication: a public endpoint must not depend on cookies or CSRF.
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        operation_id="events_list",
        parameters=[EventListQuerySerializer],
        responses={200: PublicEventPageSerializer, 400: ValidationErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        page = requested_page(request, Event.objects.all())
        return Response(PublicEventPageSerializer(page).data)


class PublicEventDetailView(RetrieveAPIView[Event]):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    serializer_class = PublicEventSerializer

    def get_queryset(self) -> QuerySet[Event]:
        return Event.objects.with_registration_counts()


def public_event_snapshot(event_id: int) -> dict[str, Any]:
    event = Event.objects.with_registration_counts().get(pk=event_id)
    return PublicEventSerializer(event).data


class PublicEventStreamView(APIView):
    """The event page live: the event with its free seats, as server-sent events."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    content_negotiation_class = IgnoreAccept

    @extend_schema(
        description=(
            "`text/event-stream`. Each message is `event: snapshot` with the event as JSON in"
            " `data`, as GET of the event has it: the first one right after connecting, then"
            " one after each change of its counts."
        ),
        responses={
            (200, "text/event-stream"): PublicEventSerializer,
            404: OpenApiResponse(description="No such event"),
        },
    )
    def get(self, request: Request, event_id: int) -> StreamingHttpResponse:
        get_object_or_404(Event, pk=event_id)
        return snapshot_response(event_id, public_event_snapshot)
