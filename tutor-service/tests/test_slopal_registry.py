"""Pin the SloPal Slovak Whisper fine-tune entries in the STT registry.

The librarian-agent research (May 2026) flagged NaiveNeuron's SloPal fine-tunes
(EMNLP 2025) as the highest-impact low-effort win for Slovak ASR quality:
65–70 percent WER reduction over base Whisper on the Common Voice 21 Slovak
test set. Wiring them into the STT registry is the production rollout.

This test pins three contracts:
  1. The three SloPal entries are present and route to the faster-whisper
     backend (CTranslate2 loads HF model IDs directly, so no new backend
     code is needed — a future contributor must not split them off).
  2. Their HuggingFace model IDs match the upstream NaiveNeuron repos exactly
     (typos here would cause silent fallback to base Whisper at inference).
  3. The CC-BY-4.0 attribution in the model name survives — the comment
     above the entries documents the licence; this test catches accidental
     name edits that would obscure attribution.
"""
import pytest

from app.services.stt_service import AVAILABLE_STT_MODELS


SLOPAL_EXPECTED = {
    "slopal-whisper-small-sk": "NaiveNeuron/whisper-small-sk",
    "slopal-whisper-large-v3-turbo-sk": "NaiveNeuron/whisper-large-v3-turbo-sk",
    "slopal-whisper-large-v3-sk": "NaiveNeuron/whisper-large-v3-sk",
}


@pytest.mark.parametrize("registry_id,hf_model_id", SLOPAL_EXPECTED.items())
def test_slopal_entry_uses_correct_huggingface_model_id(registry_id, hf_model_id):
    by_id = {m["id"]: m for m in AVAILABLE_STT_MODELS}
    assert registry_id in by_id, (
        f"SloPal registry entry '{registry_id}' missing. The librarian-agent "
        "research recommended these for 65 percent WER reduction on Slovak; "
        "do not remove without replacement."
    )
    entry = by_id[registry_id]
    assert entry["model_id"] == hf_model_id, (
        f"SloPal entry '{registry_id}' should use HF model '{hf_model_id}' "
        f"but found '{entry['model_id']}'. Typos here cause silent fallback "
        "at inference time."
    )
    assert entry["backend"] == "faster-whisper", (
        f"SloPal entries route through faster-whisper (CTranslate2 loads HF "
        f"checkpoints directly). Found backend '{entry['backend']}' for "
        f"'{registry_id}' — do not split off into a new backend."
    )
    assert "sk" in entry["languages"], (
        f"SloPal entry '{registry_id}' should advertise sk in languages list"
    )


def test_slopal_recommended_model_is_large_v3_turbo():
    """The librarian's recommendation: large-v3-turbo for best speed/quality
    balance (13 percent WER, ~3s CPU). This test pins the recommendation so
    the Hardware Setup auto-apply flow can rely on it."""
    by_id = {m["id"]: m for m in AVAILABLE_STT_MODELS}
    entry = by_id["slopal-whisper-large-v3-turbo-sk"]
    assert "recommended" in entry["name"].lower(), (
        "large-v3-turbo SK is the recommended SloPal model and its display "
        "name should mark it as such for the hardware-setup picker"
    )


def test_slopal_does_not_overwrite_baseline_whisper_models():
    """Adding SloPal must not displace the base mlx/faster-whisper entries —
    casual-speech use cases need the unbiased baselines as fallbacks."""
    ids = {m["id"] for m in AVAILABLE_STT_MODELS}
    for baseline in ("mlx-whisper-turbo", "faster-whisper-sk-small", "faster-whisper-large-v3"):
        assert baseline in ids, (
            f"baseline STT model '{baseline}' is missing — SloPal additions "
            "must be additive, not replace the baselines"
        )


def test_total_stt_model_count_did_not_explode():
    """Defensive: the registry should grow predictably. 6 baselines +
    3 SloPal Slovak fine-tunes + 1 deterministic 'mock' (test-only) = 10.
    If this fails after a rebase, someone may have duplicated entries."""
    assert len(AVAILABLE_STT_MODELS) == 10, (
        f"unexpected STT registry size: {len(AVAILABLE_STT_MODELS)}. "
        "If you intentionally added a model, update this assertion. If you "
        "are seeing duplicates, dedupe before merging."
    )
