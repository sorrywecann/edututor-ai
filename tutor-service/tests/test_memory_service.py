"""
EduTutor.AI — Memory Service Tests

Full coverage of the in-memory rolling conversation window:
  - get_history: new conversation, disk load, empty deque
  - append_turn: stores messages, rolling window cap, disk write
  - clear: removes from memory and disk
  - rolling window: MAX_TURNS cap enforced (only last 20 messages kept)
  - disk persistence: write → process restart → reload from disk
  - isolation: separate conversation_ids don't bleed into each other
  - edge cases: long messages, unicode/Slovak diacritics, special chars
"""
import json
import os
import pytest
import tempfile
from pathlib import Path


# ---------------------------------------------------------------------------
# Fixture: isolated persist path per test
# ---------------------------------------------------------------------------

@pytest.fixture
def mem(tmp_path, monkeypatch):
    """Return a fresh memory_service module backed by a temp directory."""
    monkeypatch.setenv("MEMORY_PERSIST_PATH", str(tmp_path))

    # Force re-import so PERSIST_PATH is picked up fresh
    import importlib
    import app.services.memory_service as m
    importlib.reload(m)
    m._store.clear()  # clean in-memory state

    return m


# ---------------------------------------------------------------------------
# get_history — brand new conversation
# ---------------------------------------------------------------------------

def test_get_history_new_conversation_returns_empty(mem):
    result = mem.get_history("conv-new-001")
    assert result == []


def test_get_history_initialises_deque(mem):
    mem.get_history("conv-init-001")
    assert "conv-init-001" in mem._store
    assert len(mem._store["conv-init-001"]) == 0


def test_get_history_returns_list_of_dicts(mem):
    mem.append_turn("conv-003", "Čo je kvantová mechanika?", "Kvantová mechanika je...")
    history = mem.get_history("conv-003")
    assert isinstance(history, list)
    for msg in history:
        assert "role" in msg
        assert "content" in msg


# ---------------------------------------------------------------------------
# append_turn — basic storage
# ---------------------------------------------------------------------------

def test_append_turn_stores_user_and_assistant(mem):
    mem.append_turn("conv-a", "Ahoj", "Ahoj, čím môžem pomôcť?")
    history = mem.get_history("conv-a")
    assert len(history) == 2
    assert history[0] == {"role": "user", "content": "Ahoj"}
    assert history[1] == {"role": "assistant", "content": "Ahoj, čím môžem pomôcť?"}


def test_append_multiple_turns(mem):
    conv = "conv-multi"
    mem.append_turn(conv, "Otázka 1", "Odpoveď 1")
    mem.append_turn(conv, "Otázka 2", "Odpoveď 2")
    mem.append_turn(conv, "Otázka 3", "Odpoveď 3")
    history = mem.get_history(conv)
    assert len(history) == 6
    assert history[4]["content"] == "Otázka 3"
    assert history[5]["content"] == "Odpoveď 3"


def test_turn_order_is_preserved(mem):
    conv = "conv-order"
    for i in range(5):
        mem.append_turn(conv, f"q{i}", f"a{i}")
    history = mem.get_history(conv)
    for i in range(5):
        assert history[i * 2]["content"] == f"q{i}"
        assert history[i * 2 + 1]["content"] == f"a{i}"


# ---------------------------------------------------------------------------
# Rolling window — MAX_TURNS cap
# ---------------------------------------------------------------------------

def test_rolling_window_caps_at_max_turns(mem):
    """After MAX_TURNS*2 messages the deque drops oldest."""
    conv = "conv-rolling"
    max_turns = mem.MAX_TURNS  # 10

    # Add more turns than the window allows
    for i in range(max_turns + 5):
        mem.append_turn(conv, f"q{i}", f"a{i}")

    history = mem.get_history(conv)
    # Should be capped at MAX_TURNS * 2 = 20 messages
    assert len(history) == max_turns * 2


def test_rolling_window_keeps_most_recent(mem):
    """Oldest messages are dropped, newest are kept."""
    conv = "conv-recency"
    max_turns = mem.MAX_TURNS  # 10

    for i in range(max_turns + 3):
        mem.append_turn(conv, f"q{i}", f"a{i}")

    history = mem.get_history(conv)
    # Most recent: q(max_turns+2) should be the last user message
    last_user = [m for m in history if m["role"] == "user"][-1]
    assert last_user["content"] == f"q{max_turns + 2}"

    # Oldest: q0 should be gone
    all_user = [m["content"] for m in history if m["role"] == "user"]
    assert "q0" not in all_user


# ---------------------------------------------------------------------------
# Disk persistence
# ---------------------------------------------------------------------------

