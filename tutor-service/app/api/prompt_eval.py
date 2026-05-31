"""Prompt observability + eval endpoints — Layer 1 + Layer 2 + Layer 3 of the audit harness.

`/api/v1/chat/preview-prompt`
    Returns the fully-assembled system prompt the LLM would receive for a
    given message + mode, WITHOUT calling the LLM. Each prepended block is
    returned separately so the frontend can render them colour-coded.

`/api/v1/chat/eval`
    Runs a real chat turn with INLINE personality preferences instead of the
    user's saved file. Used by the side-by-side scenario harness to compare
    multiple personality configs against the same input without mutating the
    user's actual saved prefs.

`/api/v1/chat/rag-eval`
    Runs the SAME message twice — once with RAG retrieval from a knowledge
    base, once without — and returns both responses side by side, including
    the retrieved chunks. Used to verify whether attached documents actually
    influence the answer (the most common invisible-misbehaviour spot).

None of these endpoints persist state. All reuse the exact prompt-assembly
logic that production chat uses, via small refactored helpers.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import llm_service_dep
from app.services.llm_service import LLMService, ChatMessage
from app.services.personality_prompt import build_personality_block, build_personality_block_for_user
from app.services import user_profile_service
from app.services.rag_service import get_rag_service
from app.config.rag_config import rag_config
from app.config.learning_modes import get_mode, get_system_prompt, get_default_mode

logger = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────


class PreviewPromptRequest(BaseModel):
    message: str = Field(default="", description="Optional user message; affects nothing in the prompt today but reserved for future per-message dynamic blocks")
    mode: Optional[str] = Field(default=None, description="Mode id (e.g. 'deeptutor', 'sk'); falls back to default")
    override_prefs: Optional[dict] = Field(default=None, description="If set, use these inline prefs instead of reading the user's saved file; same shape as POST /user/preferences body")


class PromptBlock(BaseModel):
    label: str
    body: str
    bytes: int


class PreviewPromptResponse(BaseModel):
    mode_id: str
    mode_label: str
    tutor_name: str
    blocks: list[PromptBlock]
    assembled: str
    total_chars: int


class EvalRequest(BaseModel):
    message: str
    mode: Optional[str] = None
    override_prefs: Optional[dict] = None
    max_tokens: int = Field(default=140, ge=20, le=600)


class EvalResponse(BaseModel):
    response: str
    provider: str
    latency_ms: int
    assembled_prompt: str
    blocks: list[PromptBlock]


# ─────────────────────────────────────────────────────────────────────────────
# Shared assembly helper — single source of truth for prompt structure
# ─────────────────────────────────────────────────────────────────────────────


async def _assemble_prompt(
    mode_id: Optional[str],
    user_id: Optional[str],
    override_prefs: Optional[dict],
    db: AsyncSession,
) -> tuple[Any, list[PromptBlock], str]:
    """Build the system prompt as labeled segments + the concatenated string.

    Mirrors `chat.py:_apply_profile_injection` semantics:
        personality (all modes) → memory profile (memory modes only) → mode
    RAG block is omitted — preview/eval don't run retrieval; if a caller
    wants to test RAG influence they can pass docs through real /chat.
    """
    mode = get_mode(mode_id) if mode_id else None
    if mode is None:
        mode = get_default_mode()

    # Build each block's body separately. The mode's tutor_name flows in
    # as the assistant-name fallback so per-mode personas (Aria/Alex/Lukáš)
    # surface correctly when the user hasn't set assistant_name explicitly.
    mode_tutor = getattr(mode, "tutor_name", None)
    if override_prefs is not None:
        personality = build_personality_block(override_prefs, default_assistant_name=mode_tutor)
    else:
        personality = build_personality_block_for_user(user_id, default_assistant_name=mode_tutor)
    if not personality and mode_tutor:
        personality = (
            "━━━ OSOBNOSŤ — APLIKUJ NA KAŽDÚ ODPOVEĎ ━━━\n"
            f"Tvoje meno je {mode_tutor}. Ak sa ťa študent opýta, "
            f"predstav sa stručne. Nesúper s touto identitou — patrí ti."
        )

    profile_body = ""
    if "memory" in mode.enabled_skills and user_id:
        try:
            profile = await user_profile_service.get_profile(user_id, db)
            profile_body = user_profile_service.format_profile_for_prompt(profile) or ""
        except Exception as exc:  # noqa: BLE001
            logger.warning("preview-prompt: profile load failed: %s", exc)
            profile_body = ""

    mode_body = get_system_prompt(mode.id)

    # Order: mode body FIRST, then memory profile, then personality LAST.
    # Personality is the most context-fresh thing the LLM reads before
    # generating — this is the recency-bias lever for small models that
    # otherwise let the long mode prompt overwhelm the per-user sliders.
    # The blocks list mirrors the assembly order so the inspector UI shows
    # exactly what the LLM reads in the order it reads it.
    blocks: list[PromptBlock] = [
        PromptBlock(label=f"1. mode prompt ({mode.id})", body=mode_body, bytes=len(mode_body)),
    ]
    parts: list[str] = [mode_body]
    if profile_body:
        blocks.append(PromptBlock(label="2. memory profile", body=profile_body, bytes=len(profile_body)))
        parts.append(profile_body)
    if personality:
        idx = len(blocks) + 1
        blocks.append(PromptBlock(label=f"{idx}. osobnosť (personality) — RECENCY", body=personality.rstrip(), bytes=len(personality)))
        parts.append(personality.rstrip())

    assembled = "\n\n".join(parts)
    return mode, blocks, assembled


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/chat/preview-prompt", response_model=PreviewPromptResponse)
async def preview_prompt(
    body: PreviewPromptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PreviewPromptResponse:
    user_id = getattr(request.state, "user_id", None)
    mode, blocks, assembled = await _assemble_prompt(
        body.mode, user_id, body.override_prefs, db,
    )
    return PreviewPromptResponse(
        mode_id=mode.id,
        mode_label=mode.label,
        tutor_name=mode.tutor_name,
        blocks=blocks,
        assembled=assembled,
        total_chars=len(assembled),
    )


@router.post("/chat/eval", response_model=EvalResponse)
async def chat_eval(
    body: EvalRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(llm_service_dep),
) -> EvalResponse:
    """Inline-prefs chat run for side-by-side scenario testing.

    Bypasses RAG, broadcast, persistence, voice — just system prompt + user
    message → LLM → text response. Inline override_prefs lets the harness
    compare multiple personality configs against the same scenario without
    mutating the user's saved file.
    """
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="message is required")
    user_id = getattr(request.state, "user_id", None)
    mode, blocks, assembled = await _assemble_prompt(
        body.mode, user_id, body.override_prefs, db,
    )

    import time
    start = time.perf_counter()
    messages = [
        ChatMessage(role="system", content=assembled),
        ChatMessage(role="user", content=body.message),
    ]
    response = await llm.generate(messages, max_tokens=body.max_tokens)
    latency_ms = int((time.perf_counter() - start) * 1000)

    return EvalResponse(
        response=response,
        provider=getattr(llm, "_provider", "unknown"),
        latency_ms=latency_ms,
        assembled_prompt=assembled,
        blocks=blocks,
    )


# ─────────────────────────────────────────────────────────────────────────────
# RAG eval — side-by-side with vs without retrieval
# ─────────────────────────────────────────────────────────────────────────────


def _format_chunks_for_prompt_local(chunks: list[Any]) -> str:
    """Mirror chat.py's _format_context_for_prompt without importing it.

    Kept inline so this eval module stays decoupled from the chat router's
    internal helpers. Same label/format the production chat uses so the
    LLM sees identical input shape.
    """
    sections = []
    for index, chunk in enumerate(chunks, start=1):
        label = f"[Zdroj {index}: {chunk.filename}"
        if getattr(chunk, "page", None) is not None:
            label += f", s.{chunk.page}"
        label += "]"
        sections.append(f"{label}\n{chunk.content}")
    return "\n\n".join(sections)


def _rag_context_label_local(ui_locale: str) -> str:
    if ui_locale == "en":
        return (
            "Below are excerpts from documents the student uploaded. "
            "Use them only if they directly help answer the question. "
            "Otherwise ignore them and answer conversationally as the tutor"
        )
    return (
        "Tu sú úryvky z dokumentov ktoré študent nahral. "
        "Použi ich len ak priamo pomáhajú s odpoveďou. "
        "Inak ich ignoruj a odpovedz prirodzene ako tutor"
    )


class RagChunk(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    page: Optional[int] = None
    chunk_index: int
    content: str
    score: float


class RagEvalRequest(BaseModel):
    message: str
    knowledge_base: str = Field(description="Name of the KB to retrieve from")
    mode: Optional[str] = None
    override_prefs: Optional[dict] = None
    top_k: int = Field(default=5, ge=1, le=20)
    similarity_threshold: float = Field(default=0.65, ge=0.0, le=1.0)
    max_tokens: int = Field(default=240, ge=20, le=600)


class RagSideRun(BaseModel):
    label: str
    response: str
    latency_ms: int
    prompt_chars: int


class RagEvalResponse(BaseModel):
    with_rag: RagSideRun
    without_rag: RagSideRun
    chunks_retrieved: int
    chunks: list[RagChunk]
    assembled_with_rag: str
    assembled_without_rag: str
    rag_blocks: list[PromptBlock]


@router.post("/chat/rag-eval", response_model=RagEvalResponse)
async def chat_rag_eval(
    body: RagEvalRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(llm_service_dep),
) -> RagEvalResponse:
    """Run the same message twice: once with KB retrieval, once without.

    Lets the user see, side-by-side, whether attached documents actually
    influence the answer or get ignored. The most common invisible
    misbehaviour spot — RAG either dominates the response (tone flips to
    research-assistant) or gets ignored entirely.
    """
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="message is required")
    if not body.knowledge_base.strip():
        raise HTTPException(status_code=400, detail="knowledge_base is required")

    user_id = getattr(request.state, "user_id", None)
    mode, blocks, base_assembled = await _assemble_prompt(
        body.mode, user_id, body.override_prefs, db,
    )

    # Retrieve chunks (real RAG path, same parameters as /chat)
    chunks: list[Any] = []
    try:
        rag = await get_rag_service()
        if rag.is_ready():
            chunks = await rag.search_with_metadata(
                query=body.message,
                knowledge_base=body.knowledge_base,
                top_k=body.top_k,
                similarity_threshold=body.similarity_threshold,
                document_ids=None,  # don't filter; user picked the KB explicitly
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("rag-eval: retrieval failed: %s", exc)

    # WITHOUT-RAG run uses base_assembled as-is.
    # WITH-RAG appends the context block in the same shape chat.py uses.
    rag_context = ""
    if chunks:
        rag_context = (
            "\n\n" + _rag_context_label_local(mode.ui_locale) + ":\n"
            + _format_chunks_for_prompt_local(chunks)
        )
    assembled_with_rag = base_assembled + rag_context

    rag_blocks: list[PromptBlock] = []
    if rag_context:
        rag_blocks.append(
            PromptBlock(
                label=f"RAG context ({len(chunks)} chunks)",
                body=rag_context.strip(),
                bytes=len(rag_context),
            )
        )

    async def _run(system_text: str) -> RagSideRun:
        t0 = time.perf_counter()
        messages = [
            ChatMessage(role="system", content=system_text),
            ChatMessage(role="user", content=body.message),
        ]
        response = await llm.generate(messages, max_tokens=body.max_tokens)
        return RagSideRun(
            label="placeholder",
            response=response,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            prompt_chars=len(system_text),
        )

    without_run = await _run(base_assembled)
    without_run.label = "WITHOUT RAG"
    with_run = await _run(assembled_with_rag)
    with_run.label = "WITH RAG"

    rag_chunks = [
        RagChunk(
            chunk_id=c.chunk_id,
            document_id=c.document_id,
            filename=c.filename,
            page=getattr(c, "page", None),
            chunk_index=c.chunk_index,
            content=c.content,
            score=round(c.score, 3),
        )
        for c in chunks
    ]

    return RagEvalResponse(
        with_rag=with_run,
        without_rag=without_run,
        chunks_retrieved=len(chunks),
        chunks=rag_chunks,
        assembled_with_rag=assembled_with_rag,
        assembled_without_rag=base_assembled,
        rag_blocks=rag_blocks,
    )
