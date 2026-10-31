from django.contrib import admin
from django.urls import path

from accounts.views import LoginView, LogoutView, MeView
from config.health import HealthView
from events.views import (
    OrgEventDetailView,
    OrgEventListView,
    PublicEventDetailView,
    PublicEventListView,
)
from registrations.views import (
    CancelView,
    CheckInView,
    OrgRegistrationListView,
    RegisterView,
    TicketView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", LoginView.as_view(), name="login"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/org/events/", OrgEventListView.as_view(), name="org-events"),
    path("api/org/events/<int:event_id>/", OrgEventDetailView.as_view(), name="org-event"),
    path(
        "api/org/events/<int:event_id>/registrations/",
        OrgRegistrationListView.as_view(),
        name="org-registrations",
    ),
    path("api/org/events/<int:event_id>/checkin/", CheckInView.as_view(), name="checkin"),
    path("api/events/", PublicEventListView.as_view(), name="events"),
    path("api/events/<int:pk>/", PublicEventDetailView.as_view(), name="event"),
    path("api/events/<int:event_id>/registrations/", RegisterView.as_view(), name="register"),
    path("api/tickets/<str:manage_token>/", TicketView.as_view(), name="ticket"),
    path("api/tickets/<str:manage_token>/cancel/", CancelView.as_view(), name="cancel"),
    path("api/health/", HealthView.as_view(), name="health"),
]
