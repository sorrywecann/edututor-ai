"""Tests for memory_service path traversal guard."""
import pytest
from app.services.memory_service import get_history, append_turn, clear, _safe_id


def test_safe_id_accepts_uuid():
    uid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    assert _safe_id(uid) == uid


def test_safe_id_accepts_alphanumeric():
    assert _safe_id("abc123") == "abc123"


def test_safe_id_accepts_dashes_and_underscores():
    assert _safe_id("conv-123_abc") == "conv-123_abc"


def test_safe_id_rejects_path_traversal():
    with pytest.raises(ValueError):
        _safe_id("../etc/passwd")


def test_safe_id_rejects_slash():
    with pytest.raises(ValueError):
        _safe_id("foo/bar")


def test_safe_id_rejects_null_byte():
    with pytest.raises(ValueError):
        _safe_id("foo\x00bar")


def test_safe_id_rejects_empty():
    with pytest.raises(ValueError):
        _safe_id("")


def test_get_history_rejects_path_traversal():
    """get_history should raise ValueError for unsafe conversation_id."""
    with pytest.raises(ValueError):
        get_history("../secret")


def test_append_turn_rejects_path_traversal():
    """append_turn should raise ValueError for unsafe conversation_id."""
    with pytest.raises(ValueError):
        append_turn("../../etc", "user msg", "assistant msg")
