"""Podcast generation Task 2 — pin the LLM-driven script generation service.

generate_script() converts sources + notes into a spoken-word monologue for
podcast TTS.  Three format modes are supported: summary, deep_dive, qa —
each dispatched via the _FORMATS dict (non-negotiable dict-dispatch invariant).

Contracts pinned:
  - generate_script returns the LLM's stripped response for a non-empty sources
    list (happy path, summary format).
  - generate_script returns "" when the LLM raises, exception does not propagate
    (graceful degradation — mirrors test_summarize_returns_empty_when_llm_fails,
    Phase 8b Task 9).
  - generate_script returns "" immediately when both sources and notes are empty,
    and the LLM is NOT called (short-circuit guard).
  - generate_script routes to the correct system prompt per format: deep_dive →
    "Si scenárista hĺbkového", qa → "Si moderátor vzdelávacieho Q&A",
    summary → "Si scenárista vzdelávacieho podcastu".

Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("VECTOR_DB_BACKEND", "chroma")
os.environ.setdefault("STT_PROVIDER", "mock")


class _FakeLLM:
    def __init__(self, response: str = "Toto je podcast.") -> None:
        self._response = response
        self.call_count = 0
        self.last_messages: list = []

    async def generate(self, messages, max_tokens=None, temperature=None, **kwargs) -> str:
        self.call_count += 1
        self.last_messages = messages
        return self._response


class _FailingLLM:
    async def generate(self, messages, max_tokens=None, temperature=None, **kwargs) -> str:
        raise RuntimeError("API down")


@pytest.mark.asyncio
async def test_generate_script_summary_returns_nonempty():
    """generate_script passes sources to the LLM and returns its stripped response.

    Pins: non-empty sources list, format="summary" → LLM called once, the
    stripped response is returned verbatim.  Motivates the basic happy-path
    contract so regressions in the LLM call or return path are caught.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.podcast_script_service import generate_script

    mock_llm = _FakeLLM("Toto je podcast.")
    result = await generate_script(
        sources=["doc1 text"],
        notes=[],
        format="summary",
        llm=mock_llm,
    )

    assert result == "Toto je podcast."
    assert mock_llm.call_count == 1


@pytest.mark.asyncio
async def test_generate_script_returns_empty_on_llm_failure():
    """generate_script swallows LLM errors and returns "".

    Pins: RuntimeError from the LLM → "" returned, no exception propagated.
    Mirrors test_summarize_returns_empty_when_llm_fails (Phase 8b Task 9).
    Critical for the orchestrator contract: a broken LLM must not crash the
    podcast pipeline or surface an error to the user.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.podcast_script_service import generate_script

    result = await generate_script(
        sources=["some source text"],
        notes=["a note"],
        format="summary",
        llm=_FailingLLM(),
    )

    assert result == "", "generate_script must return '' on LLM failure."


@pytest.mark.asyncio
async def test_generate_script_returns_empty_on_empty_input():
    """generate_script short-circuits on empty sources AND notes.

    Pins: sources=[], notes=[] → "" returned immediately, LLM NOT called.
    Prevents spurious LLM API calls (token spend) for empty podcast sessions.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.podcast_script_service import generate_script

    mock_llm = _FakeLLM()
    result = await generate_script(
        sources=[],
        notes=[],
        format="summary",
        llm=mock_llm,
    )

    assert result == ""
    assert mock_llm.call_count == 0, (
        "LLM must not be called for empty input — short-circuit guard missing."
    )


@pytest.mark.asyncio
async def test_generate_script_uses_correct_prompt_per_format():
    """generate_script routes to the correct system prompt per format value.

    Pins the dict-dispatch format routing: deep_dive → starts with
    "Si scenárista hĺbkového", qa → starts with "Si moderátor vzdelávacieho Q&A",
    summary → starts with "Si scenárista vzdelávacieho podcastu".  Prevents
    copy-paste errors that wire all formats to the same prompt.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.podcast_script_service import generate_script

    sources = ["test source"]

    # deep_dive
    llm_dd = _FakeLLM("deep dive script")
    await generate_script(sources=sources, notes=[], format="deep_dive", llm=llm_dd)
    system_msgs_dd = [m for m in llm_dd.last_messages if m.role == "system"]
    assert system_msgs_dd, "No system message found for deep_dive format."
    assert system_msgs_dd[0].content.startswith("Si scenárista hĺbkového"), (
        f"deep_dive must use the hĺbkový prompt, got: {system_msgs_dd[0].content[:60]}"
    )

    # qa
    llm_qa = _FakeLLM("qa script")
    await generate_script(sources=sources, notes=[], format="qa", llm=llm_qa)
    system_msgs_qa = [m for m in llm_qa.last_messages if m.role == "system"]
    assert system_msgs_qa, "No system message found for qa format."
    assert system_msgs_qa[0].content.startswith("Si moderátor vzdelávacieho Q&A"), (
        f"qa must use the Q&A moderator prompt, got: {system_msgs_qa[0].content[:60]}"
    )

    # summary
    llm_s = _FakeLLM("summary script")
    await generate_script(sources=sources, notes=[], format="summary", llm=llm_s)
    system_msgs_s = [m for m in llm_s.last_messages if m.role == "system"]
    assert system_msgs_s, "No system message found for summary format."
    assert system_msgs_s[0].content.startswith("Si scenárista vzdelávacieho podcastu"), (
        f"summary must use the vzdelávací scenárista prompt, got: {system_msgs_s[0].content[:60]}"
    )
