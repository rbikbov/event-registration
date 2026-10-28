from unittest.mock import patch

import pytest
from django.db import DatabaseError
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_health_reports_ok_when_database_is_reachable() -> None:
    response = APIClient().get("/api/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_503_when_database_is_unreachable() -> None:
    with patch("config.health.connection.cursor", side_effect=DatabaseError):
        response = APIClient().get("/api/health/")

    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "error"}
