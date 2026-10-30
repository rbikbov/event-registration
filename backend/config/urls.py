from django.contrib import admin
from django.urls import path

from accounts.views import LoginView, LogoutView, MeView
from config.health import HealthView
from events.views import OrgEventListView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", LoginView.as_view(), name="login"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/org/events/", OrgEventListView.as_view(), name="org-events"),
    path("api/health/", HealthView.as_view(), name="health"),
]
