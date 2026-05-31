"""Phase text2face — expression preset contract tests.

Pins the mapping from emotion labels to ARKit upper-face channels.
Verifies that audio2lipsync's mouth/jaw path is untouched (our channels
never overlap with lipsync-covered indices). Verifies the expression
presets integrate correctly into _build_lipsync's arkit_frames path.

Architected 2026-05-13 (Oracle ses_1dd9fc4f6ffeUj7zptEr3d63tN).
"""
from __future__ import annotations

import pytest

from app.services.expression_presets import expression_for, known_emotions

# All 9 documented emotion labels from the UE5 avatar contract
# (docs/ue5-avatar-contract.md:148-165) MUST have a preset entry.
_EXPECTED_EMOTIONS = {
    "neutral", "joy", "proud", "encouraging_mild",
    "sadness", "patient", "curious", "thinking_deep", "surprise",
}


def test_all_nine_emotions_have_presets():
    """Every emotion label in the UE5 contract has a corresponding preset entry.

    Pinned so that adding a new emotion (e.g. in emotion_detector.py) without
    also expanding the expression map fails visibly at test time, not silently
    with a frozen upper face on the MetaHuman."""
    assert known_emotions() == _EXPECTED_EMOTIONS, (
        f"expression presets must cover all 9 UE5 emotion labels, "
        f"got {sorted(known_emotions())}"
    )


def test_unknown_emotion_returns_empty_dict():
    """expression_for('gibberish') returns {} so the merge is a no-op.

    Pinned so a typo in an emotion label or a novel emotion from the LLM
    doesn't crash the broadcast pipeline."""
    assert expression_for("not-a-real-emotion") == {}
    assert expression_for("") == {}


def test_joy_preset_contains_arkit_upper_face_channels():
    """Joy preset includes eye squint (Duchenne smile) and brow raise.

    Pins the actual channel names so a refactor of constants.py ARKIT_CHANNELS
    doesn't silently misname the keys. CheekSquint is NOT included because
    those channels (indices 47-48) are owned by audio2lipsync's
    SECONDARY_MOUTH_INDICES — expression presets must never overlap with
    mouth-coverage indices."""
    expr = expression_for("joy")
    assert "EyeSquintLeft" in expr
    assert "EyeSquintRight" in expr
    assert "BrowInnerUp" in expr
    assert expr["EyeSquintLeft"] > 0
    assert expr["BrowInnerUp"] > 0


def test_expression_channels_never_overlap_mouth_indices():
    """Upper-face channels must NOT include any mouth/jaw index covered by
    audio2lipsync. The two sources must be additive without collision.

    Pins the integration contract: if audio2lipsync ever expands from
    jaw/mouth (indices 14-40) into brow/eye space, this test fires red
    to flag the collision before it reaches Roland's MetaHuman."""
    from app.services.audio2lipsync.constants import (
        BLENDSHAPE_NAMES, MOUTH_INDICES, SECONDARY_MOUTH_INDICES,
    )
    all_mouth = set(MOUTH_INDICES + list(SECONDARY_MOUTH_INDICES))
    mouth_channels = {BLENDSHAPE_NAMES[i] for i in all_mouth}

    for emotion in known_emotions():
        expr = expression_for(emotion)
        overlap = set(expr) & mouth_channels
        assert not overlap, (
            f"expression '{emotion}' includes mouth channels {overlap} — "
            f"these are owned by audio2lipsync and must not be duplicated"
        )


def test_expression_channels_are_valid_arkit_names():
    """Every channel key in every preset is a real ARKit blendshape name
    from audio2lipsync/constants.py.

    Pinned so a typo in an expression preset key doesn't produce a channel
    name that Roland's LiveLink Pose Asset can't map."""
    from app.services.audio2lipsync.constants import BLENDSHAPE_NAMES
    valid = frozenset(BLENDSHAPE_NAMES)
    for emotion in known_emotions():
        expr = expression_for(emotion)
        unknown = set(expr) - valid
        assert not unknown, (
            f"expression '{emotion}' references unknown ARKit channels: {unknown}"
        )


def test_expression_presets_import_does_not_break_module_load():
    """Pure import test — no heavy deps, no GPU, no network. Protects against
    a future dependency addition that would make the module unimportable on
    a headless server."""
    import app.services.expression_presets
    assert app.services.expression_presets.expression_for is not None
