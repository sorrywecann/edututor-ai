"""Regression tests for TTS voice-ID → provider routing.

The 2026-04-28 E2E review reported that POST /api/v1/tts with voice
'sk-SK-LukasNeural' (an Edge TTS voice) errored with
'Piper model not found: sk-SK-LukasNeural' — the endpoint was sending
Edge voice IDs to the Piper backend.

The bug has been fixed by `_infer_provider()` in app/api/tts.py. These
tests pin that mapping in place so a future change to the voice tables
cannot silently re-route voices to the wrong backend.
"""
import pytest

from app.api.tts import _infer_provider


@pytest.mark.parametrize(
    "voice,expected_provider",
    [
        ("sk-SK-LukasNeural", "edge"),
        ("sk-SK-ViktoriaNeural", "edge"),
        ("nova", "openai"),
        ("sk-SK-Chirp3-HD-Achernar", "google"),
        ("sk-SK-Chirp3-HD-Kore", "google"),
        ("sk_SK-lili-medium", "piper"),
        ("af_heart", "kokoro"),
        ("am_michael", "kokoro"),
        ("omnivoice_sk", "omnivoice"),
        ("omnivoice-cs-custom-voice", "omnivoice"),
    ],
)
def test_voice_id_routes_to_correct_provider(voice, expected_provider):
    assert _infer_provider(voice, None) == expected_provider, (
        f"voice '{voice}' must route to '{expected_provider}'. "
        "The 2026-04-28 E2E review caught Edge voices being sent to Piper. "
        "If this fails, check that the voice has not been moved to a "
        "different *_VOICES table without _infer_provider being updated."
    )


def test_explicit_provider_overrides_voice_inference():
    """Caller-supplied provider must always win over voice-based inference."""
    assert _infer_provider("sk-SK-LukasNeural", "azure") == "azure"
    assert _infer_provider("af_heart", "edge") == "edge"


def test_unknown_voice_falls_back_to_edge():
    """Unknown voice IDs default to Edge (the always-available free backend),
    not to a backend that may not have model files locally."""
    assert _infer_provider("totally-unknown-voice-xyz", None) == "edge"


def test_omnivoice_dynamic_voice_pattern_matches():
    """Voice IDs of the form 'omnivoice-<lang>-<slug>' (created at runtime
    from reference audio files in models/omnivoice/references/) must route to
    omnivoice even though they are not in OMNIVOICE_VOICES."""
    assert _infer_provider("omnivoice-sk-marek", None) == "omnivoice"
    assert _infer_provider("omnivoice-en-jane_doe", None) == "omnivoice"


def test_no_voice_routing_collisions_in_static_tables():
    """No voice ID may appear in two provider-specific static tables.

    Sanity check: if the same voice is in (e.g.) AZURE_VOICES and
    EDGE_VOICES, _infer_provider's order resolves the ambiguity but the
    backend choice becomes implicit. Flag any collision so the maintainer
    is aware and adjusts intentionally.

    Note: As of writing, sk-SK-LukasNeural and sk-SK-ViktoriaNeural appear
    in BOTH EDGE_VOICES and AZURE_VOICES — this is intentional (free Edge
    is preferred unless caller passes provider='azure' explicitly), so the
    expected set of overlaps is hard-coded below.
    """
    from app.api.tts import (
        EDGE_VOICE_IDS, OPENAI_VOICE_IDS, GOOGLE_VOICE_IDS,
        AZURE_VOICE_IDS, PIPER_VOICE_IDS, KOKORO_VOICE_IDS,
        OMNIVOICE_VOICE_IDS,
    )

    expected_overlaps = {("sk-SK-LukasNeural", "edge", "azure"),
                         ("sk-SK-ViktoriaNeural", "edge", "azure")}

    tables = {
        "edge": EDGE_VOICE_IDS, "openai": OPENAI_VOICE_IDS,
        "google": GOOGLE_VOICE_IDS, "azure": AZURE_VOICE_IDS,
        "piper": PIPER_VOICE_IDS, "kokoro": KOKORO_VOICE_IDS,
        "omnivoice": OMNIVOICE_VOICE_IDS,
    }
    names = list(tables.keys())
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            shared = tables[a] & tables[b]
            for voice in shared:
                assert (voice, a, b) in expected_overlaps or (voice, b, a) in expected_overlaps, (
                    f"unexpected voice-ID collision: '{voice}' is in both "
                    f"{a.upper()}_VOICES and {b.upper()}_VOICES. _infer_provider "
                    f"will resolve this implicitly — add to expected_overlaps "
                    f"or remove from one of the tables."
                )
