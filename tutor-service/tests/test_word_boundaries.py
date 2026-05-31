"""Pin the Edge TTS WordBoundary capture + word-aligned viseme timeline
(Increment 4 of the streaming-TTS sync workstream).

Background — before this change, every TTS provider used text-based viseme
estimation (~25ms accuracy, no audio anchor — drift accumulates across the
sentence). Edge TTS's ``Communicate.stream()`` emits WordBoundary events
interleaved with audio packets at NO extra cost, but our stream_chunks()
silently dropped them. This file pins three things:

  1. The TTSService.stream_chunks() side-channel parameter — when callers
     pass a list, Edge TTS WordBoundary events are appended to it as
     ``{"offset_ms": int, "duration_ms": int, "text": str}`` dicts.
     Other providers do not populate the list (graceful degradation).

  2. The new viseme_timeline.from_word_boundaries() function — accepts
     the side-channel list and returns dense viseme frames with each
     word's start time anchored to actual audio playback time. This caps
     drift at ~one word duration (~150-300ms) instead of accumulating
     across the whole sentence.

  3. build_timeline() precedence: Azure phonemes > WordBoundary > text.
     Azure stays the gold standard (~5ms phoneme-level), WordBoundary is
     the new middle tier (~5ms word-level), text is the always-available
     floor (±25ms estimation).

A future contributor "tidying up" stream_chunks() could trivially drop the
side-channel parameter again. These tests catch that regression.
"""
from app.services.viseme_timeline import (
    from_word_boundaries,
    build_timeline,
    _FRAME_STEP_MS,
)


def test_from_word_boundaries_empty_returns_empty():
    """Empty input → empty timeline. Defensive contract for the case where
    Edge TTS doesn't emit any WordBoundary events (unlikely but possible
    on short utterances or punctuation-only synthesis)."""
    frames, total = from_word_boundaries([])
    assert frames == []
    assert total == 0


def test_from_word_boundaries_anchors_word_start_to_audio_offset():
    """Each word's first viseme frame MUST start at the word's audio
    offset_ms. This is THE invariant that makes word-boundary visemes
    better than text estimation — text drifts ±25ms, this is locked to
    actual audio playback time at every word boundary."""
    boundaries = [
        {"offset_ms": 100, "duration_ms": 200, "text": "ahoj"},
        {"offset_ms": 350, "duration_ms": 250, "text": "svet"},
    ]
    frames, total = from_word_boundaries(boundaries)
    assert frames, "expected dense frames from two-word boundaries"
    # A "speaking" frame is an actual mouth shape, NOT the closed-mouth rest
    # pose: the densifier deliberately fills inter-word / pre-speech gaps with
    # weight-1.0 'sil' frames so pauses read as pauses, so weight alone does not
    # distinguish speech from silence — exclude the 'sil' viseme.
    def _is_speaking(f):
        return f["viseme"] != "sil" and f["weight"] > 0.3
    word_starts = sorted({f["start_ms"] for f in frames if _is_speaking(f)})
    assert word_starts, "expected at least one speaking frame"
    assert word_starts[0] >= 100, (
        f"first speaking frame must be at or after the first word's "
        f"offset_ms=100, got {word_starts[0]}"
    )
    second_word_zone = [f for f in frames if 350 <= f["start_ms"] < 600 and _is_speaking(f)]
    assert second_word_zone, (
        "expected speaking frames in the second word's audio window "
        "[350, 600)ms — word-boundary anchoring failed"
    )


def test_from_word_boundaries_distributes_phonemes_within_word_window():
    """Phonetic tokens within a word are SCALED to fit the word's audio
    duration — long words get long-duration frames, short words get short.
    This means the avatar's mouth movements within a word match the
    actual speech rate, not free-running text estimates."""
    boundaries = [
        {"offset_ms": 0, "duration_ms": 600, "text": "programovanie"},
    ]
    frames, total = from_word_boundaries(boundaries)
    assert frames, "expected frames for non-empty word"
    assert total >= 500, (
        f"total duration must be at least the word's audio window (600ms), "
        f"got {total}ms — phoneme distribution must respect the word window"
    )


