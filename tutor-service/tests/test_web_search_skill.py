"""Pin WebSearchSkill's public shape: name, description, two tools (search_web,
fetch_url) with JSON-schema parameters the LLM uses verbatim.

Two tools are required because the LLM needs both discovery (search_web for
snippet-level results) and depth (fetch_url for full-page context when a
snippet isn't enough). Handler contracts (what each tool returns) are pinned
in subsequent tests that exercise dispatch.

Historical context: Phase 7 ships the first real Skill subclass exercising
the Phase 6 tool-call loop. Before Phase 7 the loop was wired but no Skill
was registered, so the loop bypass-when-empty path was the only one
exercised in production. These tests pin the surface the loop now sees.
"""
import asyncio
import os
import time
from unittest.mock import patch

import pytest
from app.skills.base import Skill, ToolDef


def test_web_search_skill_metadata():
    """Skill name must match LearningMode.enabled_skills entries; description
    is shown to the LLM in the system addendum so it must explain when to call."""
    from app.skills.web_search.skill import WebSearchSkill

    skill = WebSearchSkill()
    assert isinstance(skill, Skill)
    assert skill.name == "web_search"
    assert skill.description, "description must be non-empty (LLM sees it)"


def test_web_search_skill_exposes_two_tools():
    """The skill MUST expose exactly two tools — search_web (DDG-backed query)
    and fetch_url (httpx + trafilatura page extraction). Both are required
    because search results alone are snippet-level; follow-up questions often
    need full-page context."""
    from app.skills.web_search.skill import WebSearchSkill

    tools = WebSearchSkill().tools()
    assert len(tools) == 2

    names = {t.name for t in tools}
    assert names == {"search_web", "fetch_url"}


def test_web_search_skill_search_tool_schema():
    """search_web requires a 'query' string; the LLM must emit this exact name.
    A mismatched name (e.g. 'q') triggers TypeError in the dispatch path,
    which the tool loop catches and feeds back as a recoverable error."""
    from app.skills.web_search.skill import WebSearchSkill

    tools = {t.name: t for t in WebSearchSkill().tools()}
    search = tools["search_web"]
    assert isinstance(search, ToolDef)
    assert "query" in search.parameters["properties"]
    assert search.parameters["properties"]["query"]["type"] == "string"
    assert "query" in search.parameters["required"]


def test_web_search_skill_fetch_tool_schema():
    """fetch_url requires a 'url' string; the LLM emits the URL it learned
    from a prior search_web call. Two-step (search → fetch) is the canonical
    flow the system prompt teaches the LLM."""
    from app.skills.web_search.skill import WebSearchSkill

    tools = {t.name: t for t in WebSearchSkill().tools()}
    fetch = tools["fetch_url"]
    assert isinstance(fetch, ToolDef)
    assert "url" in fetch.parameters["properties"]
    assert fetch.parameters["properties"]["url"]["type"] == "string"
    assert "url" in fetch.parameters["required"]


@pytest.mark.asyncio
async def test_search_handler_does_not_block_event_loop():
    """The handler MUST NOT block the event loop. DuckDuckGo 8.x is sync-only
    so the implementation wraps DDGS().text() in run_in_executor — without
    that wrapping, a slow backend would freeze the chat path for every
    client during the call.

    We prove non-blocking by running the handler against a deliberately slow
    sync backend alongside a concurrent counter coroutine. With proper
    executor wrapping the counter still ticks while the (200ms) sync call runs."""
    from app.skills.web_search.skill import WebSearchSkill

    def slow_sync_search(*_args, **_kwargs):
        time.sleep(0.2)
        return [{"title": "t", "href": "https://x", "body": "b"}]

    counter = [0]

    async def tick():
        for _ in range(20):
            counter[0] += 1
            await asyncio.sleep(0.01)

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._ddg_search", new=slow_sync_search):
            handler_task = asyncio.create_task(skill._handle_search(query="anything"))
            ticker_task = asyncio.create_task(tick())
            await asyncio.gather(handler_task, ticker_task)

    assert counter[0] >= 15, (
        f"counter only advanced {counter[0]} — handler blocked the event loop "
        f"during a 200ms sync backend call (run_in_executor wrapping missing?)"
    )


@pytest.mark.asyncio
async def test_search_caps_results_and_body_length():
    """Tool results inject into LLM context up to max_iterations=4 times in
    the tool loop. A single search returning 50 results × 2000 chars each
    would exhaust small context windows. Cap: 5 results × 200 chars body."""
    from app.skills.web_search.skill import WebSearchSkill

    huge_body = "x" * 5000
    fake_results = [
        {"title": f"t{i}", "href": f"https://x/{i}", "body": huge_body}
        for i in range(50)
    ]

    def fake_search(*_a, **_kw):
        return fake_results

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._ddg_search", new=fake_search):
            result = await skill._handle_search(query="anything")

    assert result.count("https://x/") <= 5, "more than 5 results made it into the output"
    for line in result.split("\n"):
        assert len(line) <= 400, f"line longer than 400 chars: {len(line)}"


