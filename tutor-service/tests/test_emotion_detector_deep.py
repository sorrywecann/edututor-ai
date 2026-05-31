"""
EduTutor.AI — Emotion Detector Deep Tests

Covers every rule-based branch and edge case in emotion_detector.py:
  - All celebrating trigger words
  - All correcting trigger words
  - All encouraging trigger words
  - Neutral fallback
  - Mixed signals (celebrating wins over correcting)
  - Case insensitivity
  - Empty / whitespace / punctuation-only input
  - Very long text
  - Slovak diacritics
  - Intensity clamping (always 0.0–1.0)
  - EmotionResult dataclass fields
"""
import pytest
from app.services.emotion_detector import detect_emotion, EmotionResult


# ---------------------------------------------------------------------------
# Return type contract
# ---------------------------------------------------------------------------

def test_returns_emotion_result_instance():
    result = detect_emotion("test")
    assert isinstance(result, EmotionResult)


def test_emotion_field_is_string():
    result = detect_emotion("ahoj")
    assert isinstance(result.emotion, str)


def test_intensity_field_is_float():
    result = detect_emotion("ahoj")
    assert isinstance(result.intensity, float)


def test_emotion_is_one_of_valid_labels():
    valid = {
        "neutral", "encouraging_mild", "correcting", "celebrating",
        "proud", "patient", "curious", "thinking_deep", "surprise",
    }
    for text in ["Výborne!", "Nie, chyba.", "Dobre.", "Definícia je..."]:
        assert detect_emotion(text).emotion in valid


# ---------------------------------------------------------------------------
# Celebrating — all trigger words
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("word", [
    "výborne", "Výborne", "VÝBORNE",
    "skvelé", "Skvelé",
    "perfektné", "Perfektné",
    "bravo", "Bravo",
    "fantastické",
    "úžasné",
    "vynikajúco",
    "skvelo",
    "výborné",
])
def test_celebrating_trigger(word):
    result = detect_emotion(f"{word}! To je správna odpoveď.")
    assert result.emotion == "celebrating", f"Expected celebrating for {word!r}"
    assert result.intensity >= 0.85


def test_celebrating_high_intensity():
    result = detect_emotion("Výborne! Presne tak!")
    assert result.intensity >= 0.85


# ---------------------------------------------------------------------------
# Correcting — all trigger words
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("word", [
    "nie", "Nie", "NIE",
    "nesprávne",
    "chyba",
    "skúste znova",
    "skús znova",
    "bohužiaľ",
    "omyl",
    "zabudl",
])
def test_correcting_trigger(word):
    result = detect_emotion(f"{word}, to nie je správne.")
    assert result.emotion == "correcting", f"Expected correcting for {word!r}"
    assert result.intensity >= 0.6


# ---------------------------------------------------------------------------
# Encouraging — all trigger words
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("word", [
    "dobre", "Dobre",
    "správne", "Správne",
    "takmer",
    "pokračuj",
    "presne",
    "áno", "Áno",
    "správna",
])
def test_encouraging_trigger(word):
    result = detect_emotion(f"{word}, si na správnej ceste.")
    assert result.emotion in ("encouraging_mild", "celebrating"), \
        f"Expected encouraging/celebrating for {word!r}, got {result.emotion}"
    assert result.intensity >= 0.5


# ---------------------------------------------------------------------------
# Neutral fallback
# ---------------------------------------------------------------------------

def test_neutral_factual_definition():
    result = detect_emotion("Newtonov zákon hovorí, že F = ma.")
    assert result.emotion == "neutral"


def test_neutral_long_explanation():
    text = (
        "Veľká Morava bola stredoveký štát, ktorý existoval v 9. storočí. "
        "Rozkládal sa na území dnešného Slovenska a Moravy. "
        "Zakladateľom bol knieža Mojmír I."
    )
    result = detect_emotion(text)
    assert result.emotion == "neutral"
    assert result.intensity == 0.4


def test_neutral_mathematical_formula():
    result = detect_emotion("Kvadratická rovnica: ax² + bx + c = 0, D = b² - 4ac")
    assert result.emotion == "neutral"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_empty_string_returns_neutral():
    result = detect_emotion("")
    assert result.emotion == "neutral"
    assert 0.0 <= result.intensity <= 1.0


def test_whitespace_only_returns_neutral():
    result = detect_emotion("   \n\t   ")
    assert result.emotion == "neutral"


def test_punctuation_only_returns_neutral():
    result = detect_emotion("!!! ??? ... ---")
    assert result.emotion == "neutral"


def test_numbers_only_returns_neutral():
    result = detect_emotion("42 3.14 100%")
    assert result.emotion == "neutral"


def test_very_long_text_does_not_crash():
    long_text = "Slovník slovenského jazyka obsahuje tisíce slov. " * 200
    result = detect_emotion(long_text)
    assert result.emotion in {"neutral", "encouraging_mild", "correcting", "celebrating", "proud", "patient", "curious", "thinking_deep", "surprise"}
    assert 0.0 <= result.intensity <= 1.0


def test_slovak_diacritics_do_not_crash():
    result = detect_emotion("Ľudovít Štúr kodifikoval slovenčinu v roku 1843. Štvrtá čast.")
    assert result.emotion in {"neutral", "encouraging_mild", "correcting", "celebrating", "proud", "patient", "curious", "thinking_deep", "surprise"}


# ---------------------------------------------------------------------------
# Priority: celebrating > correcting > encouraging > neutral
# When multiple triggers present, celebrating wins
# ---------------------------------------------------------------------------

def test_celebrating_beats_correcting():
    """Text with both celebrating and correcting words — celebrating wins."""
    result = detect_emotion("Výborne, ale nie celkom správne.")
    assert result.emotion == "celebrating"  # celebrating matched first


def test_correcting_beats_encouraging():
    """Text with both correcting and encouraging words — correcting wins."""
    result = detect_emotion("Nie, dobre skúsil si to.")
    assert result.emotion == "correcting"  # correcting matched before encouraging


# ---------------------------------------------------------------------------
# Intensity always in [0.0, 1.0]
# ---------------------------------------------------------------------------

def test_intensity_never_below_zero():
    for text in ["", "neutral text", "Výborne!", "Nie!"]:
        result = detect_emotion(text)
        assert result.intensity >= 0.0, f"Intensity below 0 for: {text!r}"


def test_intensity_never_above_one():
    for text in ["", "neutral text", "Výborne!", "Nie!"]:
        result = detect_emotion(text)
        assert result.intensity <= 1.0, f"Intensity above 1 for: {text!r}"


# ---------------------------------------------------------------------------
# Case insensitivity
# ---------------------------------------------------------------------------

def test_case_insensitive_celebrating():
    assert detect_emotion("VÝBORNE!").emotion == "celebrating"
    assert detect_emotion("výborne!").emotion == "celebrating"
    assert detect_emotion("Výborne!").emotion == "celebrating"


def test_case_insensitive_correcting():
    assert detect_emotion("NIE, skús znova.").emotion == "correcting"
    assert detect_emotion("nie, skús znova.").emotion == "correcting"
