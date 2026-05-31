"""
test_emotion_detector_inflected.py — pins the Slovak-inflection-aware patterns.

The original detector only matched base forms (e.g. `skvelé` but not `skvelá`),
so most live LLM replies fell through to `neutral`. This file pins the inflected
forms the rewrite now catches, plus the precedence edge cases
(`Skvelá otázka` → thinking_deep, not celebrating; `Skúsme to znova` → patient,
not correcting).

Companion to the older `test_emotion_detector.py` and
`test_emotion_detector_deep.py`, which keep the base-form contracts.
"""
from __future__ import annotations

import pytest

from app.services.emotion_detector import _rule_based, detect_emotion


# ── 1) Inflected forms — the failures the old regex made on real LLM output ──
@pytest.mark.parametrize("text,expected", [
    # CELEBRATING — non-base Slovak case forms ──────────────────────────────
    ("Výborná práca!", "celebrating"),                              # výborn-Á
    ("To je výborný výsledok.", "celebrating"),                     # výborn-Ý
    ("Skvelá práca, naozaj si sa snažil.", "celebrating"),          # skvel-Á (the exact one we caught live)
    ("Skvelú odpoveď máš.", "celebrating"),                         # skvel-Ú (accusative)
    ("Úžasná odpoveď!", "celebrating"),                             # úžasn-Á
    ("Si vynikajúci žiak.", "celebrating"),                         # vynikajúc-I
    ("Dokonalá odpoveď.", "celebrating"),                           # dokonal-Á
    ("Gratulujem, máš pravdu.", "celebrating"),
    ("Si šikovný.", "celebrating"),
    ("Geniálne!", "celebrating"),
    # PROUD — non-base Slovak forms ─────────────────────────────────────────
    ("Som hrdá na teba.", "proud"),                                  # hrd-Á (feminine)
    ("Zlepšila si sa za posledný týždeň.", "proud"),                 # zlepši-LA
    ("Vidím pokrok v tvojej práci.", "proud"),
    ("Rastieš, krok za krokom.", "proud"),
    ("To si zvládla skvele.", "celebrating"),                        # both apply; CELEBRATING wins by design
    ("Napreduješ pekne.", "proud"),
    # CURIOUS — was missing inflected forms ─────────────────────────────────
    ("Zaujímavá myšlienka.", "curious"),                             # zaujímav-Á
    ("Porozprávaj viac o tom.", "curious"),
    # THINKING_DEEP — precedence: "X otázka" wins over CELEBRATING stems ────
    ("Dobrá otázka.", "thinking_deep"),
    ("To je výborná otázka.", "thinking_deep"),                      # vs CELEBRATING's výborn\w*
    ("Skvelá otázka, premýšľam.", "thinking_deep"),                  # vs CELEBRATING's skvel\w*
    ("Zložitá otázka, premýšľam.", "thinking_deep"),
    ("Musím sa nad tým zamyslieť.", "thinking_deep"),
    ("Hmm, to si vyžaduje viac premýšľania.", "thinking_deep"),
    # PATIENT — precedence: "skúsme to znova" must NOT land in CORRECTING ───
    ("Skúsme to znova.", "patient"),                                 # was eaten by CORRECTING's skús\w*
    ("Pokojne, krok za krokom.", "patient"),
    ("Chápem, ako sa cítiš.", "patient"),
    ("Rozumiem ti.", "patient"),
    # SURPRISE — strong-signal interjections (when both surprise+curious cues
    # are present, e.g. "Ohó, naozaj?", CURIOUS wins by rule order — by design).
    ("Wow, to som nečakal!", "surprise"),
    ("To ma prekvapilo.", "surprise"),
    ("To je prekvapivé.", "surprise"),
])
def test_inflected_classification(text, expected):
    result = _rule_based(text)
    assert result.emotion == expected, (
        f"{text!r} -> got {result.emotion!r}, expected {expected!r}"
    )


# ── 2) detect_emotion(...) routes through the regex backend by default ──────
def test_detect_emotion_defaults_to_regex_with_inflection(monkeypatch):
    monkeypatch.delenv("EMOTION_BACKEND", raising=False)
    r = detect_emotion("Výborná práca!")
    assert r.emotion == "celebrating"
    assert 0.0 < r.intensity <= 1.0
