import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_field_errors_are_codes_under_errors() -> None:
    response = APIClient().post("/api/auth/login/", {"email": "not-an-email", "password": "x"})

    assert response.status_code == 400
    assert response.json() == {"errors": {"email": ["invalid"]}}


def test_missing_field_has_required_code() -> None:
    response = APIClient().post("/api/auth/login/", {})

    assert response.json() == {"errors": {"email": ["required"], "password": ["required"]}}


def test_error_not_tied_to_a_field_is_under_non_field_errors() -> None:
    response = APIClient().post("/api/auth/login/", {"email": "a@example.com", "password": "x"})

    assert response.json() == {"errors": {"non_field_errors": ["invalid_credentials"]}}


def test_other_errors_keep_the_drf_body() -> None:
    response = APIClient().get("/api/auth/me/")

    assert response.status_code == 401
    assert set(response.json()) == {"detail"}
