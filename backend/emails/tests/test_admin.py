import pytest
from django.contrib import admin
from django.test import RequestFactory

from emails.models import OutboxEmail

pytestmark = pytest.mark.django_db


def test_outbox_email_admin_is_read_only() -> None:
    model_admin = admin.site._registry[OutboxEmail]
    request = RequestFactory().get("/admin/")

    assert model_admin.has_add_permission(request) is False
    assert model_admin.has_change_permission(request) is False
    assert model_admin.has_delete_permission(request) is False