def test_append_turn_writes_to_disk(mem, tmp_path):
    conv = "conv-disk-001"
    mem.append_turn(conv, "Persist me", "I will persist")

    path = tmp_path / f"{conv}.json"
    assert path.exists(), "Expected JSON file on disk"

    data = json.loads(path.read_text())
    assert len(data) == 2
    assert data[0]["role"] == "user"
    assert data[0]["content"] == "Persist me"


def test_get_history_loads_from_disk_on_first_access(mem, tmp_path):
    """Simulate a service restart: write JSON manually, reload module, then get_history."""
    conv = "conv-reload-001"
    messages = [
        {"role": "user", "content": "Čo je fotosyntéza?"},
        {"role": "assistant", "content": "Fotosyntéza je proces, pri ktorom rastliny..."},
    ]
    path = tmp_path / f"{conv}.json"
    path.write_text(json.dumps(messages))

    # Clear in-memory so it must load from disk
    mem._store.pop(conv, None)

    history = mem.get_history(conv)
    assert len(history) == 2
    assert history[0]["content"] == "Čo je fotosyntéza?"
    assert history[1]["role"] == "assistant"


def test_get_history_graceful_on_corrupt_json(mem, tmp_path):
    """Corrupt JSON on disk must not crash — returns empty history."""
    conv = "conv-corrupt"
    path = tmp_path / f"{conv}.json"
    path.write_text("{ this is not valid json !!!")

    # Should not raise
    history = mem.get_history(conv)
    assert history == []


# ---------------------------------------------------------------------------
# clear
# ---------------------------------------------------------------------------

def test_clear_removes_from_memory(mem):
    conv = "conv-clear-001"
    mem.append_turn(conv, "x", "y")
    assert len(mem.get_history(conv)) == 2

    mem.clear(conv)
    assert conv not in mem._store


def test_clear_removes_disk_file(mem, tmp_path):
    conv = "conv-clear-disk"
    mem.append_turn(conv, "x", "y")
    assert (tmp_path / f"{conv}.json").exists()

    mem.clear(conv)
    assert not (tmp_path / f"{conv}.json").exists()


def test_clear_nonexistent_conv_does_not_raise(mem):
    """Clearing a conversation that never existed must be a no-op."""
    mem.clear("conv-never-existed-xyz")  # should not raise


def test_clear_then_get_history_returns_empty(mem):
    conv = "conv-clear-get"
    mem.append_turn(conv, "question", "answer")
    mem.clear(conv)
    assert mem.get_history(conv) == []


# ---------------------------------------------------------------------------
# Isolation — multiple conversations
# ---------------------------------------------------------------------------

def test_separate_conversations_are_isolated(mem):
    mem.append_turn("conv-A", "message A1", "reply A1")
    mem.append_turn("conv-B", "message B1", "reply B1")

    history_a = mem.get_history("conv-A")
    history_b = mem.get_history("conv-B")

    assert any("A1" in m["content"] for m in history_a)
    assert any("B1" in m["content"] for m in history_b)
    assert not any("A1" in m["content"] for m in history_b)
    assert not any("B1" in m["content"] for m in history_a)


def test_clearing_one_conv_does_not_affect_another(mem):
    mem.append_turn("conv-keep", "keep this", "kept")
    mem.append_turn("conv-del", "delete this", "deleted")

    mem.clear("conv-del")

    assert len(mem.get_history("conv-keep")) == 2
    assert mem.get_history("conv-del") == []


# ---------------------------------------------------------------------------
# Unicode and Slovak diacritics
# ---------------------------------------------------------------------------

def test_slovak_diacritics_round_trip(mem):
    text = "Čo je Veľká Morava? Aké bolo jej územie?"
    reply = "Veľká Morava bola prvý slovenský štát, zahŕňala Moravu, Slovensko a ďalšie územia."
    mem.append_turn("conv-sk", text, reply)
    history = mem.get_history("conv-sk")
    assert history[0]["content"] == text
    assert history[1]["content"] == reply


def test_long_message_stored_correctly(mem):
    """Messages up to several thousand characters must be stored verbatim."""
    long_msg = "Newtonove pohybové zákony sú základom klasickej mechaniky. " * 50
    mem.append_turn("conv-long", long_msg, "Áno, presne tak.")
    history = mem.get_history("conv-long")
    assert history[0]["content"] == long_msg


def test_empty_string_message_stored(mem):
    """Empty strings are valid — don't crash the service."""
    mem.append_turn("conv-empty", "", "")
    history = mem.get_history("conv-empty")
    assert len(history) == 2
    assert history[0]["content"] == ""


def test_special_chars_in_message(mem):
    msg = 'f(x) = ax² + bx + c; kde a≠0, "diskriminant" = b²-4ac\n\ttabbed'
    mem.append_turn("conv-special", msg, "Správne!")
    history = mem.get_history("conv-special")
    assert history[0]["content"] == msg
