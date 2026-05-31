# tutor-service/app/services/emotion_detector.py
"""Slovak emotion detector — rule-based keyword matching with inflection awareness.

9 emotion labels:
  celebrating      — full joy, achievement moment
  proud            — warm personal pride, student mastered something
  encouraging_mild — gentle "you're getting there"
  correcting       — error correction, needs to try again
  patient          — calm reassurance after repeated mistakes
  curious          — genuine interest in student's response
  thinking_deep    — active concentration on a hard question
  surprise         — unexpected situation
  neutral          — default

Slovak has heavy inflection (gender, case, number) so patterns use word stems
with `\\w*` tails — e.g. `výborn\\w*` catches `výborne / výborná / výborný /
výborné / výborného / výborných / …`. Original phrases are preserved as-is.
Verified by `tests/test_emotion_detector.py` which pins inflected forms.
"""
import re
from dataclasses import dataclass


@dataclass
class EmotionResult:
    emotion: str    # see labels above
    intensity: float  # 0.0–1.0


# ── Patterns (Slovak, inflection-aware) ──────────────────────────────

# Joy / celebration. Stems catch all Slovak case forms.
_CELEBRATING = re.compile(
    r'\b('
    r'výborn\w*|skvel\w*|perfektn\w*|bravo|bravó|'
    r'fantastick\w*|úžasn\w*|vynikajúc\w*|vynikajúco|'
    r'výnimočn\w*|super|šikovn\w*|presne\s+tak|'
    r'dokonal\w*|úspešn\w*|gratulujem|gratuluje\w*|'
    r'hurá|paráda|jupí{1,2}|'
    r'famózn\w*|geniáln\w*'
    r')\b',
    re.IGNORECASE,
)

# Warm pride after the student mastered something. Note: `som hrd\w+`,
# `som rad\w?` cover gendered forms (hrdý/hrdá/hrdé, rada/rád).
_PROUD = re.compile(
    r'(?<!\w)('
    r'som\s+hrd\w+|hrd\w+\s+na\s+teba|som\s+rad[aáý]\w?|'
    r'vedel\w*\s+som|vedeli\s+sme|'
    r'zlepšil\w*|zlepšeni\w*|pokrok\w*|vidím\s+pokrok|'
    r'rast(?:ie\w*|í\w*|ú\w*|nie\w*|úc\w*)|rastie|rastieš|rastíš|'
    r'to\s+si\s+zvládol|to\s+si\s+zvládla|zvládol\w*\s+si|zvládli\s+ste|'
    r'napredu\w+|napredoval\w*|odviedol\w*\s+(?:si\s+)?dobr\w+'
    r')(?!\w)',
    re.IGNORECASE,
)

# Mistake / wrong answer.
_CORRECTING = re.compile(
    r'(?<!\w)('
    # Bare "nie" is intentionally loose (matches "Nie, …" tutor corrections);
    # documented behaviour pinned in test_emotion_detector_deep.py.
    r'nie|nesprávn\w*|nesúhlasím|'
    r'chyb[aiyuou]\w*|chybn\w*|'
    # "skús/skúste znova" = correcting (you-singular/formal);
    # NOT "skúsme to znova" — that's empathetic and lands in PATIENT below.
    r'(?:skús|skúste)\s+(?:to\s+)?(?:znova|inak)|skúsme\s+to\s+inak|'
    r'bohužiaľ|žiaľ(?:bohu)?|omyl\w*|'
    r'zabudol\w*|zabudla\w*|zabudli\w*|'
    r'to\s+nie\s+je|to\s+nesedí|'
    r'oprav\w+'
    r')(?!\w)',
    re.IGNORECASE,
)

# Calm reassurance / "no problem, try again".
_PATIENT = re.compile(
    r'(?<!\w)('
    r'nevad[ií]\w?|žiadny\s+problém|to\s+sa\s+stáva|'
    r'skúsme\s+to\s+znova|ešte\s+raz|'
    r'pokojne?|pomaly|krok\s+za\s+krokom|'
    r'spolu\s+to\s+zvládneme|nie\s+je\s+to\s+jednoduch\w*|'
    r'chápem|rozumiem|úplne\s+v\s+poriadku|netreba\s+sa\s+báť|'
    r'kľudne|nezúfaj\w*'
    r')(?!\w)',
    re.IGNORECASE,
)

# Genuine interest in the student.
_CURIOUS = re.compile(
    r'(?<!\w)('
    r'zaujímav\w*|to\s+je\s+zaujímavé|to\s+ma\s+zaujíma|'
    r'povedz\s+mi\s+viac|porozprávaj\w*|rozprávaj\s+mi|hovor\s+ďalej|'
    r'prečo\s+(?:si\s+)?myslíš|čo\s+tým\s+myslíš|ako\s+to\s+myslíš|'
    r'naozaj\??|skutočne\??|fakt\?|'
    r'to\s+je\s+nečakané|netušil\w*|chcel\w*\s+by\s+som\s+vedieť'
    r')(?!\w)',
    re.IGNORECASE,
)

