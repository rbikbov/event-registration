from django.contrib import admin

from events.models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin[Event]):
    list_display = ("title", "starts_at", "capacity", "organizer")
    list_select_related = ("organizer",)
    search_fields = ("title", "organizer__email")
