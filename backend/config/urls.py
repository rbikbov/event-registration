from django.contrib import admin
from django.urls import path

from accounts.views import LoginView, LogoutView, MeView
from config.health import HealthView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", LoginView.as_view(), name="login"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/health/", HealthView.as_view(), name="health"),
]
