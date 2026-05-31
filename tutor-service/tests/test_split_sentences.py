"""Tests for _split_sentences helper in chat.py."""
import pytest
from app.api.chat import _split_sentences


def test_single_sentence_with_period():
    # "Krátky." is 7 chars — under the 10-char threshold, stays as remainder
    sentences, remainder = _split_sentences("Krátky.")
    assert sentences == []
    assert "Krátky." in remainder


def test_long_sentence_with_period():
    sentences, remainder = _split_sentences("Toto je dlhšia veta s bodkou.")
    assert len(sentences) == 1
    assert sentences[0].endswith(".")
    assert remainder == ""


def test_two_sentences():
    text = "Prvá veta je tu. Druhá veta je tu."
    sentences, remainder = _split_sentences(text)
    assert len(sentences) == 2


def test_exclamation_mark_splits():
    sentences, remainder = _split_sentences("Výborne, to je správne! Pokračuj ďalej.")
    assert len(sentences) >= 1
    assert any("!" in s for s in sentences)


def test_question_mark_splits():
    sentences, remainder = _split_sentences("Čo si myslíš o tejto otázke? Hovor ďalej.")
    assert len(sentences) >= 1


def test_short_fragments_go_to_remainder():
    """Fragments under 10 chars stay as remainder."""
    sentences, remainder = _split_sentences("Nie.")
    assert sentences == []
    assert "Nie." in remainder


def test_empty_string():
    sentences, remainder = _split_sentences("")
    assert sentences == []
    assert remainder == ""


def test_no_sentence_end():
    text = "Toto je neukončená veta bez bodky"
    sentences, remainder = _split_sentences(text)
    assert sentences == []
    assert remainder == text


def test_remainder_is_what_follows_last_sentence():
    text = "Prvá veta. Toto pokračuje"
    sentences, remainder = _split_sentences(text)
    assert len(sentences) == 1
    assert remainder == "Toto pokračuje"
