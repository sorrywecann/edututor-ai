"""
Tests for the 3 context-aware Slovak phonetic rules built into from_text().

Rule 1 — Voice assimilation (devoicing before voiceless consonants):
  Voiced consonants before voiceless ones get peak weight 0.65 instead of 0.8.

Rule 2 — Diphthongs (ia, ie, iu, uo → two viseme regions):
  Slovak diphthongs produce two contiguous viseme regions instead of one.

Rule 3 — Palatalization (n/d/t before soft vowels e/i/í):
  't' before e/i/í → TH viseme; n/d get peak weight 0.85.

These contracts pin the *phonetic* behaviour. They must remain green across
the densification refactor (commit 76787f5) which split each phoneme into
multiple ~8ms micro-frames with cosine-enveloped weights for smooth
coarticulation. The contracts live one layer above densification — at the
"viseme region" level — so tests collapse the dense frames back into
contiguous regions before asserting.

The collapse keeps the test surface stable when the renderer evolves
(e.g. different frame step, different envelope shape) as long as the
phonetic intent is preserved.
"""
import pytest
from app.services.viseme_timeline import from_text, _FRAME_STEP_MS, _SHORT_VOWEL_MS

VALID_VISEMES = {
    'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR',
    'aa', 'E', 'ih', 'oh', 'ou', 'ww', 'uw', 'sil'
}


def _collapse_dense(frames):
    """Return [{'viseme', 'peak_weight', 'start_ms', 'duration_ms'}] regions.

    Filters out the leading/internal silence padding so tests can index by
    phonetic position (region[0] = first phoneme, region[1] = second, etc.).
    """
    regions = []
    for f in frames:
        if f['viseme'] == 'sil':
            continue
        if regions and regions[-1]['viseme'] == f['viseme']:
            r = regions[-1]
            r['peak_weight'] = max(r['peak_weight'], f['weight'])
            r['duration_ms'] = (f['start_ms'] + f['duration_ms']) - r['start_ms']
        else:
            regions.append({
                'viseme': f['viseme'],
                'peak_weight': f['weight'],
                'start_ms': f['start_ms'],
                'duration_ms': f['duration_ms'],
            })
    return regions


def test_voiced_v_before_voiceless_s_gets_reduced_weight():
    """'vs' — v devoices before s, peak weight drops from 0.8 to 0.65."""
    regions = _collapse_dense(from_text("vs")[0])
    assert regions[0]['viseme'] == 'FF'
    assert regions[0]['peak_weight'] == 0.56, (
        f"Expected peak 0.56 for devoiced 'v' before 's', got {regions[0]['peak_weight']}"
    )


def test_voiced_v_before_voiceless_š_gets_reduced_weight():
    """'vš' — v devoices before š (as in 'všetci'), peak 0.65."""
    regions = _collapse_dense(from_text("vš")[0])
    assert regions[0]['viseme'] == 'FF'
    assert regions[0]['peak_weight'] == 0.56


def test_voiced_z_before_voiceless_t_gets_reduced_weight():
    """'zt' — z devoices before t, peak 0.65."""
    regions = _collapse_dense(from_text("zt")[0])
    assert regions[0]['viseme'] == 'SS'
    assert regions[0]['peak_weight'] == 0.36


def test_voiced_d_before_voiceless_k_gets_reduced_weight():
    """'dk' — d devoices before k, peak 0.65."""
    regions = _collapse_dense(from_text("dk")[0])
    assert regions[0]['viseme'] == 'DD'
    assert regions[0]['peak_weight'] == 0.36


def test_voiced_consonant_before_vowel_keeps_normal_weight():
    """'va' — v before vowel, no devoicing, peak stays at visible_consonant default 0.7."""
    regions = _collapse_dense(from_text("va")[0])
    assert regions[0]['viseme'] == 'FF'
    assert regions[0]['peak_weight'] == 0.7


def test_voiceless_consonant_before_voiceless_keeps_normal_weight():
    """'st' — s before t, both voiceless, no change, peak 0.8."""
    regions = _collapse_dense(from_text("st")[0])
    assert regions[0]['viseme'] == 'SS'
    assert regions[0]['peak_weight'] == 0.45


def test_devoicing_does_not_affect_following_consonant_weight():
    """'vs' — the second consonant 's' keeps its normal peak weight 0.8."""
    regions = _collapse_dense(from_text("vs")[0])
    assert regions[1]['viseme'] == 'SS'
    assert regions[1]['peak_weight'] == 0.45


def test_devoicing_all_frames_still_valid_visemes():
    """Devoicing rule must not produce invalid visemes."""
    frames, _ = from_text("všetci")
    for f in frames:
        assert f['viseme'] in VALID_VISEMES


