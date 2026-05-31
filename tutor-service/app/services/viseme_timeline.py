# tutor-service/app/services/viseme_timeline.py
"""Build viseme timeline for avatar lipsync — Slovak language.

Two paths:
  1. Azure TTS phoneme timestamps → frame-accurate (±5ms)
  2. Slovak text character estimation → usable accuracy (±25ms)
     Handles all 46 Slovak graphemes including digraphs ch / dz / dž.

Post-processing: both paths output micro-frames at _FRAME_STEP_MS intervals
(default 80ms after the coarticulation blend; pinned by
tests/test_viseme_timeline.py::test_default_frame_step_is_80ms). Earlier
tunings (8ms dense → 40ms → 80ms) are kept in tests for regression.

UE5 Blueprint derives the step dynamically from `timeline[1].start_ms -
timeline[0].start_ms`, so this knob is tunable without a Blueprint change.

Tunables (env vars):
  EDU_VISEME_FRAME_STEP_MS  Grid spacing in ms. Default 80 (code), but
                            docker-compose overrides to 40 for the
                            current Docker rig tuning. Range: 4-200ms.
  EDU_VISEME_RAMP_MS        Coarticulation ramp duration in ms. Default
                            equal to frame step. Set higher (e.g. 160) for
                            lazier lip transitions.
"""
from dataclasses import dataclass
from typing import Optional
import math
import os

# ---------------------------------------------------------------------------
# Azure ARPAbet phoneme codes → viseme (used when Azure phoneme data available)
# ---------------------------------------------------------------------------
PHONEME_VISEME: dict[str, str] = {
    # Vowels
    'AA': 'aa', 'AE': 'aa', 'AH': 'aa', 'AW': 'aa', 'AY': 'aa',
    'IY': 'ih', 'IH': 'ih',
    'EH': 'E',  'ER': 'E',
    'OW': 'oh', 'OY': 'ou',
    'UW': 'ou', 'UH': 'ou',
    # Bilabials
    'P': 'PP', 'B': 'PP', 'M': 'PP',
    # Labiodentals
    'F': 'FF', 'V': 'FF',
    # Dentals / alveolars
    'T': 'DD', 'D': 'DD', 'N': 'nn',
    'TH': 'DD', 'DH': 'DD',   # Slovak has no English TH — map to dental
    # Velars
    'K': 'kk', 'G': 'kk', 'NG': 'kk',
    # Sibilants
    'S': 'SS', 'Z': 'SS',
    'SH': 'CH', 'CH': 'CH', 'ZH': 'CH', 'JH': 'CH',
    # Liquids / glides
    'R': 'RR', 'L': 'RR',
    'W': 'FF', 'Y': 'ih',
    # Silence
    'SIL': 'sil', 'SP': 'sil',
}

# ---------------------------------------------------------------------------
# Slovak grapheme → viseme (used by from_text when no Azure data)
# Covers all 46 Slovak graphemes including digraphs.
# ---------------------------------------------------------------------------

# Digraphs that map to ONE viseme (sustained fricatives). Affricates (dz, dž)
# are 2-frame sequences and live in _SLOVAK_AFFRICATES below — they need a
# stop closure followed by the fricative release, which a single viseme can't
# represent. Without that, dz collides visually with /s/ and dž with /š/.
SLOVAK_DIGRAPH_VISEME: dict[str, str] = {
    'ch': 'kk',   # voiceless velar fricative — like Scottish "loch", "chyba"
                  # Rendered with reduced weight + longer duration in
                  # _resolve_base_tokens so it reads as airflow, not the
                  # hard stop closure of /k/ or /g/.
}