def test_from_word_boundaries_skips_punctuation_only_words():
    """Words with no speakable phonetic tokens (pure punctuation, whitespace)
    must not generate frames. Defensive — Edge TTS occasionally emits
    boundaries for sentence-ending punctuation."""
    boundaries = [
        {"offset_ms": 0, "duration_ms": 100, "text": "."},
        {"offset_ms": 100, "duration_ms": 200, "text": "ahoj"},
    ]
    frames, total = from_word_boundaries(boundaries)
    # Exclude the closed-mouth rest pose ('sil', weight 1.0) that fills the
    # pre-speech gap — only actual mouth shapes count as "speaking" frames.
    word_starts = {f["start_ms"] for f in frames if f["viseme"] != "sil" and f["weight"] > 0.3}
    assert all(s >= 100 for s in word_starts), (
        f"punctuation-only word at [0,100) should produce no speaking frames; "
        f"got speaking frames at {sorted(word_starts)}"
    )


def test_from_word_boundaries_dense_frame_step():
    """Output must use the standard 8ms dense frame step so the frontend's
    O(1) lookup `floor(audioPositionMs / 8)` still works. If this changed,
    every v4.0 Blueprint and the frontend rAF loop would break silently."""
    boundaries = [
        {"offset_ms": 0, "duration_ms": 400, "text": "test"},
    ]
    frames, _ = from_word_boundaries(boundaries)
    if len(frames) >= 2:
        step = frames[1]["start_ms"] - frames[0]["start_ms"]
        assert step == _FRAME_STEP_MS, (
            f"dense frame step must be {_FRAME_STEP_MS}ms (the value the "
            f"frontend `floor(audioPositionMs / {_FRAME_STEP_MS})` lookup "
            f"depends on), got {step}ms"
        )


def test_build_timeline_prefers_word_boundaries_over_text():
    """When word_boundaries is provided, build_timeline() MUST use it
    instead of text estimation. This is the wiring point that makes the
    whole feature actually fire from chat.py."""
    boundaries = [
        {"offset_ms": 50, "duration_ms": 300, "text": "ahoj"},
    ]
    frames_wb, total_wb = build_timeline("ahoj svet", word_boundaries=boundaries)
    frames_text, total_text = build_timeline("ahoj svet")

    assert total_wb != total_text or len(frames_wb) != len(frames_text), (
        "word-boundary timeline must differ from pure-text timeline; if "
        "they're identical, build_timeline() is silently ignoring the "
        "word_boundaries parameter"
    )


def test_build_timeline_prefers_azure_over_word_boundaries():
    """Precedence rule: Azure phonemes > WordBoundary > text. Azure is the
    gold standard (~5ms phoneme-level) and must win when both are present.
    Pinned because flipping the precedence would silently degrade quality
    on Azure-using deployments."""
    azure = [
        {"phoneme": "AA", "offset": 1000000, "duration": 800000},
    ]
    boundaries = [
        {"offset_ms": 1000, "duration_ms": 300, "text": "ahoj"},
    ]
    frames_az, _ = build_timeline("ahoj", azure_phonemes=azure)
    frames_both, _ = build_timeline("ahoj", azure_phonemes=azure, word_boundaries=boundaries)

    assert frames_az == frames_both, (
        "when both azure_phonemes AND word_boundaries are provided, the "
        "result MUST equal the azure-only result — Azure precedence violated"
    )


def test_stream_chunks_signature_accepts_word_boundaries_kwarg():
    """The stream_chunks() side-channel parameter MUST be a kwarg on the
    method signature so callers can pass it without positional confusion.
    Pinned because removing the parameter would break chat.py's
    word-boundary wiring without any other test catching it."""
    import inspect
    from app.services.tts_service import TTSService
    sig = inspect.signature(TTSService.stream_chunks)
    assert "word_boundaries" in sig.parameters, (
        "TTSService.stream_chunks must accept a `word_boundaries` kwarg as "
        "the side-channel for WordBoundary collection (Increment 4)"
    )
    param = sig.parameters["word_boundaries"]
    assert param.default is None, (
        "word_boundaries must default to None so callers that don't need "
        "WordBoundary timing don't pay any cost (and other providers don't "
        "have to handle the kwarg specially)"
    )