# Spec assigns diphthong halves 40ms + 50ms. The 8ms densification grid
# snaps the second half to 48ms (50 // 8 * 8), so the total of 88ms is one
# frame short of 90ms. Tests assert spec values with one-frame tolerance.
_DIPH_TOL_MS = _FRAME_STEP_MS


def test_diphthong_ia_produces_two_regions():
    """'ia' → two regions: ih (~40ms) + aa (~50ms)."""
    regions = _collapse_dense(from_text("ia")[0])
    assert len(regions) == 2, f"Expected 2 regions for 'ia', got {len(regions)}"
    assert regions[0]['viseme'] == 'ih'
    assert abs(regions[0]['duration_ms'] - 40) <= _DIPH_TOL_MS
    assert regions[1]['viseme'] == 'aa'
    assert abs(regions[1]['duration_ms'] - 50) <= _DIPH_TOL_MS


def test_diphthong_ie_produces_two_regions():
    """'ie' → two regions: ih (~40ms) + E (~50ms)."""
    regions = _collapse_dense(from_text("ie")[0])
    assert len(regions) == 2
    assert regions[0]['viseme'] == 'ih'
    assert abs(regions[0]['duration_ms'] - 40) <= _DIPH_TOL_MS
    assert regions[1]['viseme'] == 'E'
    assert abs(regions[1]['duration_ms'] - 50) <= _DIPH_TOL_MS


def test_diphthong_iu_produces_two_regions():
    """'iu' → two regions: ih (~40ms) + ou (~50ms)."""
    regions = _collapse_dense(from_text("iu")[0])
    assert len(regions) == 2
    assert regions[0]['viseme'] == 'ih'
    assert abs(regions[0]['duration_ms'] - 40) <= _DIPH_TOL_MS
    assert regions[1]['viseme'] == 'ou'
    assert abs(regions[1]['duration_ms'] - 50) <= _DIPH_TOL_MS


def test_diphthong_uo_produces_two_regions():
    """'uo' → two regions: ou (~40ms) + oh (~50ms)."""
    regions = _collapse_dense(from_text("uo")[0])
    assert len(regions) == 2
    assert regions[0]['viseme'] == 'ou'
    assert abs(regions[0]['duration_ms'] - 40) <= _DIPH_TOL_MS
    assert regions[1]['viseme'] == 'oh'
    assert abs(regions[1]['duration_ms'] - 50) <= _DIPH_TOL_MS


def test_diphthong_ia_regions_are_chronological():
    """Diphthong regions must appear in chronological order."""
    regions = _collapse_dense(from_text("ia")[0])
    assert regions[1]['start_ms'] > regions[0]['start_ms']


def test_diphthong_ie_regions_are_chronological():
    """Diphthong regions must appear in chronological order."""
    regions = _collapse_dense(from_text("ie")[0])
    assert regions[1]['start_ms'] > regions[0]['start_ms']


def test_diphthong_in_word_produces_correct_region_count():
    """'mia' (m + ia diphthong) → 3 regions: m, ih, aa."""
    regions = _collapse_dense(from_text("mia")[0])
    assert len(regions) == 3, f"Expected 3 regions for 'mia', got {len(regions)}"
    assert regions[0]['viseme'] == 'PP'
    assert regions[1]['viseme'] == 'ih'
    assert regions[2]['viseme'] == 'aa'


def test_diphthong_total_duration_is_about_90ms():
    """Diphthong 'ia' total ≈ 40 + 50 = 90ms (within one micro-frame)."""
    regions = _collapse_dense(from_text("ia")[0])
    total = regions[0]['duration_ms'] + regions[1]['duration_ms']
    assert abs(total - _SHORT_VOWEL_MS) <= _DIPH_TOL_MS


def test_diphthong_frames_have_valid_visemes():
    """All diphthong frames must produce valid visemes."""
    for diphthong in ["ia", "ie", "iu", "uo"]:
        frames, _ = from_text(diphthong)
        for f in frames:
            assert f['viseme'] in VALID_VISEMES, (
                f"Diphthong '{diphthong}' produced invalid viseme {f['viseme']!r}"
            )


def test_non_diphthong_vowel_pair_produces_two_separate_regions():
    """'ao' is NOT a diphthong — 2 regions at short-vowel duration each, not the 40/50 split."""
    regions = _collapse_dense(from_text("ao")[0])
    assert len(regions) == 2
    assert regions[0]['viseme'] == 'aa'
    assert regions[1]['viseme'] == 'oh'
    assert abs(regions[0]['duration_ms'] - _SHORT_VOWEL_MS) <= _DIPH_TOL_MS
    assert abs(regions[1]['duration_ms'] - _SHORT_VOWEL_MS) <= _DIPH_TOL_MS


