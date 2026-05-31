"""Phase 8b Task 9 — pin the conversation summarizer + end_conversation wiring.

After a conversation ends (DELETE /conversations/{id}), a BackgroundTask
condenses the message history to 2-3 sentences via the LLM and stores the
result in per-user episodic memory (Phase 8b Task 8 surface).

Contracts pinned:
  - summarize_conversation returns the LLM's stripped response for a non-empty
    message list (happy path).
  - summarize_conversation returns "" immediately for an empty list with no LLM
    call (short-circuit).
  - summarize_conversation returns "" when the LLM raises, exception does not
    propagate (graceful degradation).
  - DELETE /conversations/{id} schedules a background task that ultimately
    calls episodic_memory_service.remember with the LLM-generated summary
    (end-to-end wiring).

Oracle review session: ses_1e1a840c2ffe7ETrA1fPkjZv6b
"""
from __future__ import annotations

import os
import uuid

import pytest

os.environ.setdefault("VECTOR_DB_BACKEND", "chroma")
os.environ.setdefault("STT_PROVIDER", "mock")


class _FakeLLM:
    def __init__(self, response: str = "Student learned about past tense.") -> None:
        self._response = response
        self.call_count = 0

    async def generate(self, messages, max_tokens=None, temperature=None, **kwargs) -> str:
        self.call_count += 1
        return self._response


class _FailingLLM:
    async def generate(self, messages, max_tokens=None, temperature=None, **kwargs) -> str:
        raise RuntimeError("API down")


@pytest.mark.asyncio
async def test_summarize_returns_string_for_real_conversation():
    """summarize_conversation passes messages to the LLM and returns its response.

    Pins: non-empty message list → LLM is called once, the stripped response
    string is returned verbatim.  Motivates the basic happy-path contract so
    regressions in the LLM call or the return path are caught immediately.

    Oracle review: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.services.conversation_summarizer import summarize_conversation

    fake_llm = _FakeLLM("Student learned X, struggled with Y.")
    messages = [
        {"role": "user", "content": "Help me with past tense verbs."},
        {"role": "assistant", "content": "Sure, let me explain."},
    ]
    result = await summarize_conversation(messages, fake_llm)

    assert result == "Student learned X, struggled with Y."
    assert fake_llm.call_count == 1


@pytest.mark.asyncio
async def test_summarize_returns_empty_for_empty_conversation():
    """summarize_conversation short-circuits on an empty message list.

    Pins: [] input → "" returned immediately, no LLM call made.  Prevents
    spurious LLM API calls (and token spend) for conversations with no turns.

    Oracle review: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.services.conversation_summarizer import summarize_conversation

    fake_llm = _FakeLLM()
    result = await summarize_conversation([], fake_llm)

    assert result == ""
    assert fake_llm.call_count == 0, (
        "LLM must not be called for empty conversations — short-circuit guard missing."
    )


@pytest.mark.asyncio
async def test_summarize_returns_empty_when_llm_fails():
    """summarize_conversation swallows LLM errors and returns "".

    Pins: RuntimeError from the LLM → "" returned, no exception propagated to
    the caller.  Critical for the background task contract: a broken LLM must
    not crash the worker or surface an error to the user.

    Oracle review: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from app.services.conversation_summarizer import summarize_conversation

    messages = [
        {"role": "user", "content": "What is a noun?"},
        {"role": "assistant", "content": "A noun names a person, place, or thing."},
    ]
    result = await summarize_conversation(messages, _FailingLLM())

    assert result == "", "summarize_conversation must return '' on LLM failure."


@pytest.mark.asyncio
async def test_end_conversation_triggers_summary_background_task(monkeypatch):
    """DELETE /conversations/{id} schedules a background task that calls
    episodic_memory_service.remember with the LLM-generated summary.

    Pins the complete wiring:
      endpoint → BackgroundTask → _run_summary_bg → summarize_conversation
      → episodic_memory_service.remember

    Uses dependency_overrides to inject a deterministic LLM and monkeypatches
    episodic_memory_service.remember so no Chroma I/O is needed.  Confirms
    that the remember call carries the mock-LLM's summary and the correct
    conversation_id.

    Oracle review: ses_1e1a840c2ffe7ETrA1fPkjZv6b
    """
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.deps import llm_service_dep
    from app.services.llm_service import LLMService
    import app.services.episodic_memory_service as ems

    FAKE_SUMMARY = "Student asked about past tense verbs in Slovak."

    remembered: list[dict] = []

    async def fake_remember(user_id: str, summary: str, *, conversation_id: str, metadata=None) -> None:
        remembered.append({
            "user_id": user_id,
            "summary": summary,
            "conversation_id": conversation_id,
        })

    monkeypatch.setattr(ems, "remember", fake_remember)

    class _FakeLLMService(LLMService):
        async def generate(self, messages, max_tokens=None, temperature=None, **kwargs) -> str:
            return FAKE_SUMMARY

    async def fake_llm_dep() -> LLMService:
        return _FakeLLMService()

    app.dependency_overrides[llm_service_dep] = fake_llm_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            create_resp = await c.post(
                "/api/v1/conversations",
                json={"user_id": "user-bg-summary-test"},
            )
            assert create_resp.status_code == 200, create_resp.text
            conv_id = create_resp.json()["conversation_id"]

            from app.database import AsyncSessionLocal
            from app.models.conversation import Message, MessageRole

            async with AsyncSessionLocal() as session:
                session.add(Message(
                    id=str(uuid.uuid4()),
                    conversation_id=conv_id,
                    role=MessageRole.USER,
                    content="Ako sa conjuguje sloveso 'byť' v prítomnom čase?",
                ))
                await session.commit()

            resp = await c.delete(f"/api/v1/conversations/{conv_id}")

        assert resp.status_code == 200
        assert resp.json() == {"conversation_id": conv_id, "status": "ended"}, (
            "Response shape changed — existing pin in test_conversations_api.py broken."
        )
        assert len(remembered) == 1, (
            f"Expected exactly 1 remember() call, got {len(remembered)}. "
            "Background task may not have fired or early-returned unexpectedly."
        )
        assert remembered[0]["summary"] == FAKE_SUMMARY
        assert remembered[0]["conversation_id"] == conv_id
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)
