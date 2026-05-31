"""LLM-driven script generator for podcast generation.

Mirrors conversation_summarizer pattern (Phase 8b Task 9): never raises,
logs + returns '' on any failure. The orchestrator (Task 4) handles
downstream failure routing.

Three formats: summary (~300-500 words), deep_dive (~1500-2500), qa (~400-700).
All prompts are in Slovak (project's primary language).
"""
from __future__ import annotations
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

_SUMMARY_PROMPT = (
    "Si scenárista vzdelávacieho podcastu. Z poskytnutých zdrojov a poznámok "
    "vytvor súvislý monológ v slovenčine (300-500 slov): krátky úvod → 3-5 "
    "kľúčových bodov → záver. Hovor prirodzene, nie ako čítanie zoznamu. "
    "Žiadne markdown značky ani odrážky — len plynulý text na nahlas čítanie."
)
_DEEP_DIVE_PROMPT = (
    "Si scenárista hĺbkového vzdelávacieho podcastu. Z poskytnutých zdrojov "
    "vytvor monológ v slovenčine (1500-2500 slov): úvod do témy → detailné "
    "rozobratie 5-8 oblastí s príkladmi a kontextom → syntéza a záver. "
    "Žiadne markdown, len plynulý hovorený text."
)
_QA_PROMPT = (
    "Si moderátor vzdelávacieho Q&A podcastu. Zo zdrojov vytvor monológ "
    "v slovenčine (400-700 slov) v štýle 'pýtam sa a odpovedám': 5-7 otázok, "
    "každú nahlas položíš a hneď zodpovieš. Plynulý hovorený text, žiadne markdown."
)
_FORMATS = {"summary": _SUMMARY_PROMPT, "deep_dive": _DEEP_DIVE_PROMPT, "qa": _QA_PROMPT}


async def generate_script(
    *,
    sources: list[str],
    notes: list[str],
    format: str,
    llm: "LLMService",
    language: str = "sk",
) -> str:
    """Returns plain-text monologue. '' on empty input or any failure."""
    if not sources and not notes:
        return ""
    system_prompt = _FORMATS.get(format, _SUMMARY_PROMPT)
    try:
        from app.services.llm_service import ChatMessage
        body_parts = []
        if sources:
            body_parts.append("ZDROJE:\n" + "\n\n---\n\n".join(sources))
        if notes:
            body_parts.append("POZNÁMKY:\n" + "\n\n---\n\n".join(notes))
        user_content = "\n\n".join(body_parts)
        msgs = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_content),
        ]
        result = await llm.generate(msgs, max_tokens=2500, temperature=0.4)
        return result.strip()
    except Exception as e:
        logger.warning(f"podcast script generation failed: {e}")
        return ""
