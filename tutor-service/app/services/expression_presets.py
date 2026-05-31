"""Upper-face expression presets for the MetaHuman avatar (text2face-lite).

Audio2lipsync drives mouth + jaw (ARKit indices 14-41). This module adds
brows, eyes, cheeks, and nose — the 21 upper-face channels reserved for
Text2Face but currently left at zero by audio2lipsync.

Five expressive presets stacked on 9 emotion labels. Float dicts in
PascalCase ARKit naming, compatible with the LiveLink Pose Asset
(mh_arkit_mapping_pose) used by the MetaHuman Blueprint.

Lightweight preset approach chosen over a full text2face model port —
values are artistic guesses, iterate against the rig. The contract is the
channel name + mapping, not the specific float.
"""
from __future__ import annotations

from typing import Dict

# ── Preset definitions ─────────────────────────────────────────────────────
# Each preset is a dict of {PascalCaseARkitName: float(0.0 - 1.0)}. Channels
# NOT listed are left at their current value (typically zero from lipsync or
# a previously-held frame). The consumer merges these ADDITIVELY onto the
# existing arkit dict — audio2lipsync's JawOpen does not get overridden.

_EXPRESSION_MAP: Dict[str, Dict[str, float]] = {
    "neutral": {
        # Calm, attentive baseline. Subtle blink happens naturally via
        # the Blueprint's auto-blink timer (3-6s tick). No forced pose.
    },

    "joy": {
        # Full warm celebration: Duchenne smile eyes = squint.
        "EyeSquintLeft": 0.35,
        "EyeSquintRight": 0.35,
        "BrowInnerUp": 0.15,
    },

    "proud": {
        # Warm genuine closed smile, soft eyes. After mastering a concept.
        "EyeSquintLeft": 0.30,
        "EyeSquintRight": 0.30,
        "BrowDownLeft": 0.10,
        "BrowDownRight": 0.10,
    },

    "encouraging_mild": {
        # Soft open smile, warm eyes. Gentle positive reinforcement.
        "EyeSquintLeft": 0.15,
        "EyeSquintRight": 0.15,
        "BrowInnerUp": 0.10,
    },

    "sadness": {
        # Concerned, empathetic. Inner brows raised + lowered, soft lip press.
        # Correcting a student — must look supportive, not angry.
        "BrowInnerUp": 0.45,
        "BrowDownLeft": 0.15,
        "BrowDownRight": 0.15,
        "EyeSquintLeft": 0.10,
        "EyeSquintRight": 0.10,
    },

    "patient": {
        # Repeated error correction — calm, steady, not frustrated.
        "BrowInnerUp": 0.15,
        "EyeSquintLeft": 0.08,
        "EyeSquintRight": 0.08,
    },

    "curious": {
        # Unexpected answer — slight head tip (brow asymmetry suggests tilt).
        "BrowInnerUp": 0.30,
        "BrowOuterUpLeft": 0.20,
        "BrowOuterUpRight": 0.10,
        "EyeLookUpLeft": 0.15,
        "EyeLookUpRight": 0.15,
        "EyeWideLeft": 0.10,
        "EyeWideRight": 0.10,
    },

    "thinking_deep": {
        # Complex question — look up-left, slight brow furrow. Classic
        # human body language for recall/processing.
        "BrowInnerUp": 0.35,
        "BrowDownLeft": 0.15,
        "BrowDownRight": 0.10,
        "EyeLookUpLeft": 0.25,
        "EyeLookUpRight": 0.15,
        "EyeSquintLeft": 0.10,
        "EyeSquintRight": 0.05,
    },

    "surprise": {
        # Unexpected answer — brows shoot up, eyes widen.
        "BrowOuterUpLeft": 0.65,
        "BrowOuterUpRight": 0.65,
        "BrowInnerUp": 0.50,
        "EyeWideLeft": 0.45,
        "EyeWideRight": 0.45,
    },
}


def expression_for(emotion: str) -> Dict[str, float]:
    """Return upper-face ARKit channels for an emotion label.

    Returns an empty dict for unknown emotions (no forced pose).
    The caller merges the result onto its own arkit dict — channels
    present in the return value layer on top of whatever the lipsync
    engine already set.

    Stateless, pure function — safe to call on every frame.
    """
    return _EXPRESSION_MAP.get(emotion, {})


def known_emotions() -> frozenset[str]:
    """All emotion labels that have presets. Used by init/smoke tests."""
    return frozenset(_EXPRESSION_MAP)
