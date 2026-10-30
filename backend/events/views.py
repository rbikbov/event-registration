from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListCreateAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer

from config.exceptions import ValidationErrorSerializer
from events.models import Event
from events.serializers import EventSerializer


class OrgEventListView(ListCreateAPIView[Event]):
    """The signed-in organizer's own events; creating one makes the caller its organizer."""

    serializer_class = EventSerializer

    @extend_schema(responses={201: EventSerializer, 400: ValidationErrorSerializer})
    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().post(request, *args, **kwargs)

    def get_queryset(self):  # type: ignore[no-untyped-def]
        return Event.objects.for_organizer(self.request.user)  # type: ignore[arg-type]

    def perform_create(self, serializer: BaseSerializer[Event]) -> None:
        serializer.save(organizer=self.request.user)
