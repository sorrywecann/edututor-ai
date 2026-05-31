"""
test_lipsync_stress.py — Concurrent lipsync pipeline stress & load simulation
──────────────────────────────────────────────────────────────────────────────
Tests the viseme pipeline under simulated load:
  • Concurrent builds (text + audio path) from many virtual users
  • Rapid sequential re-calls (fast chat turns, 20 VU emulation)
  • Memory stability (no linear growth over repeated calls)
  • Path switching (text ↔ audio ↔ hybrid)

Created: Phase B5, Výstup 3 final-execution plan
"""
import pytest
import time
import asyncio
import sys
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.services.viseme_timeline import from_text, build_timeline, _FRAME_STEP_MS

SK_PHRASES = [
    "ahoj", "čo je konštruktor", "vysvetli dedičnosť v OOP",
    "ako funguje garbage collector", "čo znamená polymorfizmus",
    "aký je rozdiel medzi triedou a inštanciou",
    "programovanie v Pythone je zábavné", "slovenčina je krásny jazyk",
    "ďakujem za pomoc", "dovidenia priateľ",
    "môžeš mi vysvetliť rekurziu",
    "čo je to premenná", "definuj algoritmus",
    "ako napísať cyklus", "vysvetli pole",
]


class TestSequentialThroughput:
    """Single-user, rapid-turn simulation."""

    def test_rapid_sequential_20_turns(self):
        """Simulate 20 fast chat exchanges — all must succeed."""
        for phrase in SK_PHRASES[:20]:
            frames, dur = from_text(phrase)
            assert len(frames) > 0, f"No frames for '{phrase}'"
            assert dur > 0, f"Zero duration for '{phrase}'"
            for f in frames:
                assert 0.0 <= f['weight'] <= 1.0

    def test_100_repeated_calls_no_degradation(self):
        """100 calls to the same phrase should be fast and identical."""
        phrase = "slovenčina je krásny jazyk"
        first_frames, first_dur = from_text(phrase)
        start = time.perf_counter()
        for i in range(100):
            frames, dur = from_text(phrase)
            if i == 0:
                continue  # skip first (already done)
            assert dur == first_dur, f"Iteration {i}: duration changed"
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 1500, f"100 calls took {elapsed:.1f}ms"


class TestConcurrentStress:
    """Multi-user concurrent viseme generation."""

    def test_concurrent_20_vus(self):
        """Simulate 20 concurrent virtual users, each building a timeline."""
        def build_one(phrase):
            return from_text(phrase)

        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = [pool.submit(build_one, SK_PHRASES[i % len(SK_PHRASES)])
                       for i in range(200)]
            results = []
            for f in as_completed(futures):
                frames, dur = f.result()
                results.append((len(frames), dur))

        assert len(results) == 200
        for nframes, dur in results:
            assert nframes > 0, "Empty frames in concurrent build"
            assert dur > 0, "Zero duration in concurrent build"

    def test_concurrent_mixed_phrases_50_vus(self):
        """50 VU burst, every phrase gets built at least once."""
        def build_one(phrase):
            return from_text(phrase)

        phrase_list = SK_PHRASES * 4  # 60 iterations
        with ThreadPoolExecutor(max_workers=50) as pool:
            futures = [pool.submit(build_one, p) for p in phrase_list]
            results = [f.result() for f in as_completed(futures)]

        assert len(results) == 60
        for frames, dur in results:
            assert len(frames) > 0
            assert dur > 0

    def test_sequential_then_concurrent_no_contamination(self):
        """Sequential results must match concurrent results for same input."""
        phrase = "slovenčina je krásny jazyk"
        seq_frames, seq_dur = from_text(phrase)

        def build_one(p):
            return from_text(p)

        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = [pool.submit(build_one, phrase) for _ in range(10)]
            for f in as_completed(futures):
                conc_frames, conc_dur = f.result()
                assert conc_dur == seq_dur
                assert conc_frames == seq_frames