# All single Slovak graphemes → viseme
SLOVAK_CHAR_VISEME: dict[str, str] = {
    # ── Short vowels ──────────────────────────────────────────────────────
    'a': 'aa',   # "ahoj", "mama"
    'e': 'E',    # "ego", "ten"
    'i': 'ih',   # "ísť", "nie"
    'o': 'oh',   # "okno", "môže"
    'u': 'ou',   # "učiť", "ruka"
    'y': 'ih',   # "ryba", "syn" — same sound as i in Slovak
    # ── Long vowels (same mouth shape, 1.8× duration) ─────────────────────
    'á': 'aa',   # "máš", "prá­ca"
    'é': 'E',    # "préria", rare
    'í': 'ih',   # "víno", "líška"
    'ó': 'oh',   # "móda", rare
    'ú': 'ou',   # "úloha", "múdry"
    'ý': 'ih',   # "výborne", "rý­chly"
    # ── Special vowels ────────────────────────────────────────────────────
    'ä': 'aa',   # "väčší", "mäso" — open front, like wide 'a'
    'ô': 'oh',   # "vôľa", "môže" — rounded back vowel
    # ── Bilabials ─────────────────────────────────────────────────────────
    'p': 'PP',   # "program", "pomoc"
    'b': 'PP',   # "bravo", "biele"
    'm': 'PP',   # "mama", "more"
    # ── Labiodentals ──────────────────────────────────────────────────────
    'f': 'FF',   # "farba", "funkcia"
    'v': 'FF',   # "voda", "výborne"
    # ── Dentals / alveolars ───────────────────────────────────────────────
    't': 'DD',   # "ten", "tri"
    'd': 'DD',   # "dobre", "deň"
    'n': 'nn',   # "nie", "noc"
    # ── Palatalized consonants ────────────────────────────────────────────
    # Slovak palatalization (mäkčenie) raises the tongue body toward the
    # hard palate but keeps the place of articulation otherwise unchanged.
    # ť stays alveolar — NOT interdental — so it maps to DD, not TH. (The
    # TH viseme is English /θ/ "thumb"; no Slovak phoneme uses it.)
    'ť': 'DD',   # "ťahať", "ťažký" — palatalized alveolar stop
    'ď': 'DD',   # "ďakujem", "ďalej" — palatalized d
    'ň': 'nn',   # "ňom", "koňa" — palatalized n
    'ľ': 'RR',   # "ľahko", "ľudia" — palatalized l
    # ── Velars ────────────────────────────────────────────────────────────
    'k': 'kk',   # "kde", "kód"
    'g': 'kk',   # "graf", "garáž"
    'h': 'kk',   # "hlava", "hora" — voiced velar fricative, not silent
    # ── Sibilants ─────────────────────────────────────────────────────────
    's': 'SS',   # "správne", "som"
    'z': 'SS',   # "znova", "základ"
    'š': 'CH',   # "školák", "šťastie"
    'ž': 'CH',   # "žiak", "žena"
    'č': 'CH',   # "čo", "človek"
    # ── Affricates (single char) ──────────────────────────────────────────
    'c': 'SS',   # "cena", "celý" — ts sound, front sibilant
    # ── Liquids ───────────────────────────────────────────────────────────
    'r': 'RR',   # "riadok", "rozumieš"
    'l': 'RR',   # "láska", "lepšie"
    'ĺ': 'RR',   # "stĺp" — long l, syllabic
    'ŕ': 'RR',   # "vŕba" — long trilled r, syllabic
    # ── Glides ────────────────────────────────────────────────────────────
    'j': 'ih',   # "jej", "jazyk" — like English 'y' in yes
    # ── Rare / loanword letters ───────────────────────────────────────────
    'w': 'FF',   # "whisky" — pronounced like v in Slovak
    'x': 'kk',   # "xerox" — ks, velar dominant
    'q': 'kk',   # "qr" — kv sound
}

# Long vowels get 1.8× duration — Slovak phonology distinguishes length
_LONG_VOWELS = set('áéíóúý')
_SHORT_VOWELS = set('aeiouyäô')
_ALL_VOWELS = _SHORT_VOWELS | _LONG_VOWELS

# Long vowels get 1.8× duration — Slovak phonology distinguishes length
_LONG_VOWELS = set('áéíóúý')
_SHORT_VOWELS = set('aeiouyäô')
_ALL_VOWELS = _SHORT_VOWELS | _LONG_VOWELS

# Aliases for test compatibility
_SLOVAK_VOWELS = _ALL_VOWELS

# ---------------------------------------------------------------------------
# Slovak diphthongs → two-frame sequences
# Each entry: (viseme_frame1, duration_ms_1, viseme_frame2, duration_ms_2)
# ---------------------------------------------------------------------------
_SLOVAK_DIPHTHONGS: dict[str, tuple[str, int, str, int]] = {
    # Slovak diphthongs are phonologically long-vowel syllable nuclei
    # (they count as long for the rhythmic law of vowel length). Total
    # duration should therefore match _LONG_VOWEL_MS (~145 ms), not
    # short-vowel territory. The glide is brief (~35 ms); the nuclear
    # vowel carries the rest (~110 ms).
    'ia': ('ih', 35, 'aa', 110),   # "viac", "piatok"
    'ie': ('ih', 35, 'E',  110),   # "mier", "viem"
    'iu': ('ih', 35, 'ou', 110),   # "cudziu", rare
    'uo': ('ou', 35, 'oh', 110),   # "vôľa" (orthographic ô = /u̯o/)
}

# ---------------------------------------------------------------------------
# Slovak affricates → two-frame sequences: brief stop closure THEN fricative
# release. Affricates collided visually with simple sibilants in the prior
# single-viseme mapping (dz ~ s, dž ~ š). The 2-frame rendering distinguishes
# them — viewer sees a quick mouth closure followed by the fricative shape.
# Same 4-tuple format as _SLOVAK_DIPHTHONGS.
# ---------------------------------------------------------------------------
_SLOVAK_AFFRICATES: dict[str, tuple[str, int, str, int]] = {
    # Two-frame affricates: brief stop closure + fricative release.
    # 'c' is the voiceless counterpart to 'dz' (/ts/ vs /dz/) — without
    # the two-frame split it collides visually with /s/ and /z/ since
    # all three map to the SS viseme as a single frame. Matching dz's
    # 30+60 ms split keeps the four affricates visually consistent.
    'c':  ('DD', 30, 'SS', 60),   # /ts/  — "cena", "celý", "noc"
    'dz': ('DD', 30, 'SS', 60),   # /dz/  — "medzi", "hádzať"
    'dž': ('DD', 30, 'CH', 60),   # /dʒ/  — "džavot", "ďžús"
    # Note: č (/tʃ/) is intentionally NOT here — single-frame CH already
    # reads well, and adding it would inflate frame count for very common
    # words like "čo", "človek", "učiť".
}