# Active concentration on a hard question.
_THINKING_DEEP = re.compile(
    r'(?<!\w)('
    r'nechaj\s+ma\s+(?:premyslieť|rozmyslieť|zamyslieť)|'
    r'musím\s+sa\s+zamyslieť|zamyslime\s+sa|'
    r'to\s+je\s+(?:ťažk\w*|zložit\w*|náročn\w*)\s+otázka|'
    r'zložit\w*\s+otázka|ťažk\w*\s+otázka|'
    r'dobrá\s+otázka|skvelá\s+otázka|výborná\s+otázka|'
    r'premýšľa\w*|uvažuje\w*|porozmýšľa\w*|'
    # `zamysl\w+` catches "zamyslieť sa", "zamyslenie", "zamyslime sa" — all
    # thinking. Standalone so "Musím sa nad tým zamyslieť" matches without
    # needing the exact `musím sa zamyslieť` phrase (allows words between).
    r'zamysl\w+|'
    r'to\s+si\s+vyžaduje|pozrime\s+sa\s+na\s+to|'
    r'hmm+'
    r')(?!\w)',
    re.IGNORECASE,
)

# Unexpected / wow.
_SURPRISE = re.compile(
    r'(?<!\w)('
    r'to\s+som\s+nečakal\w*|'
    r'wow|ohó|ej|fíha|fíúha|'
    r'to\s+je\s+prekvapiv\w*|prekvapuje\w*|nečakane|nečakan\w*|'
    r'zaujímav\w*\s+pohľad|to\s+ma\s+prekvapilo|'
    r'fakt\?|naozaj\?|to\s+je\s+naozaj|ohromujúc\w*'
    r')(?!\w)',
    re.IGNORECASE,
)

# Soft positive default — also catches generic "good", "yes", "right".
_ENCOURAGING_MILD = re.compile(
    r'\b('
    r'dobre|takmer|skoro|pokračuj\w*|správnym\s+smerom|blízko|'
    r'dobr\w*\s+pokus|správna\s+myšlienka|správn\w*|presne|áno|'
    r'dobrý\s+začiatok|skoro\s+správne|si\s+na\s+(?:dobrej|správnej)\s+ceste|'
    r'držím\s+palce|snaž\s+sa\s+ďalej|to\s+je\s+dobré|nie\s+je\s+to\s+zlé'
    r')\b',
    re.IGNORECASE,
)


def _intensity_bonus(text: str) -> float:
    """Signal-strength bonus for caps + exclamation marks. Capped at +0.25."""
    if not text:
        return 0.0
    excl_count = text.count("!")
    excl_bonus = min(excl_count * 0.05, 0.15)
    alpha = [c for c in text if c.isalpha()]
    if alpha:
        caps_ratio = sum(1 for c in alpha if c.isupper()) / len(alpha)
        caps_bonus = min(caps_ratio * 0.20, 0.10)
    else:
        caps_bonus = 0.0
    return excl_bonus + caps_bonus


def _scaled(emotion: str, base: float, text: str) -> EmotionResult:
    bonus = _intensity_bonus(text)
    scaled = round(min(base + bonus, 1.0), 4)
    return EmotionResult(emotion=emotion, intensity=scaled)


def _rule_based(text: str) -> EmotionResult:
    # THINKING_DEEP runs BEFORE celebrating so "skvelá / výborná otázka" isn't
    # eaten by CELEBRATING's `skvel\w*` / `výborn\w*` stems. Pure praise like
    # "Skvelá práca!" doesn't contain "otázka" so it still falls through to
    # celebrating, as intended.
    if _THINKING_DEEP.search(text):
        return _scaled('thinking_deep', 0.75, text)
    if _CELEBRATING.search(text):
        return _scaled('celebrating', 0.9, text)
    if _PROUD.search(text):
        return _scaled('proud', 0.8, text)
    if _CORRECTING.search(text):
        return _scaled('correcting', 0.72, text)
    if _PATIENT.search(text):
        return _scaled('patient', 0.58, text)
    if _CURIOUS.search(text):
        return _scaled('curious', 0.68, text)
    if _SURPRISE.search(text):
        return _scaled('surprise', 0.65, text)
    if _ENCOURAGING_MILD.search(text):
        return _scaled('encouraging_mild', 0.62, text)
    return EmotionResult(emotion='neutral', intensity=0.4)


_bert_detector = None


def get_detector(backend: str = "regex"):
    global _bert_detector
    if backend == "bert":
        if _bert_detector is None:
            from app.services.bert_emotion_detector import BertEmotionDetector
            _bert_detector = BertEmotionDetector()
        return _bert_detector.detect
    return _rule_based


def detect_emotion(text: str) -> EmotionResult:
    import os
    backend = os.environ.get("EMOTION_BACKEND", "regex")
    return get_detector(backend)(text)
