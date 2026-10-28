from django.db import DatabaseError, connection
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

# One enum in the OpenAPI schema for both fields: SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"].
HEALTH_STATES = ("ok", "error")


class HealthSerializer(serializers.Serializer[dict[str, str]]):
    status = serializers.ChoiceField(choices=HEALTH_STATES)
    database = serializers.ChoiceField(choices=HEALTH_STATES)


class HealthView(APIView):
    """Liveness and database check for compose healthchecks, e2e and the frontend."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(responses={200: HealthSerializer, 503: HealthSerializer})
    def get(self, request: Request) -> Response:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except DatabaseError:
            return Response({"status": "error", "database": "error"}, status=503)
        return Response({"status": "ok", "database": "ok"})
