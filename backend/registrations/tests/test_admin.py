import pytest
from django.contrib import admin
from django.test import RequestFactory

from registrations.models import Registration

pytestmark = pytest.mark.django_db


def test_registration_admin_is_read_only() -> None:
    model_admin = admin.site._registry[Registration]
    request = RequestFactory().get("/admin/")

    assert model_admin.has_add_permission(request) is False
    assert model_admin.has_change_permission(request) is False
    assert model_admin.has_delete_permission(request) is False
