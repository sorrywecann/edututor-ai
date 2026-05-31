"""Regression tests for the runtime emotion-backend switching API.

The frontend `Detekcia emócií` toggle in HardwareSetup.tsx relies on this
contract:
  - GET  /api/v1/emotion/status returns {active, backends:{regex,bert:{available,reason}}}
  - POST /api/v1/emotion/switch with {backend} returns {success, backend} on accept,
    or {success:false, error} on reject (unknown backend, BERT model missing).

These tests pin the contract so future changes cannot silently break the
HardwareSetup toggle.
"""
import os
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_emotion_status_returns_active_and_backends_dict():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/emotion/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] in ("regex", "bert")
    assert "regex" in data["backends"]
    assert data["backends"]["regex"]["available"] is True
    assert "bert" in data["backends"]
    assert "available" in data["backends"]["bert"]
    assert "reason" in data["backends"]["bert"]


@pytest.mark.asyncio
async def test_emotion_switch_to_regex_always_succeeds():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/emotion/switch", json={"backend": "regex"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["backend"] == "regex"
    assert os.environ.get("EMOTION_BACKEND") == "regex"


@pytest.mark.asyncio
async def test_emotion_switch_rejects_unknown_backend():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/emotion/switch", json={"backend": "transformer-xyz"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert "unknown" in data["error"].lower()


@pytest.mark.asyncio
async def test_emotion_switch_rejects_bert_when_model_missing():
    """BERT model is not in the test environment — switch must reject cleanly
    with a useful error message rather than 500-ing or silently 'succeeding'."""
    from app.main import app
    model_dir = os.path.join(
        os.path.dirname(__file__), "..", "app", "..", "models", "sentiment", "output", "edututor-sentiment-sk"
    )
    if os.path.isdir(model_dir):
        pytest.skip("BERT model is present locally; this regression only fires when missing")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/emotion/switch", json={"backend": "bert"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert "model" in data["error"].lower() or "not found" in data["error"].lower()