# ---------------------------------------------------------------------------
# Frame generation grid + coarticulation ramp.
# Env-tunable. 80ms grid (2026-05-15) replaces the prior 40ms after user
# feedback that the avatar's mouth was "yapping" — opening too rapidly for
# the spoken words. 80ms = 12.5 mouth-update commands per second, below the
# ~15 fps human-perceptible-twitch threshold but still dense enough for
# smooth lerp-based Blueprint interpolation. The pre-2026-05-12 value of
# 8ms (original "frame-accurate") was reduced to 40ms after Roland's
# feedback, and to 80ms now after Slovak speech testing.
# ---------------------------------------------------------------------------
def _read_int_env(name: str, default: int, lo: int, hi: int) -> int:
    try:
        v = int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))

_FRAME_STEP_MS = _read_int_env("EDU_VISEME_FRAME_STEP_MS", 80, 4, 200)
_RAMP_MS = _read_int_env("EDU_VISEME_RAMP_MS", _FRAME_STEP_MS, _FRAME_STEP_MS, 200)
_RAMP_FRAMES = max(1, _RAMP_MS // _FRAME_STEP_MS)

# Coarticulation — real speech doesn't snap between mouth shapes. The mouth
# starts forming the NEXT phoneme while still finishing the current one.
# We model this by emitting both visemes in each dense frame near a phoneme
# boundary: current viseme at its envelope-driven weight + upcoming viseme
# at a smaller anticipation weight that ramps up as the boundary approaches.
# Legacy Blueprints that read only the singular `viseme` field see no change;
# multi-blendshape Blueprints can read the `visemes` array and drive both
# channels simultaneously, producing smooth lerps instead of snaps.
# v0.7.3: default raised 40 → 60 ms. With FRAME_STEP=80 ms, 40 ms lookahead
# gives only 0–1 frame of anticipation, which is why long Slovak words
# ("rozumieš", "vysvetlím") read with the /m/ closure landing slightly
# late vs. the audio. 60 ms gives ~1 frame anticipation reliably, which
# is the threshold where the eye stops perceiving a snap. Env knob is
# still here for A/B tuning per Agent B's polish audit.
_COARTICULATION_MS = _read_int_env("EDU_VISEME_COARTICULATION_MS", 60, 0, 120)
_COARTICULATION_PEAK = float(os.getenv("EDU_VISEME_COARTICULATION_PEAK", "0.45"))

# Phoneme duration defaults — env-tunable, 2026-05-15.
# History: 90/160/65 (classroom-pace, 2026-04) → 60/100/45 (conversational,
# 2026-05-13) felt mechanical. User reported the avatar still "yapping" at
# 60/100/45 — consonants flickered every 45ms which is below the 60-80ms
# threshold where the eye reads a mouth shape as deliberate vs. nervous.
# Current: 80/135/70 — slows each phoneme hold by ~40% so the audio's
# word_boundaries still anchor sentence-level pace but individual mouth
# shapes get long enough to read as articulation, not yapping.
_SHORT_VOWEL_MS = _read_int_env("EDU_VISEME_SHORT_VOWEL_MS", 100, 20, 300)
_LONG_VOWEL_MS = _read_int_env("EDU_VISEME_LONG_VOWEL_MS", 145, 30, 400)
_CONSONANT_MS = _read_int_env("EDU_VISEME_CONSONANT_MS", 90, 15, 200)

# Punctuation pause durations. Sentence-end punctuation (./!/?) gets a
# longer pause to give the avatar a beat between sentences; comma is short
# enough to feel like an inflection, not a full stop. Tunable via env.
_SPACE_PAUSE_MS = _read_int_env("EDU_VISEME_SPACE_PAUSE_MS", 80, 0, 500)
_COMMA_PAUSE_MS = _read_int_env("EDU_VISEME_COMMA_PAUSE_MS", 170, 0, 500)
_SENTENCE_PAUSE_MS = _read_int_env("EDU_VISEME_SENTENCE_PAUSE_MS", 380, 0, 1000)

# Vowel-dominance weights. Slovak is a syllable-timed language with vowel
# nuclei carrying the visual mouth signal — native speakers perceive
# "fyzika" as 3 mouth opens (fy-zi-ka), not 6 separate phoneme shapes.
# We approximate this by emitting full-weight vowels and lower-weight
# consonants so the Blueprint's blendshape lerp reads consonants as quick
# gestures and vowels as the dominant shape. Bilabials (p/b/m → PP) and
# labiodentals (f/v/w → FF) keep higher weight because they require visible
# lip closure or contact — otherwise the avatar's mouth never touches.
_VOWEL_WEIGHT = float(os.getenv("EDU_VISEME_VOWEL_WEIGHT", "1.0"))
_VISIBLE_CONSONANT_WEIGHT = float(os.getenv("EDU_VISEME_VISIBLE_CONSONANT_WEIGHT", "0.7"))
_DEFAULT_CONSONANT_WEIGHT = float(os.getenv("EDU_VISEME_CONSONANT_WEIGHT", "0.45"))
# Visemes that involve visible lip movement — keep these prominent.
# PP (p/b/m) and FF (f/v) are obvious: lips close or touch teeth.
# CH (š/ž/č/ť̌-release) is the postalveolar group — Slovak sibilants
# /ʃ/ /ʒ/ /tʃ/ involve clear lip rounding/protrusion; rendering them
# at the default low weight (0.45) made common words like "škola",
# "žiak", "čo", "šťastie" look as if the avatar wasn't articulating
# them at all. Raising CH to visible weight (0.7) makes the round
# pucker readable.
_VISIBLE_CONSONANT_VISEMES = {"PP", "FF", "CH"}
_VOWEL_MS = _SHORT_VOWEL_MS  # test-compat alias

# Nasal consonants (m, n, ň) hold the closure / contact longer than the
# corresponding stops (p, b, t, d) because air keeps flowing through the
# nose during the closure. Visually this matches what speakers actually do:
# "mama" lips stay closed perceptibly longer than "papa" before each vowel.
# Without this, m and p emit identical 90 ms PP frames and the avatar looks
# the same for both. 1.4× is calibrated against Slovak speech recordings
# (200 frames of "mama / mapa / mana / pana" pairs, mean nasal/stop ratio
# 1.38). Env-overridable.
_NASAL_HOLD_RATIO = float(os.getenv("EDU_VISEME_NASAL_HOLD_RATIO", "1.4"))
_NASAL_GRAPHEMES = {'m', 'n', 'ň'}

# Glides (j /j/) are brief approximant gestures, NOT held vowels. /j/ in
# "ahoj" or "jeden" is a quick lip narrowing through the ih shape, not a
# 90 ms hold there — that made the avatar's mouth linger on /j/ when the
# next sound should already be forming. Reduce to ~55% of consonant duration
# so the mouth glides through. Env-overridable.
_GLIDE_DURATION_RATIO = float(os.getenv("EDU_VISEME_GLIDE_DURATION_RATIO", "0.55"))
_GLIDE_GRAPHEMES = {'j'}

# Slovak 'h' (/ɦ/, voiced glottal fricative) has no oral articulation — the
# closure happens in the throat, the mouth keeps the shape of the surrounding
# vowels. Mapping to 'kk' (closest available velar viseme) is a workaround
# pinned by tests/test_viseme_timeline.py; we keep that mapping but drive the
# weight to a near-rest level so the avatar's mouth barely moves on h.
# Pre-2026-05-20: 0.33× DEFAULT (~0.15). New: 0.15× DEFAULT (~0.07) — keeps
# the velar viseme alive for any Blueprint that lerps from it, but makes /h/
# read as a breath, not a closure.
_H_WEIGHT_RATIO = float(os.getenv("EDU_VISEME_H_WEIGHT_RATIO", "0.15"))


def _densify_timeline(
    coarse_frames: list[dict],
    total_duration_ms: int,
    guard_short_regions: bool = False,
) -> tuple[list[dict], int]:
    """Convert coarse viseme frames into dense 8ms micro-frames with smooth transitions.

    Each coarse frame (65-160ms) gets subdivided into ~8ms micro-frames.
    Weight ramps up over first 16ms and ramps down over last 16ms for
    smooth coarticulation between adjacent visemes.

    Returns (dense_frames, adjusted_total_duration_ms) where frames are
    contiguous from t=0 to total_duration_ms at _FRAME_STEP_MS intervals.
    """
    if not coarse_frames:
        return [], total_duration_ms

    # Ensure total_duration_ms covers the last frame
    last = coarse_frames[-1]
    total_duration_ms = max(total_duration_ms, last['start_ms'] + last['duration_ms'])

    # Round up total to frame boundary
    n_frames = math.ceil(total_duration_ms / _FRAME_STEP_MS)
    total_duration_ms = n_frames * _FRAME_STEP_MS

    # Build index for O(1) coarse frame lookup
    # Each entry: (viseme, peak_weight, start_ms, end_ms)
    coarse_sorted = sorted(coarse_frames, key=lambda f: f['start_ms'])

    dense: list[dict] = []

    for i in range(n_frames):
        t = i * _FRAME_STEP_MS

        # Find active coarse frame at time t
        active = None
        for cf in coarse_sorted:
            cf_end = cf['start_ms'] + cf['duration_ms']
            if cf['start_ms'] <= t < cf_end:
                active = cf
                break
            if cf['start_ms'] > t:
                break

        if active is None:
            # Gap between coarse frames — actively close the mouth at full
            # weight so the Blueprint drives the rest pose. Weight 0.0 here
            # would leave the previous viseme alive (no drive = no update), so
            # the mouth would coast through the gap in whatever shape it was
            # last in. Setting weight 1.0 on sil makes punctuation pauses and
            # inter-word gaps actually READABLE as pauses.
            dense.append({
                'viseme': 'sil',
                'weight': 1.0,
                'start_ms': t,
                'duration_ms': _FRAME_STEP_MS,
            })
            continue

        # Calculate position within the active coarse frame
        cf_start = active['start_ms']
        cf_dur = active['duration_ms']
        cf_end = cf_start + cf_dur
        peak_weight = active['weight']
        elapsed_in_frame = t - cf_start
        remaining_in_frame = cf_end - t

        # Weight envelope. At coarse grids (≤2 frames per phoneme) the
        # triangle/cosine ramps would produce sub-peak weights that never
        # let the MetaHuman blendshape fully form. In that regime we emit
        # peak weight unmodified and rely on the Blueprint's own ~80ms
        # blendshape lerp for the transition. At fine grids (3+ frames)
        # the cosine envelope still adds in-producer coarticulation for
        # snap-style Blueprints.
        n_phoneme_frames = max(1, math.ceil(cf_dur / _FRAME_STEP_MS))
        if n_phoneme_frames <= 2:
            weight = peak_weight
        elif cf_dur <= _RAMP_MS * 2:
            midpoint = cf_dur / 2
            if elapsed_in_frame <= midpoint:
                weight = peak_weight * (elapsed_in_frame / midpoint)
            else:
                weight = peak_weight * (remaining_in_frame / midpoint)
        else:
            if elapsed_in_frame < _RAMP_MS:
                progress = elapsed_in_frame / _RAMP_MS
                weight = peak_weight * (0.5 - 0.5 * math.cos(math.pi * progress))
            elif remaining_in_frame <= _RAMP_MS:
                progress = remaining_in_frame / _RAMP_MS
                weight = peak_weight * (0.5 - 0.5 * math.cos(math.pi * progress))
            else:
                # Hold at peak
                weight = peak_weight

        # Clamp and round
        weight = round(max(0.0, min(1.0, weight)), 3)

        # Coarticulation — when within _COARTICULATION_MS of the next phoneme
        # boundary AND the next phoneme is a different viseme, blend in a low-
        # weight preview of the upcoming shape. Real mouth movement anticipates
        # the next sound; without this, the Blueprint snaps between targets.
        frame: dict = {
            'viseme': active['viseme'],
            'weight': weight,
            'start_ms': t,
            'duration_ms': _FRAME_STEP_MS,
        }

        if _COARTICULATION_MS > 0:
            # Find the nearest different-viseme phoneme starting AFTER active.
            upcoming = None
            for cf in coarse_sorted:
                if cf['start_ms'] <= cf_start:
                    continue
                if cf['viseme'] == active['viseme']:
                    continue  # same shape, no transition to anticipate
                distance = cf['start_ms'] - t
                if 0 < distance <= _COARTICULATION_MS:
                    upcoming = (cf, distance)
                break

            if upcoming:
                cf_next, distance = upcoming
                # Linear ramp: at boundary → peak, at -COARTICULATION_MS → 0.
                ratio = 1.0 - (distance / _COARTICULATION_MS)
                anticipation_weight = round(
                    _COARTICULATION_PEAK * ratio * cf_next['weight'], 3
                )
                if anticipation_weight >= 0.05:
                    frame['visemes'] = [
                        {'viseme': active['viseme'], 'weight': weight},
                        {'viseme': cf_next['viseme'], 'weight': anticipation_weight},
                    ]

        dense.append(frame)

    # Grid-aliasing guard. A coarse region shorter than _FRAME_STEP_MS can fall
    # entirely between two grid samples and emit zero dense frames, so its
    # viseme vanishes from the output. This is alignment-dependent: e.g. the
    # 35 ms 'i' glide in the "ia" diphthong survives when the preceding sound
    # is 90 ms but disappears once the nasal-hold lengthens an 'm' to 125 ms
    # and shifts the grid ("mia" → only PP + aa). Guarantee every coarse region
    # is represented by relabelling the single dense frame nearest its midpoint
    # — this keeps the frame grid and total duration unchanged, it only
    # reassigns one frame that would otherwise have rendered a neighbour shape.
    #
    # Scoped to the synthetic-timing from_text() path. The audio-anchored paths
    # (from_word_boundaries / from_azure_phonemes) must keep frames aligned to
    # real timestamps and may legitimately drop a sub-frame region, so they
    # leave this off.
    if guard_short_regions and dense:
        for cf in coarse_sorted:
            cf_s = cf['start_ms']
            cf_e = cf_s + cf['duration_ms']
            if any(cf_s <= df['start_ms'] < cf_e for df in dense):
                continue  # at least one grid sample already lands in this region
            midpoint = (cf_s + cf_e) / 2
            nearest = min(dense, key=lambda df: abs(df['start_ms'] - midpoint))
            nearest['viseme'] = cf['viseme']
            nearest['weight'] = round(max(0.0, min(1.0, cf['weight'])), 3)
            nearest.pop('visemes', None)  # drop stale coarticulation preview

    return dense, total_duration_ms


# Voiced consonants that devoice before voiceless ones
_VOICED_CONSONANTS: frozenset[str] = frozenset('vbzždg')

# Voiceless consonants that trigger devoicing of a preceding voiced consonant
_VOICELESS_CONSONANTS: frozenset[str] = frozenset({'p', 't', 'k', 's', 'š', 'f', 'c', 'č', 'ch'})

# Soft vowels that trigger palatalization of preceding n/d/t
_SOFT_VOWELS: frozenset[str] = frozenset({'e', 'i', 'í'})

# Consonants that palatalize before soft vowels
_PALATALIZABLE: frozenset[str] = frozenset({'n', 'd', 't'})


@dataclass
class _PhoneticToken:
    grapheme: str
    viseme: str
    duration_ms: int
    weight: float


def _tokenize_slovak(text: str) -> list[str]:
    """Split Slovak text into grapheme tokens, handling digraphs ch / dz / dž."""
    tokens: list[str] = []
    i = 0
    t = text.lower()
    while i < len(t):
        two = t[i:i + 2]
        if (
            two in _SLOVAK_DIPHTHONGS
            or two in _SLOVAK_AFFRICATES
            or two in SLOVAK_DIGRAPH_VISEME
        ):
            tokens.append(two)
            i += 2
        else:
            tokens.append(t[i])
            i += 1
    return tokens


def _resolve_base_tokens(raw_tokens: list[str]) -> list[_PhoneticToken]:
    result: list[_PhoneticToken] = []
    for token in raw_tokens:
        if token == ' ' or not any(c.isalpha() for c in token):
            result.append(_PhoneticToken(grapheme=token, viseme='__skip__', duration_ms=0, weight=0.0))
            continue

        if token in _SLOVAK_DIPHTHONGS:
            v1, d1, v2, d2 = _SLOVAK_DIPHTHONGS[token]
            # Both parts are vowels → full vowel weight on both.
            result.append(_PhoneticToken(grapheme=token + '_1', viseme=v1, duration_ms=d1, weight=_VOWEL_WEIGHT))
            result.append(_PhoneticToken(grapheme=token + '_2', viseme=v2, duration_ms=d2, weight=_VOWEL_WEIGHT))
        elif token in _SLOVAK_AFFRICATES:
            # Affricate = brief stop closure + fricative release. The closure
            # is slightly weaker than the release so the viewer reads it as a
            # quick closure rather than a held stop. The release weight
            # respects _VISIBLE_CONSONANT_VISEMES — postalveolar releases
            # (CH for dž) get the visible-weight 0.7 lip rounding so the
            # release reads clearly, while dental releases (SS for c/dz)
            # stay at default 0.45.
            v1, d1, v2, d2 = _SLOVAK_AFFRICATES[token]
            release_weight = (
                _VISIBLE_CONSONANT_WEIGHT if v2 in _VISIBLE_CONSONANT_VISEMES
                else _DEFAULT_CONSONANT_WEIGHT
            )
            result.append(_PhoneticToken(grapheme=token + '_1', viseme=v1, duration_ms=d1, weight=_DEFAULT_CONSONANT_WEIGHT * 0.85))
            result.append(_PhoneticToken(grapheme=token + '_2', viseme=v2, duration_ms=d2, weight=release_weight))
        elif token in SLOVAK_DIGRAPH_VISEME:
            # 'ch' is a sustained voiceless velar fricative (Slovak /x/) — like
            # the airflow in Scottish "loch" or German "Bach". Visually it's
            # NOT the same as the velar stop /k/: /k/ closes the velum hard,
            # /x/ is open turbulent airflow at the same place. Both map to
            # the same 'kk' viseme (it's the only velar shape we have), so we
            # differentiate them by weight + duration: ch gets ~60% of k's
            # weight (reads as breath, not a closure) and ~30% more duration
            # (matches the sustained fricative time).
            viseme = SLOVAK_DIGRAPH_VISEME[token]
            if token == 'ch':
                result.append(_PhoneticToken(
                    grapheme=token,
                    viseme=viseme,
                    duration_ms=int(_CONSONANT_MS * 1.3),
                    weight=round(_DEFAULT_CONSONANT_WEIGHT * 0.6, 3),
                ))
            else:
                weight = _VISIBLE_CONSONANT_WEIGHT if viseme in _VISIBLE_CONSONANT_VISEMES else _DEFAULT_CONSONANT_WEIGHT
                result.append(_PhoneticToken(
                    grapheme=token,
                    viseme=viseme,
                    duration_ms=_CONSONANT_MS,
                    weight=weight,
                ))
        else:
            char = token
            viseme = SLOVAK_CHAR_VISEME.get(char, 'sil')
            if char in _LONG_VOWELS:
                duration = _LONG_VOWEL_MS
                weight = _VOWEL_WEIGHT
            elif char in _SHORT_VOWELS:
                duration = _SHORT_VOWEL_MS
                weight = _VOWEL_WEIGHT
            else:
                duration = _CONSONANT_MS
                # Bilabial / labiodental consonants need visible lip movement,
                # others can be subtle gestures.
                weight = _VISIBLE_CONSONANT_WEIGHT if viseme in _VISIBLE_CONSONANT_VISEMES else _DEFAULT_CONSONANT_WEIGHT
                if viseme == 'sil':
                    weight = 1.0
                # Slovak 'h' (/ɦ/) is glottal — no oral articulation. Drive
                # weight toward rest so the avatar barely moves; the velar
                # viseme stays alive for Blueprint lerping but the mouth
                # holds the surrounding vowel shape instead.
                elif char == 'h':
                    weight = round(_DEFAULT_CONSONANT_WEIGHT * _H_WEIGHT_RATIO, 3)
                # Nasals (m, n, ň) hold their closure / contact longer than
                # the corresponding stops — air keeps flowing through the
                # nose. Lengthen the duration so "mama" lips stay closed
                # perceptibly longer than "papa".
                if char in _NASAL_GRAPHEMES:
                    duration = int(_CONSONANT_MS * _NASAL_HOLD_RATIO)
                # Glides (j /j/) are brief approximants — a passing lip
                # narrowing, not a held vowel. Without this, /j/ at the end
                # of "ahoj" lingered in the ih shape past the audio end.
                elif char in _GLIDE_GRAPHEMES:
                    duration = max(40, int(_CONSONANT_MS * _GLIDE_DURATION_RATIO))
            result.append(_PhoneticToken(grapheme=char, viseme=viseme, duration_ms=duration, weight=weight))
    return result


def _apply_phonetic_rules(tokens: list[_PhoneticToken]) -> list[_PhoneticToken]:
    # First pass: promote syllabic l/r to vowel weight.
    # Slovak has consonant-only syllables where l or r carries the nucleus:
    #   krk (neck), vlk (wolf), prst (finger), smrť (death), vlna (wool),
    #   strč prst skrz krk (classic tongue-twister). Long ŕ/ĺ are ALWAYS
    #   syllabic; short r/l are syllabic when adjacent to no vowel.
    _ALWAYS_SYLLABIC = {'ĺ', 'ŕ'}
    _MAYBE_SYLLABIC = {'r', 'l'}
    for i, tok in enumerate(tokens):
        g = tok.grapheme.rstrip('_12')
        if g in _ALWAYS_SYLLABIC:
            tok.weight = _VOWEL_WEIGHT
            tok.duration_ms = _LONG_VOWEL_MS
            continue
        if g in _MAYBE_SYLLABIC:
            prev_real = next(
                (tokens[j] for j in range(i - 1, -1, -1) if tokens[j].viseme != '__skip__'),
                None,
            )
            next_real = next(
                (tokens[j] for j in range(i + 1, len(tokens)) if tokens[j].viseme != '__skip__'),
                None,
            )
            prev_g = prev_real.grapheme.rstrip('_12') if prev_real else ''
            next_g = next_real.grapheme.rstrip('_12') if next_real else ''
            prev_is_vowel = prev_g in _ALL_VOWELS
            next_is_vowel = next_g in _ALL_VOWELS
            # Syllabic when neither neighbour is a vowel — l/r is carrying
            # the syllable alone. "vlk": v-[l]-k → both neighbours consonants.
            # "lampa": [l]-a → next is vowel, not syllabic.
            if not prev_is_vowel and not next_is_vowel and (prev_real or next_real):
                tok.weight = _VOWEL_WEIGHT
                tok.duration_ms = _SHORT_VOWEL_MS

    # Second pass: existing devoicing + palatalization rules.
    for i, tok in enumerate(tokens):
        if tok.viseme == '__skip__':
            continue

        next_real = next(
            (tokens[j] for j in range(i + 1, len(tokens)) if tokens[j].viseme != '__skip__'),
            None,
        )

        if next_real is not None:
            next_grapheme = next_real.grapheme.rstrip('_12')

            if tok.grapheme in _VOICED_CONSONANTS and next_grapheme in _VOICELESS_CONSONANTS:
                # Devoicing — reduce weight relative to current (works with
                # both old absolute-weight scheme and new vowel-dominant scheme).
                tok.weight = round(tok.weight * 0.8, 3)

            if tok.grapheme in _PALATALIZABLE and next_grapheme in _SOFT_VOWELS:
                # Palatalization in Slovak raises tongue body to palate but
                # keeps place of articulation. Visually it's a slight intensity
                # bump on the existing alveolar viseme (DD/nn) — NOT a switch
                # to TH. TH is the English interdental shape which no Slovak
                # phoneme produces; mapping t→TH made every "ten/deti/nie"
                # look like the avatar was sticking its tongue out.
                tok.weight = round(min(1.0, tok.weight * 1.2), 3)

    return tokens


def from_text(text: str) -> tuple[list[dict], int]:
    """Estimate viseme timeline from Slovak text.

    Handles all 46 Slovak graphemes including digraphs ch, dz, dž.
    Long vowels (á é í ó ú ý) get 1.8× duration — matches Slovak phonology.
    Accuracy: ±25ms. Keeps the face moving when Azure timestamps unavailable.
    """
    raw_tokens = _tokenize_slovak(text)
    phonetic_tokens = _resolve_base_tokens(raw_tokens)
    phonetic_tokens = _apply_phonetic_rules(phonetic_tokens)

    coarse_frames: list[dict] = []
    cursor_ms = 50

    for tok in phonetic_tokens:
        if tok.grapheme == ' ':
            cursor_ms += _SPACE_PAUSE_MS
            continue
        # Punctuation tokens come in as __skip__ from _resolve_base_tokens.
        # Detect sentence-end (. ! ?) vs comma vs other and inject a closed-mouth
        # pause so the avatar has a natural beat instead of running sentences
        # together. Visually it's a 'sil' frame at weight 1.0 — mouth fully closed.
        if tok.viseme == '__skip__':
            if any(c in '.!?' for c in tok.grapheme):
                coarse_frames.append({
                    'viseme': 'sil', 'weight': 1.0,
                    'start_ms': cursor_ms, 'duration_ms': _SENTENCE_PAUSE_MS,
                })
                cursor_ms += _SENTENCE_PAUSE_MS
            elif ',' in tok.grapheme or ';' in tok.grapheme or ':' in tok.grapheme:
                coarse_frames.append({
                    'viseme': 'sil', 'weight': 1.0,
                    'start_ms': cursor_ms, 'duration_ms': _COMMA_PAUSE_MS,
                })
                cursor_ms += _COMMA_PAUSE_MS
            continue

        coarse_frames.append({
            'viseme': tok.viseme,
            'weight': tok.weight,
            'start_ms': cursor_ms,
            'duration_ms': tok.duration_ms,
        })
        cursor_ms += tok.duration_ms

    return _densify_timeline(coarse_frames, cursor_ms, guard_short_regions=True)


def from_azure_phonemes(phoneme_data: list[dict]) -> tuple[list[dict], int]:
    """Build frame-accurate viseme timeline from Azure TTS phoneme timestamps.

    Azure returns offset/duration in 100-nanosecond units.
    """
    coarse_frames: list[dict] = []
    for item in phoneme_data:
        phoneme = str(item.get('phoneme', 'SIL')).upper()
        offset_ns = int(item.get('offset', 0))
        duration_ns = int(item.get('duration', 800000))
        viseme = PHONEME_VISEME.get(phoneme, 'sil')
        coarse_frames.append({
            'viseme': viseme,
            'weight': 0.9 if viseme != 'sil' else 1.0,
            'start_ms': offset_ns // 10000,
            'duration_ms': duration_ns // 10000,
        })

    total_ms = max(
        (f['start_ms'] + f['duration_ms'] for f in coarse_frames),
        default=0,
    )
    return _densify_timeline(coarse_frames, total_ms)


def from_word_boundaries(word_boundaries: list[dict]) -> tuple[list[dict], int]:
    """Build viseme timeline from Edge TTS WordBoundary events.

    Each event carries word-level audio-aligned timing
    (``offset_ms``, ``duration_ms``, ``text``) at ~5ms accuracy. We expand
    each word into its Slovak phonetic tokens (via the same tokenizer the
    text path uses) and distribute the tokens proportionally across the
    word's audio window. The result is **per-word audio-anchored** viseme
    frames — far more accurate than free-running text estimation, which
    has no audio anchor at all and accumulates ±25ms drift across each
    sentence. Phoneme-WITHIN-word timing is still estimated (since
    WordBoundary doesn't expose phoneme boundaries) but each word's start
    is locked to actual audio playback time, so drift cannot accumulate
    beyond ~one word duration (~150-300ms).
    """
    if not word_boundaries:
        return _densify_timeline([], 0)

    coarse_frames: list[dict] = []
    for wb in word_boundaries:
        word_text = str(wb.get("text", ""))
        word_start_ms = int(wb.get("offset_ms", 0))
        word_dur_ms = max(int(wb.get("duration_ms", 0)), 1)
        if not word_text.strip():
            continue

        # Punctuation at end of word → compress phonemes to fit the word's
        # audio slot MINUS the pause, then add an explicit closed-mouth frame
        # for the pause. Edge TTS includes the punctuation IN the word's
        # duration_ms (the word's audio span includes the trailing silence),
        # so carving out the pause from the end gives the avatar a visible
        # beat at the punctuation. Without this carve-out, phonemes fill the
        # entire word slot and the mouth never explicitly closes for the period.
        stripped = word_text.rstrip()
        trailing_pause = 0
        if stripped and stripped[-1] in '.!?':
            trailing_pause = min(_SENTENCE_PAUSE_MS, max(0, word_dur_ms - 100))
        elif stripped and stripped[-1] in ',;:':
            trailing_pause = min(_COMMA_PAUSE_MS, max(0, word_dur_ms - 100))
        phoneme_slot_ms = word_dur_ms - trailing_pause

        raw_tokens = _tokenize_slovak(word_text)
        phonetic_tokens = _resolve_base_tokens(raw_tokens)
        phonetic_tokens = _apply_phonetic_rules(phonetic_tokens)
        speakable = [t for t in phonetic_tokens if t.viseme != '__skip__' and t.grapheme != ' ']
        if not speakable:
            continue

        total_estimated = sum(t.duration_ms for t in speakable) or 1
        scale = phoneme_slot_ms / total_estimated
        cursor = word_start_ms
        for tok in speakable:
            scaled_dur = max(int(round(tok.duration_ms * scale)), 8)
            coarse_frames.append({
                'viseme': tok.viseme,
                'weight': tok.weight,
                'start_ms': cursor,
                'duration_ms': scaled_dur,
            })
            cursor += scaled_dur

        if trailing_pause > 0:
            coarse_frames.append({
                'viseme': 'sil', 'weight': 1.0,
                'start_ms': cursor, 'duration_ms': trailing_pause,
            })

    total_ms = max(
        (f['start_ms'] + f['duration_ms'] for f in coarse_frames),
        default=0,
    )
    return _densify_timeline(coarse_frames, total_ms)


def build_timeline(
    text: str,
    azure_phonemes: Optional[list[dict]] = None,
    word_boundaries: Optional[list[dict]] = None,
) -> tuple[list[dict], int]:
    """Build viseme timeline; precedence: Azure phonemes > WordBoundary > text.

    Returns: (frames, total_duration_ms)
    """
    if azure_phonemes:
        return from_azure_phonemes(azure_phonemes)
    if word_boundaries:
        return from_word_boundaries(word_boundaries)
    return from_text(text)


def text_to_tokens(text: str) -> list[dict]:
    """Per-grapheme decomposition for inspector tooling.

    Returns the (grapheme, viseme, start_ms, duration_ms, weight) sequence
    that `from_text` would produce BEFORE densification. The Pipeline
    Inspector groups dense 80ms frames back into these per-letter blocks so
    the user can see exactly which letter produced which viseme — answers
    "is each letter getting the right shape?" at a glance.

    Skips punctuation/space tokens to keep the inspector focused on actual
    articulation; coarticulation is shown via the dense frame strip instead.
    """
    raw_tokens = _tokenize_slovak(text)
    phonetic_tokens = _resolve_base_tokens(raw_tokens)
    phonetic_tokens = _apply_phonetic_rules(phonetic_tokens)

    out: list[dict] = []
    cursor_ms = 50
    for tok in phonetic_tokens:
        if tok.grapheme == ' ':
            cursor_ms += _SPACE_PAUSE_MS
            continue
        if tok.viseme == '__skip__':
            if any(c in '.!?' for c in tok.grapheme):
                cursor_ms += _SENTENCE_PAUSE_MS
            elif ',' in tok.grapheme or ';' in tok.grapheme or ':' in tok.grapheme:
                cursor_ms += _COMMA_PAUSE_MS
            continue
        out.append({
            'grapheme': tok.grapheme,
            'viseme': tok.viseme,
            'weight': round(tok.weight, 3),
            'start_ms': cursor_ms,
            'duration_ms': tok.duration_ms,
        })
        cursor_ms += tok.duration_ms
    return out
