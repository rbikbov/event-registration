import pytest
from django.contrib.auth import authenticate
from django.db import IntegrityError

from accounts.models import User

pytestmark = pytest.mark.django_db


def test_create_user_stores_email_lowercase() -> None:
    user = User.objects.create_user(email="  Organizer@Example.COM ", password="secret-pass-1")

    assert user.email == "organizer@example.com"
    assert not user.is_staff
    assert not user.is_superuser


def test_email_is_unique_regardless_of_case() -> None:
    User.objects.create_user(email="organizer@example.com", password="secret-pass-1")

    with pytest.raises(IntegrityError):
        User.objects.create_user(email="ORGANIZER@example.com", password="secret-pass-2")


def test_authenticate_by_email_in_any_case() -> None:
    User.objects.create_user(email="organizer@example.com", password="secret-pass-1")

    user = authenticate(username="Organizer@Example.com", password="secret-pass-1")

    assert user is not None
    assert user.email == "organizer@example.com"


def test_create_superuser_sets_admin_flags() -> None:
    user = User.objects.create_superuser(email="admin@example.com", password="secret-pass-1")

    assert user.is_staff
    assert user.is_superuser
