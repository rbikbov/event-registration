from collections.abc import Iterator

import pytest
from django.contrib.auth import authenticate
from django.core.management import call_command
from django.test import override_settings

from accounts.models import User

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("debug_on")]


@pytest.fixture
def debug_on() -> Iterator[None]:
    with override_settings(DEBUG=True):
        yield


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


@pytest.mark.parametrize("existing", [False, True])
def test_creates_nothing_and_keeps_passwords_when_debug_is_off(existing: bool) -> None:
    if existing:
        User.objects.create_user(email="demo@example.com", password="own-password")

    with override_settings(DEBUG=False):
        call_command("create_demo_users")

    assert User.objects.count() == (1 if existing else 0)
    if existing:
        assert User.objects.get().check_password("own-password")
