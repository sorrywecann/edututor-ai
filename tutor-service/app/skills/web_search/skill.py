"""Web Search Skill — DuckDuckGo for discovery + httpx/trafilatura for extraction.

Exposes two tools to the LLM:
- search_web(query: str) -> formatted list of {title, snippet, url} (5 results max).
- fetch_url(url: str) -> cleaned page body (500 chars max).

Both handlers respect the WEB_SEARCH_ENABLED env var as a runtime kill
switch (default false — production deploys without egress network access
opt in explicitly). Result sizes are bounded so a single tool call cannot
exhaust an LLM's context window across the loop's max_iterations=4 budget.

Phase 8a: these handlers deliberately do NOT accept a ``user_id``
keyword. Web search is user-agnostic — the same query returns the same
results regardless of who asked. SkillRegistry.dispatch detects this
via inspect.signature and skips forwarding user_id to keep the call
free of unused boilerplate.

First skill shipped in the skill platform release.
"""
from __future__ import annotations

import asyncio
import logging
import os
from functools import partial
from typing import Any, Dict, List

from app.skills.base import Skill, ToolDef

logger = logging.getLogger(__name__)


def _ddg_search(query: str, max_results: int) -> List[Dict[str, Any]]:
    from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))


_MAX_SEARCH_RESULTS = 5
_MAX_SEARCH_BODY_CHARS = 200
_MAX_FETCH_BODY_CHARS = 500
_MAX_FETCH_HTML_BYTES = 2 * 1024 * 1024
_FETCH_TIMEOUT_S = 10.0
_DISABLED_MSG = "[web_search disabled in this deployment]"


async def _http_get_text(url: str, timeout: float = _FETCH_TIMEOUT_S) -> str:
    import httpx
    headers = {"User-Agent": "EduTutor.AI/0.1 (+https://edututor.ai)"}
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text[:_MAX_FETCH_HTML_BYTES]


def _is_enabled() -> bool:
    return os.getenv("WEB_SEARCH_ENABLED", "false").strip().lower() == "true"


class WebSearchSkill(Skill):
    name = "web_search"
    description = (
        "Search the public web and fetch full pages. Use search_web for discovery "
        "(news, recent events, facts that may have changed since training cutoff). "
        "Use fetch_url to read a specific page in detail when a snippet isn't enough."
    )

    async def _handle_search(self, query: str) -> str:
        if not _is_enabled():
            return _DISABLED_MSG

        loop = asyncio.get_running_loop()
        try:
            results = await loop.run_in_executor(
                None, partial(_ddg_search, query, _MAX_SEARCH_RESULTS)
            )
        except Exception as exc:  # noqa: BLE001 — network/rate-limit must be recoverable
            logger.warning("search_web failed for query=%r: %s", query, exc)
            return f"[search_web temporarily unavailable: {exc.__class__.__name__}: {exc}]"

        return _format_search_results(results)

    async def _handle_fetch(self, url: str) -> str:
        if not _is_enabled():
            return _DISABLED_MSG

        try:
            html = await _http_get_text(url)
        except Exception as exc:  # noqa: BLE001 — network/TLS/4xx must be recoverable
            logger.warning("fetch_url failed for url=%r: %s", url, exc)
            return f"[fetch_url temporarily unavailable: {exc.__class__.__name__}: {exc}]"

        loop = asyncio.get_running_loop()
        try:
            text = await loop.run_in_executor(None, _extract_main_text, html)
        except Exception as exc:  # noqa: BLE001 — extraction errors are non-fatal
            logger.warning("fetch_url extraction failed for url=%r: %s", url, exc)
            return f"[fetch_url extraction failed: {exc.__class__.__name__}]"

        text = (text or "").strip()
        if not text:
            return f"[fetch_url: no readable content extracted from {url}]"
        if len(text) > _MAX_FETCH_BODY_CHARS:
            text = text[:_MAX_FETCH_BODY_CHARS] + "…"
        return text

    def tools(self) -> List[ToolDef]:
        return [
            ToolDef(
                name="search_web",
                description=(
                    "Search the public web for current information. Returns up to 5 "
                    "results, each with title, snippet, and source URL. Use the "
                    "language the user is speaking."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to search for. Use the language the user is speaking.",
                        },
                    },
                    "required": ["query"],
                },
                handler=self._handle_search,
            ),
            ToolDef(
                name="fetch_url",
                description=(
                    "Fetch and clean the body of a single web page. Useful when a "
                    "search snippet didn't have enough detail. Body is capped at 500 chars."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "Full URL (https://...) to fetch.",
                        },
                    },
                    "required": ["url"],
                },
                handler=self._handle_fetch,
            ),
        ]


def _extract_main_text(html: str) -> str:
    import trafilatura
    return trafilatura.extract(html, include_comments=False, include_tables=False) or ""


def _format_search_results(results: List[Dict[str, Any]]) -> str:
    if not results:
        return "[search_web returned no results]"
    lines = []
    for entry in results[:_MAX_SEARCH_RESULTS]:
        title = str(entry.get("title", "")).strip()
        href = str(entry.get("href", "")).strip()
        body = str(entry.get("body", "")).strip()
        if len(body) > _MAX_SEARCH_BODY_CHARS:
            body = body[:_MAX_SEARCH_BODY_CHARS] + "…"
        lines.append(f"{title} — {href} — {body}")
    return "\n".join(lines)
