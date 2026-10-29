import pytest
from django.contrib.auth import authenticate
from django.core.management import call_command

from accounts.models import User

pytestmark = pytest.mark.django_db


def test_creates_organizer_and_separate_admin() -> None:
    call_command("create_demo_users")

    organizer = User.objects.get(email="demo@example.com")
    admin = User.objects.get(email="admin@example.com")
    assert authenticate(username="demo@example.com", password="demo") == organizer
    assert authenticate(username="admin@example.com", password="admin") == admin
    assert not organizer.is_staff
    assert admin.is_staff
    assert admin.is_superuser


def test_is_idempotent_and_restores_passwords() -> None:
    call_command("create_demo_users")
    organizer = User.objects.get(email="demo@example.com")
    organizer.set_password("changed")
    organizer.save()

    call_command("create_demo_users")

    assert User.objects.count() == 2
    organizer.refresh_from_db()
    assert organizer.check_password("demo")
