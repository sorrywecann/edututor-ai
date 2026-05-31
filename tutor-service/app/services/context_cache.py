"""Redis-backed conversation context cache."""

import json
from typing import Any, List, Optional

CACHE_TTL_SECONDS = 86400  # 24 hours
MAX_HISTORY = 20


class ContextCache:
    """Caches the last N turns of a conversation in Redis.

    Key pattern: conv:{session_id}:history
    Value: JSON-encoded list of message dicts.
    """

    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    def _key(self, session_id: str) -> str:
        return f"conv:{session_id}:history"

    async def get(self, session_id: str) -> Optional[List[dict]]:
        """Return cached history or None on cache miss."""
        raw = await self._redis.get(self._key(session_id))
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None

    async def set(self, session_id: str, history: List[dict]) -> None:
        """Store history, keeping only the last MAX_HISTORY entries."""
        trimmed = history[-MAX_HISTORY:]
        await self._redis.set(
            self._key(session_id),
            json.dumps(trimmed),
            ex=CACHE_TTL_SECONDS,
        )

    async def append(self, session_id: str, message: dict) -> None:
        """Append a single message to cached history."""
        existing = await self.get(session_id) or []
        existing.append(message)
        await self.set(session_id, existing)

    async def delete(self, session_id: str) -> None:
        """Remove cached history on session end."""
        await self._redis.delete(self._key(session_id))
