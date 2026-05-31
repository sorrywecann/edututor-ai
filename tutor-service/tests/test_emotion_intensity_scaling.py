"""Pin dynamic emotion intensity scaling: stronger emotional signals (more
exclamation marks, more capital letters) produce higher intensity values
than mild ones, even for the same emotion label.

Before this fix, intensity was hardcoded per emotion label — "výborne" and
"VÝBORNE!!!" both produced intensity=0.9, making the avatar feel robotic.
The audit (oracle session ses_1fa9d93c1ffe7OBt02tRy5D3N4) flagged fixed
intensities as the second-most-visible quality gap.

Scaling formula: base_intensity × (1.0 + bonus), where bonus comes from
- exclamation count (capped at +0.15)
- caps ratio (capped at +0.10)
Final result clipped to [0.0, 1.0].
"""
from app.services.emotion_detector import _rule_based


def test_celebrating_mild_vs_emphatic_differs_in_intensity():
    """A single 'výborne' should produce lower intensity than 'VÝBORNE!!!' —
    same celebrating label, different signal strength."""
    mild = _rule_based("výborne")
    emphatic = _rule_based("VÝBORNE!!!")
    assert mild.emotion == "celebrating"
    assert emphatic.emotion == "celebrating"
    assert emphatic.intensity > mild.intensity, (
        f"emphatic ({emphatic.intensity}) should exceed mild ({mild.intensity})"
    )


def test_intensity_clipped_at_one_for_extreme_input():
    """Extreme inputs (lots of !!! and CAPS) must NOT produce intensity > 1.0.
    UE5 blendshape weights are clamped to [0, 1] — values >1 would either
    overflow or clip silently, both bad."""
    extreme = _rule_based("VÝBORNE!!!!!!!!!!!!!!!!!!!!!!")
    assert extreme.intensity <= 1.0
    assert extreme.intensity > 0.0


def test_neutral_has_no_scaling_bonus():
    """Neutral emotion should keep its baseline intensity (0.4) — no signal
    strength applies because there's no emotional keyword to amplify."""
    result = _rule_based("dnes je streda")
    assert result.emotion == "neutral"
    assert result.intensity == 0.4


def test_correcting_emphatic_louder_than_mild():
    """Correcting "nie" should be milder than "NIE!!!" — same emotion class,
    stronger signal. This matters for the avatar: a stern correction should
    look more concerned than a gentle 'no'."""
    mild = _rule_based("nie, to nie je správne")
    emphatic = _rule_based("NIE!!! to nie je správne")
    assert mild.emotion == "correcting"
    assert emphatic.emotion == "correcting"
    assert emphatic.intensity > mild.intensity


def test_intensity_scaling_floor_preserved():
    """Without exclamation/caps, base intensity is unchanged. Pin so a future
    edit doesn't accidentally apply scaling to plain text."""
    mild = _rule_based("výborne")
    assert mild.emotion == "celebrating"
    assert mild.intensity == 0.9, (
        f"plain 'výborne' should have base 0.9, got {mild.intensity}"
    )
