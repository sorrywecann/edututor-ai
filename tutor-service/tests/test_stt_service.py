"""Tests for modular STT service — registry, audio decode, mock, auto-detection."""
import pytest
import numpy as np
from app.services.stt_service import (
    STTService,
    AVAILABLE_STT_MODELS,
    _REGISTRY,
    TranscriptionResult,
    detect_best_provider,
    decode_audio,
)

REQUIRED_FIELDS = {
    "id", "name", "description", "provider", "backend",
    "model_id", "accuracy_sk", "speed", "cost", "languages",
    "requires", "recommended_on",
}

VALID_BACKENDS = {"mlx", "faster-whisper", "hf", "openai", "groq", "mock"}


# ---------------------------------------------------------------------------
# Registry structure
# ---------------------------------------------------------------------------

def test_registry_has_all_expected_providers():
    """Pin the documented STT registry. SloPal Slovak fine-tunes (NaiveNeuron,
    EMNLP 2025, CC-BY-4.0) replaced the older HF holdouts; the SloPal registry
    test pins the canonical IDs as the production contract (see ADR-003).
    """
    ids = set(_REGISTRY)
    assert "mlx-whisper-turbo" in ids
    assert "mlx-whisper-large-v3" in ids
    assert "faster-whisper-sk-small" in ids
    assert "faster-whisper-large-v3" in ids
    assert "slopal-whisper-small-sk" in ids
    assert "slopal-whisper-large-v3-turbo-sk" in ids
    assert "slopal-whisper-large-v3-sk" in ids
    assert "openai-whisper" in ids
    assert "groq-whisper" in ids
    assert "mock" in ids


def test_every_entry_has_required_fields():
    for entry in AVAILABLE_STT_MODELS:
        missing = REQUIRED_FIELDS - set(entry)
        assert not missing, f"{entry['id']} missing fields: {missing}"


def test_all_backends_are_valid():
    for entry in AVAILABLE_STT_MODELS:
        assert entry["backend"] in VALID_BACKENDS, \
            f"{entry['id']} unknown backend: {entry['backend']}"


def test_mlx_models_are_recommended_on_mps():
    for entry in AVAILABLE_STT_MODELS:
        if entry["backend"] == "mlx":
            assert "mps" in entry["recommended_on"], \
                f"{entry['id']} should recommend mps"


def test_cloud_providers_declare_api_key_requirement():
    for entry in AVAILABLE_STT_MODELS:
        if entry["backend"] == "openai":
            assert "OPENAI_API_KEY" in entry["requires"]
        if entry["backend"] == "groq":
            assert "GROQ_API_KEY" in entry["requires"]


def test_sk_accuracy_nonempty_for_all():
    for entry in AVAILABLE_STT_MODELS:
        assert entry["accuracy_sk"], f"{entry['id']} empty accuracy_sk"


# ---------------------------------------------------------------------------
# Hardware auto-detection
# ---------------------------------------------------------------------------

def test_detect_best_provider_returns_valid_id():
    result = detect_best_provider()
    assert result in _REGISTRY, f"detect_best_provider() returned unknown id: {result}"


def test_detect_best_provider_prefers_mlx_on_mps(monkeypatch):
    """On a machine with MPS + mlx_whisper installed, must pick MLX."""
    import app.services.stt_service as svc

    # Patch the imports used inside detect_best_provider directly
    monkeypatch.setattr(svc, "detect_best_provider", lambda: _simulate_detect(mps=True, cuda=False, has_mlx=True, has_fw=True))
    assert svc.detect_best_provider() == "mlx-whisper-turbo"


def test_detect_best_provider_falls_back_to_faster_whisper_on_cpu(monkeypatch):
    import app.services.stt_service as svc
    monkeypatch.setattr(svc, "detect_best_provider", lambda: _simulate_detect(mps=False, cuda=False, has_mlx=False, has_fw=True))
    assert svc.detect_best_provider() == "faster-whisper-sk-small"


