from typing import Any

from drf_spectacular.utils import inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


class Conflict(APIException):
    """The request is valid, but the state of the object does not allow it."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Conflict with the current state."
    default_code = "conflict"


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """DRF's handler, except that a 400 carries error codes instead of English messages.

    The interface is Russian, so the frontend maps `{"errors": {field: [code]}}` to its own
    texts. An error not tied to a field (raised in `validate()`) is under `non_field_errors`.
    """
    response = exception_handler(exc, context)
    if response is not None and isinstance(exc, ValidationError):
        codes = exc.get_codes()
        if not isinstance(codes, dict):
            codes = {"non_field_errors": codes}
        response.data = {"errors": codes}
    return response


# `errors` is a property of Serializer, so a declared field of that name cannot be a class
# attribute; inline_serializer builds the class with the field in place.
ValidationErrorSerializer = inline_serializer(
    name="ValidationError",
    fields={
        "errors": serializers.DictField(child=serializers.ListField(child=serializers.CharField()))
    },
)
