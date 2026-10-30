from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from emails.models import OutboxEmail


@admin.register(OutboxEmail)
class OutboxEmailAdmin(admin.ModelAdmin[OutboxEmail]):
    """Read-only: emails are queued by services and sent by the worker."""

    list_display = ("id", "kind", "to", "status", "attempts", "created_at", "sent_at")
    list_filter = ("status", "kind")
    search_fields = ("to",)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False