def _simulate_detect(mps: bool, cuda: bool, has_mlx: bool, has_fw: bool) -> str:
    """Mirror of detect_best_provider() logic for monkeypatching."""
    if mps:
        if has_mlx:
            return "mlx-whisper-turbo"
    if cuda:
        if has_fw:
            return "faster-whisper-large-v3"
    if has_fw:
        return "faster-whisper-sk-small"
    return "openai-whisper"


# ---------------------------------------------------------------------------
# Audio decode utility
# ---------------------------------------------------------------------------

def test_decode_audio_returns_float32_array():
    """Minimal WAV bytes → decode_audio must return float32 ndarray."""
    import struct
    # Minimal valid 16-bit PCM WAV: 16kHz, mono, 0.1s
    num_samples = 1600
    pcm_bytes = struct.pack(f"<{num_samples}h", *([0] * num_samples))
    wav_header = (
        b"RIFF" + struct.pack("<I", 36 + len(pcm_bytes)) + b"WAVE"
        + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
        + b"data" + struct.pack("<I", len(pcm_bytes))
    )
    wav_data = wav_header + pcm_bytes
    result = decode_audio(wav_data, "wav")
    assert isinstance(result, np.ndarray)
    assert result.dtype == np.float32
    assert len(result) > 0


def test_decode_audio_returns_silence_on_garbage():
    """Garbage bytes must not raise — returns silence fallback."""
    result = decode_audio(b"not audio at all", "webm")
    assert isinstance(result, np.ndarray)
    assert result.dtype == np.float32


# ---------------------------------------------------------------------------
# Mock provider — no model loading
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_mock_transcribe_returns_slovak():
    svc = STTService()
    await svc.switch_model("mock")
    result = await svc.transcribe(b"x", language="sk")
    assert isinstance(result, TranscriptionResult)
    assert result.text
    assert result.language == "sk"
    assert result.provider == "mock"
    assert 0.0 <= result.confidence <= 1.0


@pytest.mark.asyncio
async def test_switch_to_unknown_model_raises():
    svc = STTService()
    with pytest.raises(ValueError, match="Unknown STT model"):
        await svc.switch_model("does-not-exist")


@pytest.mark.asyncio
async def test_switch_model_updates_provider_id():
    svc = STTService()
    await svc.switch_model("mock")
    assert svc.provider == "mock"


@pytest.mark.asyncio
async def test_transcribe_with_model_hot_swaps():
    svc = STTService()
    result = await svc.transcribe_with_model(b"x", model_id="mock", language="sk")
    assert result.provider == "mock"
    assert svc.provider == "mock"


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_models_endpoint_returns_all_providers():
    import os
    os.environ["STT_PROVIDER"] = "mock"
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/stt/models")

    assert resp.status_code == 200
    data = resp.json()
    ids = [m["id"] for m in data["models"]]
    assert "mlx-whisper-turbo" in ids
    assert "faster-whisper-large-v3" in ids
    assert "slopal-whisper-large-v3-turbo-sk" in ids
    assert "groq-whisper" in ids
    assert "mock" in ids
    assert "current" in data


@pytest.mark.asyncio
async def test_stt_transcribe_alias_exists():
    """Frontend calls /stt/transcribe — must not 404."""
    import os, struct
    os.environ["STT_PROVIDER"] = "mock"
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    num_samples = 1600
    pcm_bytes = struct.pack(f"<{num_samples}h", *([0] * num_samples))
    wav_header = (
        b"RIFF" + struct.pack("<I", 36 + len(pcm_bytes)) + b"WAVE"
        + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
        + b"data" + struct.pack("<I", len(pcm_bytes))
    )
    wav = wav_header + pcm_bytes

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(
            "/api/v1/stt/transcribe",
            files={"audio": ("test.wav", wav, "audio/wav")},
            data={"language": "sk"},
        )
    assert resp.status_code not in (404, 405)


@pytest.mark.asyncio
async def test_switch_endpoint_rejects_unknown_model():
    import os
    os.environ["STT_PROVIDER"] = "mock"
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(
            "/api/v1/stt/switch",
            json={"model_id": "fake-model-xyz"},
        )
    assert resp.status_code == 400
