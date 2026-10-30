import pytest
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

PASSWORD = "secret-pass-1"


@pytest.fixture
def organizer() -> User:
    return User.objects.create_user(email="organizer@example.com", password=PASSWORD)


def test_login_returns_user_and_starts_session(organizer: User) -> None:
    client = APIClient()

    response = client.post(
        "/api/auth/login/", {"email": "Organizer@Example.com", "password": PASSWORD}
    )

    assert response.status_code == 200
    assert response.json() == {"id": organizer.id, "email": "organizer@example.com"}
    assert client.get("/api/auth/me/").status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "organizer@example.com", "password": "wrong"},
        {"email": "nobody@example.com", "password": PASSWORD},
        {"email": "organizer@example.com"},
        {"email": "not-an-email", "password": PASSWORD},
        {},
    ],
)
def test_login_rejects_bad_credentials_with_400(organizer: User, payload: dict[str, str]) -> None:
    client = APIClient()

    response = client.post("/api/auth/login/", payload)

    assert response.status_code == 400
    assert client.get("/api/auth/me/").status_code == 401


def test_login_rejects_inactive_user(organizer: User) -> None:
    organizer.is_active = False
    organizer.save()

    response = APIClient().post(
        "/api/auth/login/", {"email": "organizer@example.com", "password": PASSWORD}
    )

    assert response.status_code == 400


def test_me_without_session_is_401_and_sets_csrf_cookie() -> None:
    response = APIClient().get("/api/auth/me/")

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Session"
    assert "csrftoken" in response.cookies


def test_me_returns_current_user(organizer: User) -> None:
    client = APIClient()
    client.force_login(organizer)

    response = client.get("/api/auth/me/")

    assert response.status_code == 200
    assert response.json() == {"id": organizer.id, "email": "organizer@example.com"}


def test_logout_ends_session(organizer: User) -> None:
    client = APIClient()
    client.force_login(organizer)

    response = client.post("/api/auth/logout/")

    assert response.status_code == 204
    assert client.get("/api/auth/me/").status_code == 401


def test_logout_without_session_is_401() -> None:
    assert APIClient().post("/api/auth/logout/").status_code == 401


def test_logout_requires_csrf_token(organizer: User) -> None:
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(organizer)

    assert client.post("/api/auth/logout/").status_code == 403
    assert client.get("/api/auth/me/").status_code == 200
