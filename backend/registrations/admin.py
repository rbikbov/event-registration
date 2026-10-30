from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from registrations.models import Registration


@admin.register(Registration)
class RegistrationAdmin(admin.ModelAdmin[Registration]):
    """Read-only: registrations change only through services that hold the event lock."""

    list_display = ("email", "name", "event", "status", "queued_at")
    list_filter = ("status",)
    list_select_related = ("event",)
    search_fields = ("email", "event__title")

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False