@pytest.mark.asyncio
async def test_search_kill_switch_skips_network():
    """WEB_SEARCH_ENABLED=false short-circuits BEFORE touching the backend.
    Proven by patching the backend to raise — if the handler called it, the
    test fails with the patched exception. Kill switch matters because the
    Slovak voice-tutor Docker deploy cannot guarantee public-internet egress."""
    from app.skills.web_search.skill import WebSearchSkill

    def explode(*_a, **_kw):
        raise AssertionError("handler called backend despite kill switch")

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "false"}, clear=False):
        with patch("app.skills.web_search.skill._ddg_search", new=explode):
            result = await skill._handle_search(query="anything")

    assert "disabled" in result.lower(), (
        "handler must return a string containing 'disabled' when WEB_SEARCH_ENABLED is false"
    )


@pytest.mark.asyncio
async def test_search_recovers_from_backend_exception():
    """DDG rate-limit / network errors must be recoverable strings — handler
    returns a string the LLM can read and decide what to do (retry, give up,
    fallback to its own knowledge). Raising would crash the chat handler."""
    from app.skills.web_search.skill import WebSearchSkill

    def network_fail(*_a, **_kw):
        raise RuntimeError("DDG rate-limited")

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._ddg_search", new=network_fail):
            result = await skill._handle_search(query="anything")

    assert "unavailable" in result.lower() or "error" in result.lower()
    assert "RuntimeError" in result or "rate-limited" in result.lower()


@pytest.mark.asyncio
async def test_fetch_handler_does_not_block_event_loop():
    """fetch_url uses httpx + trafilatura. httpx async client makes the network
    call non-blocking; trafilatura.extract is sync and could block on huge HTML
    documents — implementation MUST wrap it in run_in_executor or cap input
    size before extraction. Test verifies non-blocking under simulated slow
    backend by ensuring a concurrent counter still ticks."""
    from app.skills.web_search.skill import WebSearchSkill

    async def slow_async_fetch(*_args, **_kwargs):
        await asyncio.sleep(0.2)
        return "<html><body><article>page body</article></body></html>"

    counter = [0]

    async def tick():
        for _ in range(20):
            counter[0] += 1
            await asyncio.sleep(0.01)

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._http_get_text", new=slow_async_fetch):
            handler_task = asyncio.create_task(skill._handle_fetch(url="https://x"))
            ticker_task = asyncio.create_task(tick())
            await asyncio.gather(handler_task, ticker_task)

    assert counter[0] >= 15, (
        f"counter only advanced {counter[0]} — fetch handler blocked the event loop"
    )


@pytest.mark.asyncio
async def test_fetch_caps_body_length():
    """fetch_url body MUST be capped at 500 chars to fit LLM context. Without
    the cap, a single fetch of a long Wikipedia article could exhaust the
    LLM's context window — and we may receive up to max_iterations=4 such
    fetches per chat turn."""
    from app.skills.web_search.skill import WebSearchSkill

    async def fake_fetch(*_a, **_kw):
        body = "x" * 5000
        return f"<html><body><article>{body}</article></body></html>"

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._http_get_text", new=fake_fetch):
            result = await skill._handle_fetch(url="https://x")

    assert len(result) <= 600, f"fetch result too long: {len(result)} chars (cap is 500 + ellipsis)"


@pytest.mark.asyncio
async def test_fetch_kill_switch_skips_network():
    """WEB_SEARCH_ENABLED=false also disables fetch_url — same gate as
    search_web. Patched backend raises if reached."""
    from app.skills.web_search.skill import WebSearchSkill

    async def explode(*_a, **_kw):
        raise AssertionError("fetched despite kill switch")

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "false"}, clear=False):
        with patch("app.skills.web_search.skill._http_get_text", new=explode):
            result = await skill._handle_fetch(url="https://x")

    assert "disabled" in result.lower()


@pytest.mark.asyncio
async def test_fetch_recovers_from_exception():
    """Network/parse errors during fetch must be recoverable strings. Common
    failure modes: connect refused, TLS errors, malformed HTML, 4xx/5xx."""
    from app.skills.web_search.skill import WebSearchSkill

    async def fail(*_a, **_kw):
        raise RuntimeError("connection refused")

    skill = WebSearchSkill()
    with patch.dict(os.environ, {"WEB_SEARCH_ENABLED": "true"}, clear=False):
        with patch("app.skills.web_search.skill._http_get_text", new=fail):
            result = await skill._handle_fetch(url="https://x")

    assert "unavailable" in result.lower() or "error" in result.lower()
    assert "RuntimeError" in result or "connection" in result.lower()
