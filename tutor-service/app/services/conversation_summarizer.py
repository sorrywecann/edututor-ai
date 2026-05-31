"""Post-conversation summarizer.

After a conversation ends, condenses it to 2-3 sentences focused on what the
student learned, struggled with, or asked.  Result is stored in per-user
episodic memory (Phase 8b Task 8) so the LLM can recall prior context in
future sessions.

Graceful-degradation contract: any failure returns "" so callers are never
disrupted by summary errors.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = (
    "Summarize this tutoring conversation in 2-3 sentences focusing on what "
    "the student learned, struggled with, or asked about. Be specific."
)


async def summarize_conversation(messages: list[dict], llm: "LLMService") -> str:
    """Condense a message list to 2-3 sentences via the LLM.

    Public API used by _run_summary_bg in conversations.py.  Returns the
    stripped LLM response on success, "" on empty input or any failure.
    Never raises — the background task must not crash the worker.
    """
    if not messages:
        return ""
    try:
        from app.services.llm_service import ChatMessage

        llm_messages = [ChatMessage(role="system", content=_SUMMARY_PROMPT)]
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            llm_messages.append(ChatMessage(role=role, content=content))

        result = await llm.generate(llm_messages, max_tokens=200, temperature=0.3)
        return result.strip()
    except Exception as e:
        logger.warning(f"summarize failed: {e}")
        return ""
