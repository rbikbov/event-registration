from datetime import datetime
from typing import Any

from django import forms
from django.contrib import admin
from django.http import HttpRequest
from django.utils import timezone

from events.models import Event


class EventAdminForm(forms.ModelForm[Event]):
    def clean_starts_at(self) -> datetime:
        # The field is in the form only on add: on change it is read-only (see below).
        value: datetime = self.cleaned_data["starts_at"]
        if value <= timezone.now():
            raise forms.ValidationError("Start must be in the future.", code="past")
        return value


@admin.register(Event)
class EventAdmin(admin.ModelAdmin[Event]):
    """Deleting an event with registrations is refused by the admin itself: it would cascade
    to registrations, which are read-only here (registrations/admin.py)."""

    form = EventAdminForm
    list_display = ("title", "starts_at", "capacity", "organizer")
    list_select_related = ("organizer",)
    search_fields = ("title", "organizer__email")

    def get_readonly_fields(self, request: HttpRequest, obj: Any = None) -> tuple[str, ...]:
        # A plain save skips the event lock and the side effects: a larger capacity must
        # promote the waitlist, a new date must notify participants.
        if obj is None:
            return ()
        return ("organizer", "starts_at", "capacity")
