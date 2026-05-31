# tutor-service/tests/test_emotion_detector.py
import pytest
from app.services.emotion_detector import detect_emotion


def test_celebrating_výborne():
    result = detect_emotion("Výborne! To je správna odpoveď.")
    assert result.emotion == 'celebrating'
    assert result.intensity >= 0.85


def test_correcting_nie():
    result = detect_emotion("Nie, to nie je správne. Skús znova.")
    assert result.emotion == 'correcting'
    assert result.intensity >= 0.6


def test_encouraging_dobre():
    result = detect_emotion("Dobre, si na správnej ceste.")
    assert result.emotion == 'encouraging_mild'
    assert result.intensity >= 0.5


def test_neutral_factual():
    result = detect_emotion("Objektovo orientované programovanie má tri základné piliere.")
    assert result.emotion == 'neutral'


def test_intensity_in_range():
    result = detect_emotion("Skvelé!")
    assert 0.0 <= result.intensity <= 1.0