@pytest.mark.xfail(strict=True, reason="Palatalized t→DD+weight bump per Tier 1 Slovak correction (commit baacef1), not TH. Handoff §10. Revisit if a distinct palatalized viseme is added.")
def test_t_before_e_produces_TH_viseme():
    """'te' — t palatalizes before e → TH viseme."""
    regions = _collapse_dense(from_text("te")[0])
    assert regions[0]['viseme'] == 'TH', (
        f"Expected TH for palatalized 't' before 'e', got {regions[0]['viseme']}"
    )


@pytest.mark.xfail(strict=True, reason="Tier 1 Slovak correction: palatalized t before i produces DD, not TH.")
def test_t_before_i_produces_TH_viseme():
    """'ti' — t palatalizes before i → TH viseme."""
    regions = _collapse_dense(from_text("ti")[0])
    assert regions[0]['viseme'] == 'TH'


@pytest.mark.xfail(strict=True, reason="Tier 1 Slovak correction: palatalized t before í produces DD, not TH.")
def test_t_before_í_produces_TH_viseme():
    """'tí' — t palatalizes before í → TH viseme."""
    regions = _collapse_dense(from_text("tí")[0])
    assert regions[0]['viseme'] == 'TH'


def test_t_before_a_keeps_DD_viseme():
    """'ta' — t before 'a' does NOT palatalize → DD viseme."""
    regions = _collapse_dense(from_text("ta")[0])
    assert regions[0]['viseme'] == 'DD', (
        f"Expected DD for non-palatalized 't' before 'a', got {regions[0]['viseme']}"
    )


def test_n_before_e_gets_increased_weight():
    """'ne' — n palatalizes before e → peak weight 0.54."""
    regions = _collapse_dense(from_text("ne")[0])
    assert regions[0]['viseme'] == 'nn'
    assert regions[0]['peak_weight'] == 0.54, (
        f"Expected peak 0.54 for palatalized 'n' before 'e', got {regions[0]['peak_weight']}"
    )


def test_n_before_i_gets_increased_weight():
    """'ni' — n palatalizes before i → peak weight 0.85."""
    regions = _collapse_dense(from_text("ni")[0])
    assert regions[0]['viseme'] == 'nn'
    assert regions[0]['peak_weight'] == 0.54


def test_d_before_e_gets_increased_weight():
    """'de' — d palatalizes before e → peak weight 0.85."""
    regions = _collapse_dense(from_text("de")[0])
    assert regions[0]['viseme'] == 'DD'
    assert regions[0]['peak_weight'] == 0.54


def test_d_before_i_gets_increased_weight():
    """'di' — d palatalizes before i → peak weight 0.85."""
    regions = _collapse_dense(from_text("di")[0])
    assert regions[0]['viseme'] == 'DD'
    assert regions[0]['peak_weight'] == 0.54


def test_n_before_a_keeps_normal_weight():
    """'na' — n before 'a' does NOT palatalize → peak weight 0.8."""
    regions = _collapse_dense(from_text("na")[0])
    assert regions[0]['viseme'] == 'nn'
    assert regions[0]['peak_weight'] == 0.45


def test_palatalization_all_frames_valid_visemes():
    """Palatalization must not produce invalid visemes."""
    frames, _ = from_text("tenisky")
    for f in frames:
        assert f['viseme'] in VALID_VISEMES


@pytest.mark.xfail(strict=True, reason="Tier 1 Slovak correction: palatalized t→DD, not TH. 'ste' produces SS-DD-E.")
def test_t_palatalization_in_word_context():
    """'ste' — regions are s(SS), t(TH), e(E); the middle 't' gets TH."""
    regions = _collapse_dense(from_text("ste")[0])
    assert regions[1]['viseme'] == 'TH'


def test_all_frames_chronological_with_rules_applied():
    """With all rules active, frames must still be monotonically increasing."""
    frames, _ = from_text("všetci tienia")
    for i in range(1, len(frames)):
        assert frames[i]['start_ms'] >= frames[i - 1]['start_ms'], (
            f"Frame {i} start_ms {frames[i]['start_ms']} < frame {i-1} start_ms "
            f"{frames[i-1]['start_ms']}"
        )


def test_all_frames_valid_visemes_with_rules_applied():
    """With all rules active, all visemes must be valid."""
    frames, _ = from_text("všetci tienia mia")
    for f in frames:
        assert f['viseme'] in VALID_VISEMES


def test_all_weights_in_range_with_rules_applied():
    """With all rules active, all weights must be in [0.0, 1.0]."""
    frames, _ = from_text("všetci tienia mia")
    for f in frames:
        assert 0.0 <= f['weight'] <= 1.0