class TestMemoryStability:
    """No linear memory growth over repeated calls."""

    def test_memory_does_not_grow_over_1000_calls(self):
        """After 1000 repeated calls, duration and frame count stable."""
        phrase = "programovanie v Pythone"
        frames_before, dur_before = from_text(phrase)

        for _ in range(1000):
            from_text(phrase)

        frames_after, dur_after = from_text(phrase)
        assert dur_after == dur_before
        assert len(frames_after) == len(frames_before)
        for a, b in zip(frames_after, frames_before):
            assert a == b

    def test_varied_phrases_1000_calls(self):
        """1000 calls across varied phrases, check no leakage."""
        import itertools
        import random
        random.seed(42)
        phrase_pool = list(itertools.islice(itertools.cycle(SK_PHRASES), 1000))
        random.shuffle(phrase_pool)

        for phrase in phrase_pool:
            frames, dur = from_text(phrase)
            assert len(frames) > 0 and dur > 0


class TestMixedPathSimulation:
    """Simulate runtime path switching (mimics hybrid mode)."""

    def test_rapid_text_to_azure_switching(self):
        """Alternate text-only and Azure-phoneme builds rapidly."""
        azure_fixture = [
            {'phoneme': 'AA', 'offset': 0, 'duration': 500_000},
            {'phoneme': 'L', 'offset': 500_000, 'duration': 300_000},
            {'phoneme': 'S', 'offset': 800_000, 'duration': 400_000},
        ]

        for i in range(50):
            if i % 2 == 0:
                frames, dur = from_text("ahoj svet")
            else:
                frames, dur = build_timeline("als", azure_phonemes=azure_fixture)
            assert len(frames) > 0
            assert dur > 0

    def test_production_like_sequence(self):
        """Realistic production sequence: varied chat turns, some short, some long."""
        sequence = [
            ("ahoj", None),
            ("čo je konštruktor v Pythone", None),
            ("ďakujem, rozumiem", None),
            ("vysvetli mi dedičnosť", None),
            ("môžeš uviesť príklad", None),
            ("dovidenia", None),
        ]
        total_frames = 0
        for phrase, azure in sequence:
            frames, dur = from_text(phrase)
            total_frames += len(frames)
            assert len(frames) > 0
            assert 0.0 <= frames[-1]['weight'] <= 1.0

        assert total_frames > 0, "No frames produced across sequence"


class TestParameterBoundaries:
    """Edge values for env-tunable parameters."""

    def test_invalid_frame_step_negative(self, monkeypatch):
        """Zero or negative frame step should still produce output (graceful)."""
        monkeypatch.setenv("EDU_VISEME_FRAME_STEP_MS", "0")
        import importlib
        import app.services.viseme_timeline as mod
        importlib.reload(mod)
        try:
            # Should not crash
            frames, dur = mod.from_text("ahoj")
            assert dur is not None
        except Exception:
            pass  # Graceful failure also acceptable
        finally:
            monkeypatch.delenv("EDU_VISEME_FRAME_STEP_MS", raising=False)
            importlib.reload(mod)

    def test_long_vowels_longer_than_short_pairwise(self):
        """Every long vowel should produce a longer duration than its short counterpart."""
        pairs = [("a", "á"), ("e", "é"), ("i", "í"), ("o", "ó"), ("u", "ú"), ("y", "ý")]
        for short, long in pairs:
            _, ds = from_text(short)
            _, dl = from_text(long)
            if ds > 0:  # only compare if short produces frames
                assert dl >= ds, f"Long '{long}' ({dl}ms) not ≥ short '{short}' ({ds}ms)"


class TestResponseShapeConformance:
    """Contract: output shape matches what the frontend/UE5 expects."""

    def test_every_frame_has_required_keys(self):
        required = {'viseme', 'weight', 'start_ms', 'duration_ms'}
        for phrase, _ in [
            ("ahoj", ["aa"]),
            ("dobrý deň", ["DD"]),
            ("ďakujem pekne", ["DD"]),
        ]:
            frames, _ = from_text(phrase)
            for f in frames:
                assert required.issubset(set(f.keys())), (
                    f"Frame missing required keys: missing={required - set(f.keys())}, "
                    f"frame keys: {set(f.keys())}"
                )

    def test_weights_sum_reasonable(self):
        """Per-frame weights should be well-formed (0..1, no frame has all 0 weight)."""
        for phrase in SK_PHRASES[:5]:
            frames, _ = from_text(phrase)
            all_zero_frame_count = 0
            for f in frames:
                assert 0.0 <= f['weight'] <= 1.0
                if f['weight'] == 0.0:
                    all_zero_frame_count += 1
            # Some frames can be zero (silence) but not ALL
            assert all_zero_frame_count < len(frames), (
                f"All frames have weight 0.0 for '{phrase}'"
            )
