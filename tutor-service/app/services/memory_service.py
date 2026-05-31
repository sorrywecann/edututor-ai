"""
EduTutor.AI — Conversation Memory Service

In-memory rolling window per conversation_id.
Works without any database. Survives backend restart via optional JSON persistence.

Window: last MAX_TURNS turns (user + assistant pairs).
"""
import json
import logging
import os
import re
from collections import deque
from typing import Dict, List, Optional
from dataclasses import dataclass, field, asdict
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_TURNS = int(os.getenv("MEMORY_MAX_TURNS", "20"))
                        # 20 user+assistant pairs = 40 messages.
                        # Env-overridable via MEMORY_MAX_TURNS.
PERSIST_PATH = Path(os.getenv("MEMORY_PERSIST_PATH", "./data/memory"))

_SAFE_ID = re.compile(r'^[a-zA-Z0-9_\-]{1,128}$')

def _safe_id(conversation_id: str) -> str:
    """Validate conversation_id contains only safe characters.

    Raises ValueError if the id contains path traversal characters.
    UUID format: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' — always passes.
    """
    if not _SAFE_ID.match(conversation_id):
        raise ValueError(f"Unsafe conversation_id: {conversation_id!r}")
    return conversation_id


@dataclass
class MemoryMessage:
    role: str    # "user" | "assistant"
    content: str


# conversation_id → deque of MemoryMessage
_store: Dict[str, deque] = {}


def _load_from_disk(conversation_id: str) -> Optional[List[dict]]:
    path = PERSIST_PATH / f"{_safe_id(conversation_id)}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(
            f"Memory persist file corrupt or unreadable, ignoring: {path} ({e})"
        )
        return None


def _save_to_disk(conversation_id: str, messages: deque) -> None:
    try:
        PERSIST_PATH.mkdir(parents=True, exist_ok=True)
        path = PERSIST_PATH / f"{_safe_id(conversation_id)}.json"
        path.write_text(json.dumps([asdict(m) for m in messages]))
    except Exception as e:
        logger.debug(f"Memory persist failed (non-critical): {e}")


def get_history(conversation_id: str) -> List[dict]:
    """Return conversation history as list of {role, content} dicts for LLM."""
    conversation_id = _safe_id(conversation_id)
    if conversation_id not in _store:
        # Try loading from disk on first access
        saved = _load_from_disk(conversation_id)
        if saved:
            _store[conversation_id] = deque(
                [MemoryMessage(**m) for m in saved],
                maxlen=MAX_TURNS * 2,
            )
        else:
            _store[conversation_id] = deque(maxlen=MAX_TURNS * 2)

    return [{"role": m.role, "content": m.content} for m in _store[conversation_id]]


def append_turn(conversation_id: str, user_text: str, assistant_text: str) -> None:
    """Record one user+assistant exchange."""
    conversation_id = _safe_id(conversation_id)
    if conversation_id not in _store:
        _store[conversation_id] = deque(maxlen=MAX_TURNS * 2)

    buf = _store[conversation_id]
    buf.append(MemoryMessage(role="user", content=user_text))
    buf.append(MemoryMessage(role="assistant", content=assistant_text))
    _save_to_disk(conversation_id, buf)


def clear(conversation_id: str) -> None:
    _store.pop(conversation_id, None)
    try:
        path = PERSIST_PATH / f"{_safe_id(conversation_id)}.json"
        path.unlink(missing_ok=True)
    except OSError as e:
        logger.warning(f"Failed to delete memory persist file {path}: {e}")
