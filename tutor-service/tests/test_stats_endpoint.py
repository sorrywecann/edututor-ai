"""Tests for GET /stats endpoint."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    return TestClient(app)


def test_stats_returns_200(client):
    resp = client.get("/api/v1/stats")
    assert resp.status_code == 200


def test_stats_shape(client):
    resp = client.get("/api/v1/stats")
    data = resp.json()
    assert "session_count" in data
    assert "total_turns" in data
    assert "streak_days" in data
    assert "last_session_at" in data


def test_stats_session_count_is_int(client):
    resp = client.get("/api/v1/stats")
    data = resp.json()
    assert isinstance(data["session_count"], int)
    assert data["session_count"] >= 0


def test_stats_streak_is_int(client):
    resp = client.get("/api/v1/stats")
    data = resp.json()
    assert isinstance(data["streak_days"], int)
    assert data["streak_days"] >= 0


def test_stats_with_user_id_filter(client):
    # Use a unique ID that no other test will create sessions for
    resp = client.get("/api/v1/stats?user_id=stats-test-no-sessions-xyz")
    assert resp.status_code == 200
    data = resp.json()
    # Brand-new user has no sessions
    assert data["session_count"] == 0
    assert data["streak_days"] == 0
    assert data["last_session_at"] is None
