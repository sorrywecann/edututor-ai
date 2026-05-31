import asyncio
import logging
import os
import time
import json
import base64
import re
from typing import Any, Awaitable, Callable, Optional, List, Dict, Tuple, Literal
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import llm_service_dep
from app.models.knowledge_base import Document as DocumentModel, KnowledgeBase as KnowledgeBaseModel
from app.schemas.knowledge_base import ContextChunk
from app.services.llm_service import LLMService, ChatMessage, get_llm_service
from app.services.rag_service import get_rag_service
from app.config.rag_config import rag_config
from app.config.learning_modes import get_mode, get_system_prompt, get_default_mode
from app.services.emotion_detector import detect_emotion
from app.services.viseme_timeline import build_timeline
from app.services.audio2lipsync_client import (
    get_lipsync_provider,
    generate_from_audio,
    arkit_to_frames,
)
from app.services import memory_service
from app.services import user_profile_service
from app.services import db_message_service
from app.services.personality_prompt import build_personality_block_for_user
from app.services.avatar_broadcaster import get_avatar_broadcaster
from app.skills import get_registry as get_skill_registry
from app.api.performance import record_turn

logger = logging.getLogger(__name__)
router = APIRouter()


async def _build_lipsync(
    text: str,
    audio_bytes: Optional[bytes] = None,
    word_boundaries: Optional[List[dict]] = None,
    emotion: Optional[str] = None,
) -> Tuple[List[dict], int, Optional[List[dict]]]:
    """Returns (viseme_frames, duration_ms, arkit_frames).

    Quality precedence (highest to lowest accuracy):
      1. Audio2Lipsync ARKit frames (~5ms, 52 blendshapes) when provider is
         ``audio2lipsync``/``hybrid`` AND audio_bytes available
      2. Edge TTS WordBoundary events (~5ms word starts, phoneme-within-word
         interpolated) when word_boundaries available
      3. Text-based estimation (±25ms, no audio anchor) — always available

    arkit_frames is None unless tier 1 fired.
    """
    provider = get_lipsync_provider()
    arkit_frames = None

    if provider in ("audio2lipsync", "hybrid") and audio_bytes:
        result = await generate_from_audio(audio_bytes)
        if result and "arkit_raw" in result:
            arkit_frames, duration_ms = arkit_to_frames(
                result["arkit_raw"], result.get("fps", 60)
            )
            # Merge upper-face expression presets (text2face-lite) into each
            # ARKit frame. Audio2lipsync covers jaw (14-17) + mouth (18-40);
            # expression presets cover eyes (0-13), brows (41-45), cheeks
            # (46-48), nose (49-50). Non-overlapping channel sets — safely
            # additive. Roland's LiveLink Pose Asset auto-maps the combined
            # dict via mh_arkit_mapping_pose.
            if emotion:
                from app.services.expression_presets import expression_for
                expr = expression_for(emotion)
                if expr:
                    for frame in arkit_frames:
                        frame["arkit"].update(expr)
            viseme_frames, _ = build_timeline(text, word_boundaries=word_boundaries)
            return viseme_frames, duration_ms, arkit_frames

    viseme_frames, duration_ms = build_timeline(text, word_boundaries=word_boundaries)
    return viseme_frames, duration_ms, None

# 9-emotion map: backend label → label sent on /ws/avatar.
# Must match the UE Blueprint's StringToEmotion Switch cases (internal labels
# below). Unmatched → Default branch → RANDOM node → wrong face. Pinned in
# lockstep with the Blueprint: change both sides together.
_UE5_EMOTION_MAP = {
    "neutral":          "neutral",
    "celebrating":      "celebrating",
    "proud":            "proud",
    "encouraging_mild": "encouraging_mild",
    "correcting":       "correcting",
    "patient":          "patient",
    "curious":          "curious",
    "thinking_deep":    "thinking_deep",
    "surprise":         "surprise",
}

# Idle viseme matches the UE5 contract (docs/ue5-avatar-contract.md §"Session States"):
# Idle / Listening / Thinking all use [{sil, 1.0}], not an empty array.
_AVATAR_IDLE_VISEMES: List[dict] = [{"viseme": "sil", "weight": 1.0}]


def _map_emotion_to_ue5(emotion: str) -> str:
    """Map backend emotion label to UE5 emotion state, logging unknown keys."""
    mapped = _UE5_EMOTION_MAP.get(emotion)
    if mapped is None:
        logger.warning("Unknown emotion '%s' from detector; falling back to 'neutral'", emotion)
        return "neutral"
    return mapped


async def _broadcast_avatar_state(
    *,
    emotion: str,
    intensity: float,
    is_speaking: bool,
    visemes: List[dict],
    viseme_timeline: List[dict],
    duration_ms: int,
    agent_state: Optional[str] = None,
    arkit_frames: Optional[List[dict]] = None,
    broadcast_avatar: bool = True,
) -> None:
    """Broadcast a single AvatarCommand to every connected UE5 client.

    Early-returns when no clients are attached. Wraps the broadcast in
    try/except so a broadcaster failure can never crash the chat pipeline.

    The optional ``agent_state`` field is the v2.1 protocol extension —
    UE5 clients that do not know about it ignore it (additive-safe JSON).
    Allowed values: 'idle' | 'thinking' | 'searching' | 'writing' |
    'listening'. When None, the field is omitted from the payload entirely
    so v2 clients see byte-identical traffic to before this feature.

    v0.7.0 (W2 — Avatar broadcast scope): the ``broadcast_avatar`` flag
    threads the per-request scope decision through every broadcast point.
    KB endpoints (ingest, podcast, summary, KB voice mode) call
    /chat/stream with broadcast_avatar=False so they can use the chat
    pipeline without making the UE5 avatar lipsync. Defaults True for
    backwards compatibility (main shell + tests).
    """
    if not broadcast_avatar:
        # v0.7.0 W2: caller opted out of avatar lipsync for this turn.
        # We still flip the broadcaster.set_speaking flag if available so
        # the heartbeat loop stays correct, but skip the actual broadcast.
        broadcaster_local = get_avatar_broadcaster()
        if hasattr(broadcaster_local, "set_speaking"):
            broadcaster_local.set_speaking(False)
        return
    broadcaster = get_avatar_broadcaster()
    if hasattr(broadcaster, "set_speaking"):
        broadcaster.set_speaking(bool(is_speaking))
    if broadcaster.connection_count == 0:
        return
    payload: Dict[str, Any] = {
        "emotion": _map_emotion_to_ue5(emotion),
        "intensity": intensity,
        "isSpeaking": is_speaking,
        "visemes": visemes,
        "blink": 0.0,
        "viseme_timeline": viseme_timeline,
        "total_duration_ms": duration_ms,
    }
    if agent_state is not None:
        payload["agentState"] = agent_state
    if arkit_frames is not None:
        payload["arkit_frames"] = arkit_frames
    try:
        await broadcaster.broadcast(payload)
    except Exception as exc:  # noqa: BLE001 — must not propagate into chat response
        logger.warning("Avatar broadcast failed (continuing): %s", exc)


def _speaking_head_visemes(frames: List[dict]) -> List[dict]:
    """First viseme frame for the immediate UE5 mouth shape, idle if empty."""
    if not frames:
        return list(_AVATAR_IDLE_VISEMES)
    head = frames[0]
    return [{"viseme": head["viseme"], "weight": head["weight"]}]


# Raw MP3 → ~1.33x base64 expansion. The first chunk uses a small cap (~3KB
# raw → ~4KB b64) so the avatar can start playing audio within ~50ms of the
# first byte arriving from the TTS provider; subsequent chunks coalesce up to
# 24KB to keep SSE event count manageable on long sentences. Both stay well
# under the 64KB practical SSE buffer limit.
_AUDIO_CHUNK_FIRST_MAX_RAW_BYTES = 3 * 1024
_AUDIO_CHUNK_MAX_RAW_BYTES = 24 * 1024

# Sentence_start UE5 broadcast is delayed by this much so the avatar's mouth
# opens AT the moment the user's audio actually starts (not before). The
# default of 180ms is calibrated to median observed MSE buffer-fill time:
# ~150ms for the first audio_chunk to land + ~30ms for MediaSource sourceopen
# + first appendBuffer. Tunable per-deployment via the env var for tighter
# LANs (lower) or remote/Wi-Fi clients (higher). Setting to 0 disables the
# delay and reverts to immediate broadcast (legacy behaviour, ghost-lips).
_UE5_BROADCAST_DELAY_MS: float = float(os.getenv("UE5_BROADCAST_DELAY_MS", "180"))

# ── UE5 audio-from-source mode (EDU_UE5_AUDIO) ──────────────────────────────
# When enabled, the spoken MP3 is ALSO streamed to UE5 over /ws/avatar using the
# speech_start / speech_chunk / speech_end protocol, so the avatar plays the
# audio itself and Wilbur captures audio+video as ONE synchronized WebRTC stream
# (zero browser-vs-UE5 lip-sync drift). The legacy SSE audio path stays on as a
# fallback. OFF by default — requires the UE5 Blueprint side (Runtime Audio
# Importer). Full contract: docs/plans/ue5-audio-protocol.md.
#
# When ON, speech_start carries the viseme timeline + emotion (so UE5 starts
# mouth + audio on the same frame), and the legacy viseme-only "broadcast when
# ready" path is skipped to avoid two competing animations.
# v0.7.5: HARD-DISABLE UE5 audio path. Per user instruction 2026-05-30:
# "UE audio enabled = true treba uplne completne vypnut to sa inak nepouziva
# vobec lebo to nieje napojene a nefugunuje" — the UE5-side audio playback
# Blueprint was never wired (Martin's responsibility per docs/plans/
# audio-from-ue5-brief.md), so any time EDU_UE5_AUDIO=1 leaked through (env
# misconfig, dev-mode override, future deploy script), backend started
# emitting speech_full / speech_start broadcasts that UE5 has no handler
# for. Worse, when PixelStreaming's WebRTC audio track is enabled, UE5's
# OWN audio (ambient SFX, mic-monitor, anything its AudioMixer produces)
# can be streamed back to the browser and overlap with the browser's MSE
# TTS playback → user-reported "2 audios start together at TTS".
#
# Hardcoding to False means the env var is IGNORED — no future deploy can
# accidentally re-enable it. The speech_full / speech_start / speech_chunk
# / speech_end emit blocks remain in place as dead branches (guarded by
# `if _UE5_AUDIO_ENABLED`), to be revived when Martin wires the BP.
# Verified: 4 archived backend.log files + current run show zero
# speech_full / speech_start emissions to UE5.
_UE5_AUDIO_ENABLED: bool = False
_ENV_UE5_AUDIO = os.getenv("EDU_UE5_AUDIO", "0").strip().lower() in ("1", "true", "yes", "on")
if _ENV_UE5_AUDIO:
    logger.warning(
        "EDU_UE5_AUDIO=%s requested but UE5 audio path is hard-disabled in v0.7.5+ "
        "(BP not wired). Browser is the only audio sink. Reactivate after Martin's "
        "UE5 Blueprint changes ship.",
        os.getenv("EDU_UE5_AUDIO"),
    )

# Delivery mode under EDU_UE5_AUDIO. Two options:
#   "chunked" (default) — speech_start + speech_chunk* + speech_end. Lowest TTFA
#                         (audio starts ~150 ms after TTS first byte); requires
#                         the RAI streaming `Append Audio Data From Encoded` path
#                         in Blueprint + chunk-seam-safe MP3 decode.
#   "full"              — one self-contained `speech_full` per sentence carrying
#                         the COMPLETE MP3 + audio-anchored viseme timeline +
#                         emotion + intensity + total_duration_ms + text. UE5
#                         imports via RAI `ImportAudioFromBuffer` and plays.
#                         Simpler Blueprint; trade-off is first-sentence TTFA =
#                         that sentence's TTS duration (no chunk streaming).
# Contract: docs/plans/ue5-audio-protocol.md.
_UE5_AUDIO_MODE: str = os.getenv("EDU_UE5_AUDIO_MODE", "chunked").strip().lower()
if _UE5_AUDIO_MODE not in ("chunked", "full"):
    _UE5_AUDIO_MODE = "chunked"


_TOOL_CALL_PATTERN = re.compile(
    r'<tool_call>\s*(\{.*?\})\s*</tool_call>',
    re.DOTALL,
)


_TOOL_NAME_TO_AGENT_STATE: Dict[str, str] = {
    "search_web": "searching",
    "fetch_url": "searching",
    "add_card": "writing",
    "review_card": "writing",
    "due_cards": "thinking",
    "recall_memory": "thinking",
    "update_profile": "writing",
}


def _agent_state_for_tool(tool_name: str) -> str:
    return _TOOL_NAME_TO_AGENT_STATE.get(tool_name, "thinking")


def _tool_use_system_addendum(tool_schemas: List[Dict[str, Any]]) -> str:
    """Build the prompt-based tool-use instructions appended to the system prompt.

    Phase 6c uses prompt-based tool emission (works with every provider —
    Ollama, OpenAI, Anthropic, vLLM, custom — without per-provider native
    function-calling integration). Phase 7+ may upgrade providers that
    support native tools (OpenAI, Anthropic) to use them directly for
    better reliability; the prompt format below remains the fallback.

    The model emits a tool call by writing JSON inside <tool_call>
    ... </tool_call> tags. The chat loop parses, dispatches, feeds the
    result back as a system message, and re-prompts.
    """
    if not tool_schemas:
        return ""
    lines = [
        "",
        "─── Available tools ───",
        "You have access to the following tools. To call one, respond with",
        "ONLY a single line of the form:",
        "<tool_call>{\"name\": \"tool_name\", \"arguments\": {\"arg\": \"value\"}}</tool_call>",
        "After receiving the tool result, continue the conversation normally.",
        "Use tools only when they materially help; otherwise answer directly.",
        "",
    ]
    for schema in tool_schemas:
        fn = schema.get("function", {})
        lines.append(f"• {fn.get('name', '?')}: {fn.get('description', '')}")
    lines.append("─── End tools ───")
    return "\n".join(lines)


async def _apply_profile_injection(
    system_prompt: str,
    mode: Any,
    user_id: Optional[str],
    db: AsyncSession,
) -> str:
    """Append the ⟨PERSONALITY⟩ block (for every mode) and prepend the
    ⟨PROFILE⟩ memory block (memory-enabled modes only).

    Order is now: profile? → mode prompt → personality (LAST). The recency
    lever — small LLMs put more attention on the most recent system content,
    so the per-user formality/humor/directness/verbosity instructions need
    to be the last thing read before generation. Without this they get
    drowned out by the much longer mode prompt.

    Guards on the memory block: (1) "memory" in mode.enabled_skills.
    (2) user_id non-empty. (3) format_profile_for_prompt returns non-empty.
    DB errors degrade gracefully — original prompt returned unchanged.

    Privacy invariant: user_id is never written into the returned string.
    """
    # ⟨PROFILE⟩ — memory modes only — prepended.
    if "memory" in mode.enabled_skills and user_id:
        try:
            profile = await user_profile_service.get_profile(user_id, db)
            profile_block = user_profile_service.format_profile_for_prompt(profile)
            if profile_block:
                system_prompt = profile_block + "\n\n" + system_prompt
        except Exception as exc:  # noqa: BLE001
            logger.warning("Profile injection failed (continuing without profile): %.8s…", exc)

    # ⟨PERSONALITY⟩ — every mode — APPENDED so it's the last thing the LLM reads.
    # The mode's tutor_name (Aria for assistant, Alex for en, Lukáš for SK,
    # etc.) is passed as the assistant-name fallback — so a user without an
    # explicit assistant_name still gets the right persona per mode.
    mode_tutor_name = getattr(mode, "tutor_name", None)
    personality_block = build_personality_block_for_user(
        user_id, default_assistant_name=mode_tutor_name,
    )
    if not personality_block and mode_tutor_name:
        # No personality file at all — emit a minimal identity-only block so
        # the LLM knows its mode-configured name.
        personality_block = (
            "━━━ OSOBNOSŤ — APLIKUJ NA KAŽDÚ ODPOVEĎ ━━━\n"
            f"Tvoje meno je {mode_tutor_name}. Ak sa ťa študent opýta, "
            f"predstav sa stručne. Nesúper s touto identitou — patrí ti."
        )
    if personality_block:
        system_prompt = system_prompt + "\n\n" + personality_block.rstrip()
    return system_prompt


async def _run_tool_loop(
    *,
    llm: LLMService,
    messages: List[ChatMessage],
    tool_schemas: List[Dict[str, Any]],
    max_iterations: int = 4,
    on_tool_start: Optional[Callable[[str], Awaitable[None]]] = None,
    on_tool_end: Optional[Callable[[str, str], Awaitable[None]]] = None,
    user_id: Optional[str] = None,
) -> str:
    """Run an LLM completion that may emit prompt-based tool calls.

    Bypass-when-empty: if ``tool_schemas`` is empty, this is a thin
    wrapper around ``llm.generate(messages)`` and produces byte-identical
    output to the direct call. The Slovak tutor flow today has no skills
    enabled, so this path is used unchanged.

    When tools are present, the loop:
      1. Calls llm.generate(messages with system addendum)
      2. Parses any <tool_call>...</tool_call> JSON
      3. Dispatches via SkillRegistry (forwards user_id to user-aware handlers)
      4. Feeds result back as a system message
      5. Repeats up to ``max_iterations`` times
      6. Returns the final text without tool-call tags

    The hook callbacks let chat.py broadcast agentState=searching during
    tool dispatch and agentState=thinking between iterations.

    Phase 8a: ``user_id`` (optional) is forwarded to the SkillRegistry's
    dispatch so per-user skills (spaced_repetition, future memory) get
    the caller's identity. None is acceptable — handlers fall back to
    their own defaults — but production callers always pass
    request.state.user_id from UserIdentityMiddleware.
    """
    if not tool_schemas:
        return await llm.generate(messages)

    registry = get_skill_registry()
    addendum = _tool_use_system_addendum(tool_schemas)
    working: List[ChatMessage] = list(messages)
    if working and working[0].role == "system":
        working[0] = ChatMessage(role="system", content=working[0].content + addendum)
    else:
        working.insert(0, ChatMessage(role="system", content=addendum.lstrip()))

    for _ in range(max_iterations):
        response = await llm.generate(working)
        match = _TOOL_CALL_PATTERN.search(response)
        if not match:
            return response

        try:
            call = json.loads(match.group(1))
            tool_name = str(call.get("name", ""))
            tool_args = call.get("arguments") or {}
            if not isinstance(tool_args, dict):
                raise ValueError(f"arguments must be a JSON object, got {type(tool_args).__name__}")
        except (json.JSONDecodeError, ValueError) as parse_err:
            working.append(ChatMessage(
                role="system",
                content=f"Tool call parse error: {parse_err}. Reply WITHOUT a tool call this time.",
            ))
            continue

        if on_tool_start is not None:
            try:
                await on_tool_start(tool_name)
            except Exception as cb_err:  # noqa: BLE001 — callback errors must not crash the loop
                logger.warning("on_tool_start callback failed: %s", cb_err)

        try:
            result = await registry.dispatch(tool_name, tool_args, user_id=user_id)
        except KeyError:
            result = f"[error: tool '{tool_name}' is not registered]"
        except Exception as exec_err:  # noqa: BLE001 — errors are recoverable for the LLM
            logger.warning("Tool '%s' raised: %s", tool_name, exec_err)
            result = f"[error: tool '{tool_name}' failed: {exec_err}]"

        if on_tool_end is not None:
            try:
                await on_tool_end(tool_name, result)
            except Exception as cb_err:  # noqa: BLE001
                logger.warning("on_tool_end callback failed: %s", cb_err)

        working.append(ChatMessage(role="assistant", content=response))
        working.append(ChatMessage(
            role="system",
            content=f"Tool '{tool_name}' returned:\n{result}\n\nContinue the conversation. "
                    f"You may call another tool or write the final answer.",
        ))

    logger.warning(
        "Tool loop hit max_iterations=%d; returning last assistant response",
        max_iterations,
    )
    return await llm.generate(working)


# LLMs (especially gemma3, qwen) emit markdown formatting like **bold** and
# *italic* and `code` and [text](url) — but the chat UI renders this raw and
# TTS reads each "*" as "hviezdička" (asterisk). Strip markdown to plain text
# before display + speech. Non-markdown text passes through unchanged.
_MARKDOWN_PATTERNS = [
    (re.compile(r'\*\*(.+?)\*\*', re.DOTALL), r'\1'),  # **bold**
    (re.compile(r'__(.+?)__',     re.DOTALL), r'\1'),  # __bold__
    (re.compile(r'(?<![A-Za-z\d])\*(?!\s)(.+?)(?<!\s)\*(?![A-Za-z\d])', re.DOTALL), r'\1'),  # *italic*
    (re.compile(r'(?<![A-Za-z\d])_(?!\s)(.+?)(?<!\s)_(?![A-Za-z\d])',   re.DOTALL), r'\1'),  # _italic_
    (re.compile(r'~~(.+?)~~', re.DOTALL),     r'\1'),  # ~~strike~~
    (re.compile(r'`([^`]+?)`'),               r'\1'),  # `inline code`
    (re.compile(r'\[(.+?)\]\([^)]+?\)'),      r'\1'),  # [text](url) → text
    (re.compile(r'^\s{0,3}#{1,6}\s+', re.MULTILINE), ''),  # headings: # ## ###
    (re.compile(r'^\s{0,3}>\s?', re.MULTILINE), ''),       # blockquote >
    (re.compile(r'^\s{0,3}[-*+]\s+', re.MULTILINE), ''),   # bullet list markers
]


def _strip_markdown(text: str) -> str:
    """Convert LLM-emitted markdown to plain text for TTS + display."""
    if not text or ('*' not in text and '_' not in text and '`' not in text
                    and '[' not in text and '#' not in text and '>' not in text
                    and '~' not in text):
        return text
    for pattern, repl in _MARKDOWN_PATTERNS:
        text = pattern.sub(repl, text)
    return text


# RAG gating — when a knowledge-base is selected, we still don't want to
# fire a vector search on every conversational utterance. Greetings,
# acknowledgments, and short small-talk shouldn't pull document quotes
# into the context. Heuristic gate: skip RAG when the message looks
# clearly conversational; otherwise let the search run.
_RAG_SKIP_MESSAGES = {
    # Greetings / sign-offs
    "ahoj", "ahojte", "čau", "čauko", "dobrý deň", "dobré ráno", "dobrý večer",
    "hi", "hello", "hey", "yo", "sup",
    "zbohom", "maj sa", "papa", "dovi", "bye", "goodbye", "see you",
    # Acknowledgments
    "ďakujem", "ďakujem ti", "vďaka", "vďaka pekne", "diky", "díky",
    "thanks", "thank you", "thx", "ty",
    # Affirmations / negations / fillers
    "áno", "ano", "hej", "jasné", "ok", "okej", "okay", "dobre", "fajn", "super",
    "nie", "no", "yes", "yep", "nope", "right", "exactly",
    "rozumiem", "chápem", "got it", "i see",
    # "How are you" small talk
    "ako sa máš", "ako sa máte", "ako sa máš?", "ako sa máte?",
    "how are you", "how are you?", "what's up",
}


def _should_use_rag(message: str) -> bool:
    """Decide whether to fire RAG retrieval for this user message.

    When a KB is selected, the prior behaviour was to fire a vector search
    on EVERY message — including "ďakujem" and "ahoj" — and inject the
    top-k chunks into the system prompt. That dragged document quotes
    into casual chat and broke the tutor's conversational tone.

    This gate skips RAG when the message is clearly conversational:
      * Exact-match against a known greeting/acknowledgment list
      * Very short (≤2 words) AND no question mark
      * Empty / whitespace only

    A 3-word message can already be a real question ("Vysvetli mi diftongy",
    "Použi aktívne dokumenty") so 3+ words always passes the gate — we
    rely on the explicit skip list for the few common cases like
    "ďakujem ti" or "ako sa máš" that are conversational but multi-word.
    """
    if not message:
        return False
    normalized = message.strip().lower().rstrip("?!.,;:")
    if not normalized:
        return False
    if normalized in _RAG_SKIP_MESSAGES:
        return False
    word_count = len(normalized.split())
    has_question_mark = "?" in message
    if word_count <= 2 and not has_question_mark:
        return False
    return True


def _kb_strict_directive(kb_name: str, ui_locale: str) -> str:
    """v0.7.0 (W4): hard-redirect strict mode for KB context.

    When the user explicitly selects a knowledge base AND ticks the strict
    toggle, the LLM is instructed to answer ONLY from the retrieved KB
    chunks. Off-topic queries get a polite refusal with a redirect. This is
    the difference between 'augment my world-knowledge with these chunks
    if relevant' and 'pretend you don't know anything that isn't in these
    documents.'
    """
    if (ui_locale or "sk").lower().startswith("sk"):
        return (
            f'━━━ STRIKTNÝ REŽIM DATABÁZY ━━━\n'
            f'Odpovedaj VÝLUČNE z poskytnutých dokumentov databázy "{kb_name}".\n'
            f'Ak otázka nesúvisí s obsahom databázy, povedz presne túto vetu:\n'
            f'  "O tom v databáze „{kb_name}" nemám informácie. Chceš, aby som odpovedal všeobecne?"\n'
            f'NIKDY nepoužívaj svoje všeobecné znalosti, ak ich dokument výslovne nepotvrdzuje.'
        )
    return (
        f'━━━ STRICT KB MODE ━━━\n'
        f'Answer EXCLUSIVELY from the provided documents of database "{kb_name}".\n'
        f'If the question is unrelated, say exactly:\n'
        f'  "I don\'t have information about that in the "{kb_name}" database. Would you like me to answer from general knowledge?"\n'
        f'NEVER use your general knowledge unless a document explicitly confirms it.'
    )


def _rag_context_label(ui_locale: str) -> str:
    """Lighter framing for retrieved document chunks.

    The previous label was an all-caps mandate ("USE THIS INFORMATION IF
    RELEVANT" / "POUŽI TIETO INFORMÁCIE AK SÚ RELEVANTNÉ") that the model
    treated as a higher-priority instruction than the tutor persona —
    answers flipped to a research-assistant tone the moment any KB chunk
    showed up. This phrasing keeps the persona dominant: documents are
    *available* if they help, not *mandatory* to cite.
    """
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


_SENT_END = re.compile(r'([.!?…])(\s|$)')

# First-phrase break: comma, colon, semicolon, dash, ellipsis. Used ONLY for
# the very first speakable chunk so the avatar starts talking ~500ms sooner.
# Subsequent chunks use full sentence boundaries so prosody stays natural.
_PHRASE_BREAK = re.compile(r'([,;:—–\-])(\s)')

_FIRST_PHRASE_MIN_CHARS = 18
_SENTENCE_MIN_CHARS = 10

_SK_CHARS = set("ľščťžýáíéúäôŕďňĽŠČŤŽÝÁÍÉÚÄÔŔĎŇ")


def _detect_sentence_language(text: str) -> str:
    sk_count = sum(1 for c in text if c in _SK_CHARS)
    return "sk" if sk_count >= 2 else "en"


def _split_sentences(
    buf: str,
    *,
    allow_first_phrase_break: bool = False,
) -> Tuple[List[str], str]:
    """Return (complete_sentences, remainder).

    When ``allow_first_phrase_break`` is True (used for the very first chunk
    of an LLM response), a comma/colon/semicolon/dash also counts as a
    speakable boundary. This shaves ~500ms off time-to-first-audio at the
    cost of slightly less natural prosody on the first phrase only — well
    worth it for conversational responsiveness.
    """
    sentences, last = [], 0
    if allow_first_phrase_break:
        m = _PHRASE_BREAK.search(buf)
        if m and m.end() >= _FIRST_PHRASE_MIN_CHARS:
            end_match = _SENT_END.search(buf, 0, m.end())
            if end_match is None:
                end = m.end()
                s = buf[last:end].strip()
                if len(s) >= _FIRST_PHRASE_MIN_CHARS:
                    sentences.append(s)
                    last = end
    for m in _SENT_END.finditer(buf, last):
        end = m.end()
        s = buf[last:end].strip()
        if len(s) >= _SENTENCE_MIN_CHARS:
            sentences.append(s)
            last = end
    return sentences, buf[last:]


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    conversation_history: Optional[List[Dict]] = None
    knowledge_base: Optional[str] = None
    language: Optional[str] = "sk"
    mode_id: Optional[str] = "sk"
    provider: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_k: Optional[int] = Field(default=None, ge=1, le=100)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=4096)
    rag_top_k: Optional[int] = Field(default=None, ge=1, le=20)
    similarity_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    context_modes: Optional[Dict[str, Literal["full", "insights", "off"]]] = None
    tts_provider: Optional[str] = "edge"
    tts_voice: Optional[str] = "sk-SK-LukasNeural"
    stream: Optional[bool] = False
    # v0.7.0 (W2): broadcast scope flag. The MAIN shell sets this True; KB
    # endpoints (ingest, podcast, summary, KB voice mode) set False so they
    # can use the chat-stream pipeline without making the UE5 avatar
    # lipsync as if the user is having a conversation. Per audit C1, the
    # broadcaster had zero scope gate and every code path that called
    # /chat/stream broadcasted to every UE5 client globally.
    broadcast_avatar: Optional[bool] = True
    # v0.7.0 (W4): when True AND knowledge_base is set, the LLM is
    # instructed to answer ONLY from the active KB and politely redirect
    # off-topic queries. Default False so existing soft-RAG behaviour is
    # unchanged for callers that don't opt in.
    kb_strict: Optional[bool] = False


class RAGSource(BaseModel):
    content: str
    source: str
    score: float


class ChatResponse(BaseModel):
    response: str
    provider: str
    conversation_id: Optional[str] = None
    rag_sources: Optional[List[RAGSource]] = None
    latency_ms: Optional[int] = None
    rag_latency_ms: Optional[int] = None
    llm_latency_ms: Optional[int] = None
    emotion_latency_ms: Optional[int] = None
    viseme_latency_ms: Optional[int] = None
    emotion: str = 'neutral'
    intensity: float = 0.4
    viseme_timeline: List[dict] = []
    audio_duration_ms: int = 2200
    provider_error: Optional[str] = None


def _classify_provider_error(exc: BaseException) -> str:
    """Map a chat-completion exception to a user-friendly Slovak message.

    Recognises openai SDK exceptions (AuthenticationError, RateLimitError,
    APIStatusError) as well as bare exceptions whose string carries either
    an "Error code: NNN" marker or a known provider phrase (e.g. DeepSeek's
    "Insufficient Balance"). Falls back to a generic message when nothing
    parseable is found.
    """
    text = str(exc) if exc else ""

    # 1. Try to pull a status_code attribute off the exception (openai SDK
    #    APIStatusError, AuthenticationError, RateLimitError all expose this).
    status: Optional[int] = None
    raw_status = getattr(exc, "status_code", None)
    if isinstance(raw_status, int):
        status = raw_status
    else:
        response = getattr(exc, "response", None)
        if response is not None:
            rs = getattr(response, "status_code", None)
            if isinstance(rs, int):
                status = rs

    # 2. Fall back to parsing "Error code: NNN" out of the message.
    if status is None:
        match = re.search(r"Error code[:\s]+(\d{3})", text, re.IGNORECASE)
        if match:
            try:
                status = int(match.group(1))
            except ValueError:
                status = None

    # 3. Class-name heuristics for openai SDK exceptions that didn't expose
    #    a numeric status (older versions, mocks in tests).
    cls_name = type(exc).__name__
    if status is None:
        if cls_name == "AuthenticationError":
            status = 401
        elif cls_name == "RateLimitError":
            status = 429

    # 4. Provider-phrase heuristics — DeepSeek surfaces "Insufficient Balance"
    #    on 402 even when the SDK swallows the status code.
    if status is None and "insufficient balance" in text.lower():
        status = 402

    if status == 401:
        return "Neplatný API kľúč. Skontroluj kľúč v Nastaveniach → LLM."
    if status == 402:
        return "Nedostatok kreditu na účte providera. Dobi účet a skús znova."
    if status == 429:
        return "Príliš veľa požiadaviek. Skús o chvíľu."
    if status is not None and 500 <= status < 600:
        return "Provider je dočasne nedostupný. Skús o chvíľu."
    if status is not None and 400 <= status < 500:
        # Other 4xx — surface the provider's own message when we have one.
        # Strip the "Error code: NNN -" prefix if present so we don't double up.
        cleaned = re.sub(r"^\s*Error code[:\s]+\d{3}\s*-?\s*", "", text).strip()
        if cleaned:
            return f"Provider: {cleaned}"

    return "Niečo sa pokazilo na strane providera. Pozri logy."


def _format_context_for_prompt(chunks: List[ContextChunk]) -> str:
    sections = []
    for index, chunk in enumerate(chunks, start=1):
        source_label = f"[Zdroj {index}: {chunk.filename}"
        if chunk.page is not None:
            source_label += f", s.{chunk.page}"
        source_label += "]"
        sections.append(f"{source_label}\n{chunk.content}")
    return "\n\n".join(sections)


async def _build_kb_catalog(
    db: AsyncSession,
    knowledge_base: str,
    active_doc_ids: Optional[List[str]],
    ui_locale: str,
) -> str:
    """Always-on document catalog for an active KB.

    The previous behaviour fired vector search on every message and injected
    nothing when the search returned no hits. That broke meta-questions like
    'o čom sú tieto dokumenty?' — the embedding distance from a meta-question
    to actual document content is large, so RAG filtered everything and the
    LLM had no idea what files even existed. It would then politely tell the
    user 'I don't see any documents'.

    This catalog is appended to the system prompt whenever a KB is active,
    independently of the per-message RAG search. It lists each active doc
    by filename + a short preview of its first chunk, so the LLM can always
    answer 'what's here?' truthfully without needing a similarity hit.

    Capped at ~12 docs to keep the prompt under control. Each preview is
    ~280 chars. Returns empty string when the KB has no active docs (caller
    should append-if-truthy).
    """
    kb_result = await db.execute(
        select(KnowledgeBaseModel).where(KnowledgeBaseModel.name == knowledge_base)
    )
    kb = kb_result.scalar_one_or_none()
    if not kb:
        return ""

    docs_result = await db.execute(
        select(DocumentModel)
        .where(DocumentModel.knowledge_base_id == kb.id)
    )
    docs = docs_result.scalars().all()
    # Drop non-completed docs — they won't have chunks in the vector store yet.
    # Comparing on the enum-backed `.value` avoids SQLEnum dialect quirks.
    docs = [d for d in docs if getattr(d.status, "value", str(d.status)) == "completed"]

    if active_doc_ids is not None:
        active_set = set(active_doc_ids)
        docs = [d for d in docs if d.id in active_set]

    if not docs:
        return ""

    rag = await get_rag_service()
    entries: List[str] = []
    for index, doc in enumerate(docs[:12], start=1):
        preview = ""
        try:
            chunks = await rag.get_document_chunks(doc.id, knowledge_base)
            if chunks:
                first = chunks[0].strip()
                preview = first[:280] + ("…" if len(first) > 280 else "")
        except Exception as e:
            logger.debug("KB catalog: failed to load chunks for %s: %s", doc.id, e)
        if preview:
            entries.append(f"{index}. {doc.filename}\n   „{preview}\"")
        else:
            entries.append(f"{index}. {doc.filename}")

    extra_count = max(0, len(docs) - 12)
    extra_note = ""
    if extra_count:
        if ui_locale == "en":
            extra_note = f"\n…and {extra_count} more documents."
        else:
            extra_note = f"\n…a ďalších {extra_count} dokumentov."

    if ui_locale == "en":
        header = (
            "━━━ ACTIVE DOCUMENTS (you CAN see these) ━━━\n"
            f"The student has {len(docs)} document(s) loaded in knowledge base "
            f"\"{knowledge_base}\". The filenames and previews below are part of "
            "your live context — treat them as if the student attached them in chat.\n\n"
            "HARD RULES:\n"
            "• NEVER say \"I don't have access\", \"please send me\", \"I can't see files\", "
            "or any variant. Those answers are FACTUALLY WRONG here.\n"
            "• If the student asks what the documents are about, start your answer "
            "with the filename and what you can infer from the preview.\n"
            "• If a preview is technical or fragmentary, say so honestly — but still "
            "acknowledge the file exists.\n\n"
            "Documents:"
        )
    else:
        header = (
            "━━━ AKTÍVNE DOKUMENTY (VIDÍŠ ICH) ━━━\n"
            f"Študent má v databáze „{knowledge_base}\" nahraté "
            f"{len(docs)} {'dokument' if len(docs) == 1 else 'dokumenty' if len(docs) < 5 else 'dokumentov'}. "
            "Názvy súborov aj ukážky nižšie sú súčasťou tvojho živého kontextu — "
            "ber ich tak, akoby ti ich študent priložil v chate.\n\n"
            "TVRDÉ PRAVIDLÁ:\n"
            "• NIKDY nepíš „nemám prístup k súborom\", „pošli mi ich\", „neviem ich "
            "prečítať\" ani podobne. Také odpovede sú TU SKRÁTKA NESPRÁVNE.\n"
            "• Keď sa študent spýta o čom dokumenty sú, ZAČNI odpoveď názvom súboru "
            "a tým, čo sa dá z ukážky usúdiť.\n"
            "• Ak je ukážka technická alebo útržkovitá, povedz to úprimne — ale stále "
            "potvrdíš, že súbor existuje a vidíš ho.\n\n"
            "Dokumenty:"
        )

    catalog = header + "\n\n" + "\n\n".join(entries) + extra_note
    logger.info(
        "KB catalog injected: kb=%r, docs=%d, chars=%d",
        knowledge_base, len(docs), len(catalog),
    )
    return catalog


async def _resolve_active_document_ids(
    db: AsyncSession,
    knowledge_base: str,
    context_modes: Optional[Dict[str, str]],
) -> Optional[List[str]]:
    kb_result = await db.execute(
        select(KnowledgeBaseModel).where(KnowledgeBaseModel.name == knowledge_base)
    )
    kb = kb_result.scalar_one_or_none()
    if not kb:
        return None

    docs_result = await db.execute(
        select(DocumentModel).where(DocumentModel.knowledge_base_id == kb.id)
    )
    docs = docs_result.scalars().all()

    active_doc_ids: List[str] = []
    for doc in docs:
        effective_mode = (context_modes or {}).get(doc.id, doc.context_mode)
        if effective_mode != "off":
            active_doc_ids.append(doc.id)
    return active_doc_ids


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(llm_service_dep),
):
    """Non-streaming chat endpoint.

    LLM service is injected via Depends() so tests can substitute fakes via
    ``app.dependency_overrides[llm_service_dep] = ...`` instead of
    monkeypatching module globals. RAG and TTS are still fetched lazily
    inside the handler because their init can fail and the handler must
    degrade gracefully (no RAG → continue without context; no TTS → text-only
    response). Eager Depends-injection would convert those graceful paths
    into 500s.
    """
    # v0.7.0 (W2): apply the per-request broadcast scope via ContextVar.
    # KB endpoints pass broadcast_avatar=False so the avatar doesn't lipsync
    # KB document generation. The flag is on a ContextVar so concurrent
    # request handlers each see their own value (no race).
    _scope_bc = get_avatar_broadcaster()
    _scope_token = _scope_bc.set_broadcast_enabled(bool(request.broadcast_avatar))

    start_time = time.time()

    mode = get_mode(request.mode_id or "sk") or get_default_mode()

    # Did the CALLER supply a conversation_id? Capture this before we
    # auto-generate one below — the history-source decision (server memory vs
    # client-supplied conversation_history) depends on the caller's intent, not
    # on the synthesized id, which would otherwise always look "supplied".
    client_supplied_conv_id = bool(request.conversation_id)

    # Auto-create a conversation_id when caller didn't supply one. Without
    # this, every API call from a client that doesn't manage IDs (curl, the
    # audit harness, external integrations) gets no within-session memory —
    # memory_service.get_history() needs a stable key to thread turns. The
    # generated ID is returned to the caller so they can pass it back on the
    # next turn. Frontend already manages IDs explicitly and is unaffected.
    if not request.conversation_id:
        import uuid as _uuid
        request = request.model_copy(update={"conversation_id": str(_uuid.uuid4())})

    if request.message == "__greeting__":
        request = request.model_copy(update={"message": mode.greeting_instruction})
    elif request.message == "__silence_check__":
        request = request.model_copy(update={"message": "__silence_check__"})

    try:
        if request.provider:
            llm.set_provider(request.provider)

        rag_sources: List[RAGSource] = []
        context_text = ""
        _rag_t0 = time.perf_counter()

        if request.knowledge_base and _should_use_rag(request.message):
            try:
                rag = await get_rag_service()
                if rag.is_ready():
                    active_doc_ids = await _resolve_active_document_ids(
                        db,
                        request.knowledge_base,
                        request.context_modes,
                    )
                    retrieved_chunks = await rag.search_with_metadata(
                        query=request.message,
                        knowledge_base=request.knowledge_base,
                        top_k=request.rag_top_k or rag_config.top_k_results,
                        similarity_threshold=request.similarity_threshold or rag_config.similarity_threshold,
                        document_ids=active_doc_ids,
                    )
                    if retrieved_chunks:
                        rag_sources = [
                            RAGSource(
                                content=chunk.content[:200] + "..." if len(chunk.content) > 200 else chunk.content,
                                source=chunk.filename,
                                score=round(chunk.score, 3),
                            )
                            for chunk in retrieved_chunks
                        ]
                        context_text = _format_context_for_prompt(retrieved_chunks)
                        logger.info(f"RAG found {len(retrieved_chunks)} relevant chunks")
            except Exception as e:
                logger.warning(f"RAG search failed (continuing without context): {e}")
        elif request.knowledge_base:
            logger.debug("RAG skipped (conversational message): %r", request.message[:60])

        _rag_ms = int((time.perf_counter() - _rag_t0) * 1000)

        kb_catalog = ""
        if request.knowledge_base:
            active_doc_ids_for_catalog = await _resolve_active_document_ids(
                db, request.knowledge_base, request.context_modes
            )
            kb_catalog = await _build_kb_catalog(
                db, request.knowledge_base, active_doc_ids_for_catalog, mode.ui_locale
            )

        # Catalog rides at the TOP so the LLM weighs it more heavily than the
        # persona's "I don't have access" priors.
        base_prompt = get_system_prompt(mode.id)
        system_prompt = (kb_catalog + "\n\n" + base_prompt) if kb_catalog else base_prompt
        system_prompt = await _apply_profile_injection(
            system_prompt, mode, getattr(http_request.state, "user_id", None), db
        )
        if context_text:
            # v0.7.0 (W4): strict mode injects a hard-redirect directive
            # before the RAG chunks instead of the soft "use if relevant"
            # framing. Defaults False — caller has to explicitly opt in.
            if getattr(request, "kb_strict", False) and request.knowledge_base:
                system_prompt += "\n\n" + _kb_strict_directive(request.knowledge_base, mode.ui_locale)
            system_prompt += f"\n\n{_rag_context_label(mode.ui_locale)}:\n{context_text}"

        messages = [ChatMessage(role="system", content=system_prompt)]

        is_greeting = request.message == mode.greeting_instruction

        # Greeting goes through the LLM with the full system prompt. We
        # used to short-circuit Ollama with a hardcoded "Ahoj! Som
        # EduTutor. Na čo sa chceš dnes opýtať?" line because the older
        # philosophical prompt confused small Ollama models — that crutch
        # is now removed (2026-05-16). The tutor's persona handles every
        # provider uniformly, so every first impression matches the prompt.

        if not is_greeting:
            # Priority: server-side memory (only when the CALLER supplied a
            # conversation_id) > client-supplied history. We must NOT branch on
            # the now-always-set request.conversation_id, or the synthesized id
            # would shadow legacy conversation_history every time.
            if client_supplied_conv_id:
                history = memory_service.get_history(request.conversation_id)
                # Ollama models get confused with long history — limit to last 6 messages
                if llm.provider == "ollama":
                    history = list(history)[-6:]
                for msg in history:
                    messages.append(ChatMessage(role=msg["role"], content=msg["content"]))
            elif request.conversation_history:
                # Legacy fallback: client sent its own history array
                history = request.conversation_history
                if llm.provider == "ollama":
                    history = history[-6:]
                for msg in history:
                    messages.append(ChatMessage(role=msg.get("role", "user"), content=msg.get("content", "")))

        is_first_turn_nonstream = not any(m.role == "assistant" for m in messages)
        grounded_message_nonstream = request.message
        if kb_catalog and is_first_turn_nonstream:
            grounded_message_nonstream = f"{kb_catalog}\n\n━━━\n\n{request.message}"
        messages.append(ChatMessage(role="user", content=grounded_message_nonstream))

        _llm_t0 = time.perf_counter()
        # Phase 6c integration: route through the tool-call loop so any tools
        # exposed by the active LearningMode's enabled_skills are dispatchable.
        # When enabled_skills is empty (every mode in production today), the
        # loop is a thin pass-through to llm.generate(messages) — byte-identical.
        tool_schemas = get_skill_registry().tools_for(mode.enabled_skills)
        if tool_schemas:
            async def _on_tool_start(tool_name: str) -> None:
                await _broadcast_avatar_state(
                    emotion="thinking_deep", intensity=0.5, is_speaking=False,
                    visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[],
                    duration_ms=0, agent_state=_agent_state_for_tool(tool_name),
                )

            async def _on_tool_end(_tool_name: str, _result: str) -> None:
                await _broadcast_avatar_state(
                    emotion="thinking_deep", intensity=0.4, is_speaking=False,
                    visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[],
                    duration_ms=0, agent_state="thinking",
                )

            response = await _run_tool_loop(
                llm=llm,
                messages=messages,
                tool_schemas=tool_schemas,
                on_tool_start=_on_tool_start,
                on_tool_end=_on_tool_end,
                user_id=getattr(http_request.state, "user_id", None),
            )
        else:
            response = await llm.generate(
                messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_k=request.top_k,
            )
        _llm_ms = int((time.perf_counter() - _llm_t0) * 1000)

        # ── Store turn in memory + SQLite ─────────────────────────────
        # Don't persist internal trigger messages — only real conversation turns
        is_internal = request.message in ("__greeting__", "__silence_check__")
        if request.conversation_id and not is_internal:
            memory_service.append_turn(
                request.conversation_id,
                user_text=request.message,
                assistant_text=response,
            )
            await db_message_service.save_turn(
                request.conversation_id,
                user_text=request.message,
                assistant_text=response,
            )

        _emo_t0 = time.perf_counter()
        emotion_result = detect_emotion(response)
        _emo_ms = int((time.perf_counter() - _emo_t0) * 1000)

        _vis_t0 = time.perf_counter()
        viseme_frames, audio_duration_ms = build_timeline(response)
        _vis_ms = int((time.perf_counter() - _vis_t0) * 1000)

        # UE5 self-times the idle transition from total_duration_ms in the payload.
        # We used to broadcast a follow-up isSpeaking=False here, but the two messages
        # arrived sub-millisecond apart and UE5 sometimes snapped straight to idle
        # before animating the speaking state. The heartbeat task picks up idle
        # state via broadcaster.is_speaking once we flip it back below.
        await _broadcast_avatar_state(
            emotion=emotion_result.emotion,
            intensity=emotion_result.intensity,
            is_speaking=True,
            visemes=_speaking_head_visemes(viseme_frames),
            viseme_timeline=viseme_frames,
            duration_ms=audio_duration_ms,
        )
        broadcaster_for_idle = get_avatar_broadcaster()
        if hasattr(broadcaster_for_idle, "set_speaking"):
            broadcaster_for_idle.set_speaking(False)

        latency_ms = int((time.time() - start_time) * 1000)

        record_turn(
            provider=llm.provider, total_ms=latency_ms,
            rag_ms=_rag_ms, llm_ms=_llm_ms, emotion_ms=_emo_ms, viseme_ms=_vis_ms,
            response_len=len(response), rag_chunks=len(rag_sources),
        )

        return ChatResponse(
            response=response,
            provider=llm.provider,
            conversation_id=request.conversation_id,
            rag_sources=rag_sources if rag_sources else None,
            latency_ms=latency_ms,
            rag_latency_ms=_rag_ms,
            llm_latency_ms=_llm_ms,
            emotion_latency_ms=_emo_ms,
            viseme_latency_ms=_vis_ms,
            emotion=emotion_result.emotion,
            intensity=emotion_result.intensity,
            viseme_timeline=viseme_frames,
            audio_duration_ms=audio_duration_ms,
        )

    except Exception as e:
        logger.error(f"Chat error: {e}")
        latency_ms = int((time.time() - start_time) * 1000)
        provider_error = _classify_provider_error(e)
        return ChatResponse(
            response="",
            provider="fallback",
            conversation_id=request.conversation_id,
            latency_ms=latency_ms,
            provider_error=provider_error,
        )
    finally:
        # v0.7.1: restore the prior broadcast scope. ContextVar.set() inside
        # an endpoint coroutine mutates the request's context and — because
        # FastAPI/Starlette do NOT wrap endpoints in Context.run() per-request
        # — that mutation can outlive the request and leak into subsequent
        # turns served on the same worker. Without this reset, a KB Hlas call
        # (broadcast_avatar=False) primed the worker so the NEXT main-shell
        # chat turn ran with the scope still gated off → asymmetric filter
        # in avatar_broadcaster dropped speech_start/speech_chunk but let
        # speech_end through → orphaned UE5 frames → lipsync drift + phantom
        # audio playback. Always pair set_broadcast_enabled with reset.
        try:
            _scope_bc.reset_broadcast_enabled(_scope_token)
        except Exception:
            pass


_SPOKE_SENTINEL = object()


def _resolve_tts_voice(
    text: str,
    request: "ChatRequest",
    mode: Any,
) -> Tuple[str, str]:
    provider = request.tts_provider
    voice = request.tts_voice
    if mode.native_language and mode.native_tts_voice:
        if _detect_sentence_language(text) == mode.native_language:
            provider = mode.native_tts_provider or provider
            voice = mode.native_tts_voice
    return provider, voice


async def _speak_sentence(
    *,
    sentence: str,
    sentence_idx: int,
    request: "ChatRequest",
    mode: Any,
    tts_svc: Any,
    is_disconnected: Callable[[], Awaitable[bool]],
    last_emotion_holder: Dict[str, Any],
) -> "AsyncGenerator[Any, None]":
    """Yield SSE lines for the streaming-TTS protocol of a single sentence.

    Emits three event types in order, then a sentinel so the caller can update
    its 'speaking' flags:

    1. ``sentence_start`` — text + emotion + text-based viseme timeline.
       The avatar starts emoting and moving the mouth at t≈0ms instead of
       waiting for full TTS synthesis (~800ms on Edge TTS).
    2. ``audio_chunk`` — base64 MP3 bytes as they arrive from the provider.
       Edge TTS streams ~50-100ms chunks; first chunk lands in ~150ms.
       Chunks are MP3 CBR so MediaSource ``appendBuffer`` is safe without
       re-framing. Frontends without MediaSource buffer chunks and play
       the concatenation on ``sentence_end``.
    3. ``sentence_end`` — final viseme/duration after the full audio is
       available, plus a backwards-compatible ``audio`` field so legacy
       clients that ignored ``audio_chunk`` events still receive playable
       audio.

    On TTS failure: degrades to text-only — emits ``sentence_end`` with
    empty audio and the text-based viseme timeline.

    The ``last_emotion_holder`` dict is mutated so the caller can keep its
    final-idle UE5 broadcast in sync with the last spoken emotion.
    """
    if await is_disconnected():
        return

    # Strip markdown formatting BEFORE everything downstream — TTS reads "*"
    # as "hviezdička" (asterisk) in Slovak, and the chat UI renders the raw
    # `**bold**` markers literally. Stripping here means TTS, viseme
    # generation, and the SSE chat display all see clean plain text.
    spoken = _strip_markdown(sentence)

    emotion = detect_emotion(spoken)
    text_frames, text_duration_ms = build_timeline(spoken)
    provider, voice = _resolve_tts_voice(spoken, request, mode)

    start_evt = {
        "type": "sentence_start",
        "index": sentence_idx,
        "text": spoken,
        "viseme_timeline": text_frames,
        "duration_ms": text_duration_ms,
        "emotion": emotion.emotion,
        "intensity": emotion.intensity,
    }
    yield f"data: {json.dumps(start_evt)}\n\n"

    # UE5 broadcast strategy (2026-05-15, deadline-based v2):
    # Two competing signals decide when to broadcast:
    #   1. TTS completes (fast path) → use exact audio-anchored timeline +
    #      mutagen-measured trailing silence pad. Best fidelity.
    #   2. Deadline expires (slow path, slow TTS or long sentences) → use
    #      whatever word_boundaries arrived by then, plus a fixed-estimate
    #      trailing silence pad. Mouth starts earlier; end timing slightly
    #      less accurate.
    # Whichever fires first wins. The broadcast runs in a parallel task so
    # audio chunks keep streaming to the browser uninterrupted.
    #
    # Deadline is measured FROM FIRST AUDIO CHUNK (not sentence_start) so the
    # first ~200-300ms TTS warmup doesn't eat into the budget.

    _BROADCAST_DEADLINE_S = float(os.getenv(
        "EDU_AVATAR_BROADCAST_DEADLINE_MS", "300"
    )) / 1000.0
    _PAD_FRAME_STEP_MS = 40
    # Hold mouth in rest pose for this much extra after the audio ends.
    # Compensates for: (a) Blueprint blending out the last viseme over its
    # internal ~80ms lerp window, (b) small browser audio playback latency
    # vs WS arrival, (c) MP3 frame rounding in mutagen. Bumped 200→350ms
    # 2026-05-15 after observation that mouth ended visibly before audio
    # on short interjections like "Ahoj!".
    _PAD_SAFETY_TAIL_MS = int(os.getenv("EDU_AVATAR_PAD_SAFETY_TAIL_MS", "500"))
    _PAD_FALLBACK_TAIL_MS = 800   # used when TTS hasn't finished and we
                                  # can't probe the audio for exact length

    first_audio_chunk_event = asyncio.Event()
    tts_done_event = asyncio.Event()
    audio_buf = bytearray()
    pending = bytearray()
    tts_failed = False
    sent_first_chunk = False
    word_boundaries: List[dict] = []

    def _apply_trailing_silence_pad(frames: List[dict], target_audio_ms: int) -> Tuple[List[dict], int]:
        """Align the timeline end with target_audio_ms.

        Two cases:
          * timeline SHORTER than audio  → append silence frames so mouth holds
            in rest pose until audio ends (+ small safety tail).
          * timeline LONGER than audio   → linear-scale every frame's start_ms
            and duration_ms so the timeline finishes at target_audio_ms. This is
            the case after bumping per-phoneme holds — the estimate-based
            timeline overshoots actual TTS output and the mouth keeps moving
            after audio ends. Scaling preserves viseme order and relative
            proportions; only the wall-clock timing changes.
        """
        if not frames:
            return frames, target_audio_ms
        last_f = frames[-1]
        timeline_end_ms = last_f['start_ms'] + last_f['duration_ms']

        # Case A: timeline overshoots audio — scale down.
        # Tolerance of +120ms before we scale (smaller overshoot is absorbed
        # by the Blueprint's trailing blendshape lerp).
        if timeline_end_ms > target_audio_ms + 120:
            scale = target_audio_ms / timeline_end_ms
            for f in frames:
                f['start_ms'] = int(f['start_ms'] * scale)
                f['duration_ms'] = max(1, int(f['duration_ms'] * scale))
            timeline_end_ms = target_audio_ms
            return frames, timeline_end_ms

        # Case B: timeline shorter — pad with silence.
        pad_total_ms = (target_audio_ms - timeline_end_ms) + _PAD_SAFETY_TAIL_MS
        if pad_total_ms <= 20:
            return frames, timeline_end_ms
        n_full = pad_total_ms // _PAD_FRAME_STEP_MS
        remainder_ms = pad_total_ms - (n_full * _PAD_FRAME_STEP_MS)
        t = timeline_end_ms
        for _ in range(n_full):
            frames.append({
                'viseme': 'sil', 'weight': 1.0,
                'start_ms': t, 'duration_ms': _PAD_FRAME_STEP_MS,
            })
            t += _PAD_FRAME_STEP_MS
        if remainder_ms > 0:
            frames.append({
                'viseme': 'sil', 'weight': 1.0,
                'start_ms': t, 'duration_ms': remainder_ms,
            })
        return frames, timeline_end_ms + pad_total_ms

    async def _broadcast_when_ready() -> None:
        """Fire one UE5 broadcast with the best timeline available at the
        moment. Fast path: TTS done in time, use audio-anchored. Slow path:
        deadline hits, use partial word_boundaries + estimated trailing pad.
        """
        try:
            await first_audio_chunk_event.wait()
            try:
                await asyncio.wait_for(tts_done_event.wait(), timeout=_BROADCAST_DEADLINE_S)
            except asyncio.TimeoutError:
                pass

            wbs_snapshot = list(word_boundaries)
            audio_snapshot = bytes(audio_buf)
            tts_complete = tts_done_event.is_set()

            if wbs_snapshot:
                bcast_frames, bcast_duration = build_timeline(spoken, word_boundaries=wbs_snapshot)
            else:
                bcast_frames, bcast_duration = list(text_frames), text_duration_ms

            target_audio_ms = bcast_duration
            if tts_complete and audio_snapshot:
                try:
                    import io as _io
                    from mutagen.mp3 import MP3 as _MP3
                    target_audio_ms = int(_MP3(_io.BytesIO(audio_snapshot)).info.length * 1000)
                except Exception:
                    target_audio_ms = bcast_duration + _PAD_FALLBACK_TAIL_MS
            else:
                # TTS still streaming — estimate audio duration from character
                # count, not by summing phoneme durations. Phoneme summation
                # overestimates after the per-phoneme holds were bumped; the
                # character estimate is anchored to a measured speech rate
                # (chars/sec) for the active TTS voice. Slovak Edge TTS
                # sk-SK-LukasNeural runs ~14 cps at default rate.
                _CPS = float(os.getenv("EDU_TTS_CPS", "14"))
                char_count = len(spoken)
                char_estimate_ms = int(1000 * char_count / max(1.0, _CPS))
                # Use whichever is SMALLER between estimate and timeline so we
                # only ever scale-down (never inflate), preventing mouth from
                # running past audio for long sentences where boundaries
                # haven't arrived yet.
                target_audio_ms = min(char_estimate_ms, bcast_duration) + _PAD_FALLBACK_TAIL_MS

            bcast_frames, bcast_duration = _apply_trailing_silence_pad(bcast_frames, target_audio_ms)

            await _broadcast_avatar_state(
                emotion=emotion.emotion,
                intensity=emotion.intensity,
                is_speaking=True,
                visemes=_speaking_head_visemes(bcast_frames),
                viseme_timeline=bcast_frames,
                duration_ms=bcast_duration,
                arkit_frames=None,
            )
        except Exception as bcast_err:  # noqa: BLE001
            logger.warning("UE5 broadcast task failed for sentence %d: %s", sentence_idx, bcast_err)

    # When UE5 plays the audio itself (EDU_UE5_AUDIO), the viseme timeline rides
    # inside speech_start, so skip the legacy viseme-only broadcast to avoid two
    # competing animations. Otherwise keep the proven deadline-based broadcast.
    broadcast_task = None if _UE5_AUDIO_ENABLED else asyncio.create_task(_broadcast_when_ready())
    ue5_started = False  # True once speech_start has been sent for this sentence

    async def _emit_audio_chunk(raw: bytes) -> str:
        """Base64-encode an MP3 chunk, mirror it to UE5 (when enabled), and
        return the SSE 'audio_chunk' line for the browser.

        UE5 path (EDU_UE5_AUDIO): the first chunk is sent as ``speech_start``
        carrying the viseme timeline + emotion + estimated duration, so UE5
        starts the mouth and the audio on the same frame; later chunks are
        ``speech_chunk``. Every message carries ``sentence_idx`` so UE5 can queue
        utterances in order. Any failure here is swallowed — the browser SSE
        audio path is the documented fallback and must never break.
        """
        nonlocal ue5_started
        chunk_b64 = base64.b64encode(raw).decode("ascii")
        # UE5 chunked path: emit speech_start (first chunk) + speech_chunk (rest).
        # In "full" mode this whole branch is skipped — UE5 gets one speech_full
        # at sentence_end instead.
        if _UE5_AUDIO_ENABLED and _UE5_AUDIO_MODE == "chunked":
            try:
                bc = get_avatar_broadcaster()
                if not ue5_started:
                    ue5_started = True
                    wbs = list(word_boundaries)
                    if wbs:
                        s_frames, s_dur = build_timeline(spoken, word_boundaries=wbs)
                    else:
                        s_frames, s_dur = list(text_frames), text_duration_ms
                    # TTS isn't finished yet, so estimate audio length from char
                    # count and pad the timeline tail (scale-down only — never
                    # inflate past the estimate). Same heuristic as the slow-path
                    # viseme broadcast in _broadcast_when_ready.
                    _cps = float(os.getenv("EDU_TTS_CPS", "14"))
                    char_est_ms = int(1000 * len(spoken) / max(1.0, _cps))
                    target_ms = min(char_est_ms, s_dur) + _PAD_FALLBACK_TAIL_MS
                    s_frames, s_dur = _apply_trailing_silence_pad(s_frames, target_ms)
                    if hasattr(bc, "set_speaking"):
                        bc.set_speaking(True)
                    await bc.broadcast({
                        "type": "speech_start",
                        "index": sentence_idx,
                        "emotion": _map_emotion_to_ue5(emotion.emotion),
                        "intensity": emotion.intensity,
                        "viseme_timeline": s_frames,
                        "total_duration_ms": s_dur,
                        "audio_mp3_b64": chunk_b64,
                    })
                else:
                    await bc.broadcast({
                        "type": "speech_chunk",
                        "index": sentence_idx,
                        "audio_mp3_b64": chunk_b64,
                    })
            except Exception as exc:  # noqa: BLE001 — UE5 path must not break SSE
                logger.warning("UE5 speech emit failed (sentence %d): %s", sentence_idx, exc)
        return f"data: {json.dumps({'type': 'audio_chunk', 'index': sentence_idx, 'audio': chunk_b64})}\n\n"

    try:
        async for chunk in tts_svc.stream_chunks(
            spoken,
            provider=provider,
            voice=voice,
            word_boundaries=word_boundaries,
        ):
            if not chunk:
                continue
            audio_buf.extend(chunk)
            pending.extend(chunk)
            cap = _AUDIO_CHUNK_MAX_RAW_BYTES if sent_first_chunk else _AUDIO_CHUNK_FIRST_MAX_RAW_BYTES
            if len(pending) >= cap:
                yield await _emit_audio_chunk(bytes(pending))
                pending.clear()
                if not sent_first_chunk:
                    sent_first_chunk = True
                    first_audio_chunk_event.set()
            if await is_disconnected():
                break
        if pending:
            yield await _emit_audio_chunk(bytes(pending))
            pending.clear()
            if not sent_first_chunk:
                sent_first_chunk = True
                first_audio_chunk_event.set()
    except Exception as tts_err:
        tts_failed = True
        logger.warning("Streaming TTS failed for sentence %d: %s", sentence_idx, tts_err)
    finally:
        # Wake the broadcast task whether it's still waiting for the first
        # chunk or for TTS completion. Without these, a TTS failure before
        # the first chunk leaves the broadcast task hung on
        # first_audio_chunk_event.wait().
        if not first_audio_chunk_event.is_set():
            first_audio_chunk_event.set()
        tts_done_event.set()

    # Signal end of this utterance's audio to UE5 (no-op for playback — RAI
    # finishes the buffered audio). Only fires in chunked mode AND if we actually
    # started streaming. In "full" mode the speech_full message at sentence_end is
    # self-contained — no separate end signal needed.
    if _UE5_AUDIO_ENABLED and _UE5_AUDIO_MODE == "chunked" and ue5_started:
        try:
            await get_avatar_broadcaster().broadcast({"type": "speech_end", "index": sentence_idx})
        except Exception as exc:  # noqa: BLE001
            logger.warning("UE5 speech_end failed (sentence %d): %s", sentence_idx, exc)

    audio_bytes = bytes(audio_buf)
    if tts_failed or not audio_bytes:
        final_frames, final_duration = text_frames, text_duration_ms
        final_arkit: Optional[List[dict]] = None
    else:
        final_frames, final_duration, final_arkit = await _build_lipsync(
            spoken, audio_bytes, word_boundaries=word_boundaries or None,
            emotion=emotion.emotion,
        )

    # Apply mutagen-measured trailing silence pad to the SSE sentence_end
    # timeline (used by the browser orb to refine its animation). The UE5
    # broadcast already happened above with whatever pad it had available.
    if audio_bytes and final_frames:
        try:
            import io as _io_se
            from mutagen.mp3 import MP3 as _MP3_se
            actual_audio_ms = int(_MP3_se(_io_se.BytesIO(audio_bytes)).info.length * 1000)
            final_frames, final_duration = _apply_trailing_silence_pad(final_frames, actual_audio_ms)
        except Exception as _pad_err:  # noqa: BLE001
            logger.warning(
                "Trailing-silence pad probe failed on sentence_end %d (continuing unpadded): %s",
                sentence_idx, _pad_err,
            )

    # Make sure the broadcast task completes before we yield sentence_end
    # (avoids returning before the side-effect we promised to do).
    if broadcast_task is not None:
        try:
            await asyncio.wait_for(broadcast_task, timeout=2.0)
        except (asyncio.TimeoutError, Exception):  # noqa: BLE001
            pass

    audio_b64 = base64.b64encode(audio_bytes).decode("ascii") if audio_bytes else ""

    # UE5 full-bundle mode: emit ONE self-contained speech_full per sentence
    # carrying the complete MP3 + audio-anchored viseme timeline + emotion. UE5
    # imports via RAI `ImportAudioFromBuffer`, plays via SpeechAudioComponent,
    # and drives visemes off the playback clock. Simpler Blueprint than the
    # chunked path; we accept the first-sentence TTFA = its TTS duration.
    if _UE5_AUDIO_ENABLED and _UE5_AUDIO_MODE == "full" and audio_b64:
        try:
            bc = get_avatar_broadcaster()
            if hasattr(bc, "set_speaking"):
                bc.set_speaking(True)
            await bc.broadcast({
                "type": "speech_full",
                "index": sentence_idx,
                "text": spoken,
                "emotion": _map_emotion_to_ue5(emotion.emotion),
                "intensity": emotion.intensity,
                "viseme_timeline": final_frames,
                "total_duration_ms": final_duration,
                "audio_mp3_b64": audio_b64,
            })
        except Exception as exc:  # noqa: BLE001 — UE5 path must not break SSE
            logger.warning("UE5 speech_full failed (sentence %d): %s", sentence_idx, exc)

    end_evt: Dict[str, Any] = {
        "type": "sentence_end",
        "index": sentence_idx,
        "audio": audio_b64,
        "viseme_timeline": final_frames,
        "duration_ms": final_duration,
        "emotion": emotion.emotion,
        "intensity": emotion.intensity,
    }
    if final_arkit is not None:
        end_evt["arkit_frames"] = final_arkit
    yield f"data: {json.dumps(end_evt)}\n\n"

    last_emotion_holder["emotion"] = emotion.emotion
    last_emotion_holder["intensity"] = emotion.intensity
    yield _SPOKE_SENTINEL


@router.post("/chat/stream")
async def chat_stream(
    chat_request: ChatRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(llm_service_dep),
):
    """Streaming chat endpoint — yields SSE events: text deltas, sentence+audio chunks, done.

    Polls ``http_request.is_disconnected()`` between LLM tokens so a client
    disconnect mid-stream triggers a clean break: the loop exits, the
    ``finally`` runs, and UE5 receives an idle broadcast. Starlette stops
    iterating the generator on disconnect but does not deterministically
    call ``aclose()``, so without this poll the avatar can stay stuck in
    speaking state indefinitely.

    LLM is injected via Depends(llm_service_dep) — same asymmetric pattern as
    /chat: LLM eager (init is robust), RAG and TTS lazy (their init can fail
    legitimately and the handler must degrade gracefully).
    """
    request = chat_request

    # v0.7.0 (W2): apply per-request broadcast scope via ContextVar. KB
    # endpoints call with broadcast_avatar=False to skip avatar lipsync.
    # v0.7.1: capture the token so the finally block in generate() can reset
    # the scope. ContextVar.set() inside an endpoint coroutine mutates the
    # request's context and — because FastAPI/Starlette do NOT wrap endpoints
    # in Context.run() per-request — that mutation can outlive the request
    # and leak across worker turns. See the regression analysis in
    # docs/SESSION-HANDOFF-v0.7.0.md.
    _scope_bc = get_avatar_broadcaster()
    _scope_token = _scope_bc.set_broadcast_enabled(bool(request.broadcast_avatar))

    # Clear any speak-mute left over from a previous /api/v1/avatar/stop call —
    # this new chat turn is allowed to make the avatar speak again.
    # v0.7.0 (W2 followup): removed redundant local `from … import
    # get_avatar_broadcaster` here — the module-level import at line 34 is
    # sufficient. The local import created an UnboundLocalError because
    # Python treated `get_avatar_broadcaster` as a function-local name for
    # the ENTIRE function body, causing the new W2 scope-set call at the
    # top of the handler (which runs BEFORE this local import line) to fail
    # with "cannot access local variable 'get_avatar_broadcaster' where it
    # is not associated with a value". Backend booted, /chat/stream 500'd
    # on every request. Re-introduce a local rebind only if module-level
    # circular-import becomes a problem (it didn't in v0.6.x).
    try:
        _broadcaster = get_avatar_broadcaster()
        if hasattr(_broadcaster, "clear_speech_mute"):
            _broadcaster.clear_speech_mute()
    except Exception:
        pass

    async def generate():
        from app.services.tts_service import get_tts_service

        spoke_to_avatar = False
        last_emotion = "neutral"
        last_intensity = 0.4

        async def _signal_idle_if_speaking() -> None:
            if spoke_to_avatar:
                try:
                    await _broadcast_avatar_state(
                        emotion=last_emotion,
                        intensity=last_intensity,
                        is_speaking=False,
                        visemes=list(_AVATAR_IDLE_VISEMES),
                        viseme_timeline=[],
                        duration_ms=0,
                    )
                except Exception as exc:
                    logger.warning("Idle broadcast in finally failed: %s", exc)

        try:
            mode = get_mode(request.mode_id or "sk") or get_default_mode()

            if request.message == "__greeting__":
                user_message = mode.greeting_instruction
            elif request.message == "__silence_check__":
                user_message = "__silence_check__"
            else:
                user_message = request.message

            if request.provider:
                llm.set_provider(request.provider)

            context_text = ""
            retrieved_chunks: List[ContextChunk] = []
            if request.knowledge_base and _should_use_rag(user_message):
                try:
                    rag = await get_rag_service()
                    if rag.is_ready():
                        active_doc_ids = await _resolve_active_document_ids(
                            db,
                            request.knowledge_base,
                            request.context_modes,
                        )
                        retrieved_chunks = await rag.search_with_metadata(
                            query=user_message,
                            knowledge_base=request.knowledge_base,
                            top_k=request.rag_top_k or rag_config.top_k_results,
                            similarity_threshold=request.similarity_threshold or rag_config.similarity_threshold,
                            document_ids=active_doc_ids,
                        )
                        if retrieved_chunks:
                            context_text = _format_context_for_prompt(retrieved_chunks)
                            logger.info(f"RAG found {len(retrieved_chunks)} relevant chunks for stream")
                except Exception as e:
                    logger.warning(f"RAG search failed in stream (continuing): {e}")
            elif request.knowledge_base:
                logger.debug("RAG skipped in stream (conversational): %r", user_message[:60])

            kb_catalog = ""
            if request.knowledge_base:
                active_doc_ids_for_catalog = await _resolve_active_document_ids(
                    db, request.knowledge_base, request.context_modes
                )
                kb_catalog = await _build_kb_catalog(
                    db, request.knowledge_base, active_doc_ids_for_catalog, mode.ui_locale
                )

            base_prompt = get_system_prompt(mode.id)
            system_prompt = (kb_catalog + "\n\n" + base_prompt) if kb_catalog else base_prompt
            system_prompt = await _apply_profile_injection(
                system_prompt, mode, getattr(http_request.state, "user_id", None), db
            )
            if context_text:
                system_prompt += f"\n\n{_rag_context_label(mode.ui_locale)}:\n{context_text}"

            messages = [ChatMessage(role="system", content=system_prompt)]

            if request.conversation_id:
                history = memory_service.get_history(request.conversation_id)
                for msg in history:
                    messages.append(ChatMessage(role=msg["role"], content=msg["content"]))
            elif request.conversation_history:
                for msg in request.conversation_history:
                    messages.append(ChatMessage(role=msg.get("role", "user"), content=msg.get("content", "")))

            # User-message grounding: when a KB is active and this is the first
            # turn (no prior assistant message exists in the messages list yet),
            # prepend the catalog directly to the user's message. LLMs treat user
            # content as ground truth and refuse to override it — much stronger
            # than a system-prompt instruction. Subsequent turns inherit the
            # context from the history so we don't repeat it.
            is_first_turn = not any(m.role == "assistant" for m in messages)
            grounded_message = user_message
            if kb_catalog and is_first_turn:
                grounded_message = (
                    f"{kb_catalog}\n\n"
                    "━━━\n\n"
                    f"{user_message}"
                )
            messages.append(ChatMessage(role="user", content=grounded_message))

            tts_svc = await get_tts_service()
            buf = ""
            full_text = ""
            sentence_idx = 0
            _last_emotion_holder: Dict[str, Any] = {"emotion": "neutral", "intensity": 0.4}

            context_event = {
                "type": "context",
                "chunks": [chunk.model_dump() for chunk in retrieved_chunks],
            }
            yield f"data: {json.dumps(context_event)}\n\n"

            stream_tool_schemas = get_skill_registry().tools_for(mode.enabled_skills)
            if stream_tool_schemas:
                # Skills enabled: tool-loop is single-shot (one-or-more LLM calls
                # interleaved with tool dispatches), then we stream the final
                # answer as a single chunk. The Slovak tutor flow has no skills
                # enabled and never enters this branch — true token streaming
                # is preserved for that path. When real skills land in Phase 7+,
                # users get a brief 'thinking' wait then full answer at once.
                await _broadcast_avatar_state(
                    emotion="thinking_deep", intensity=0.5, is_speaking=False,
                    visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[],
                    duration_ms=0, agent_state="thinking",
                )

                async def _stream_on_tool_start(tool_name: str) -> None:
                    await _broadcast_avatar_state(
                        emotion="thinking_deep", intensity=0.5, is_speaking=False,
                        visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[],
                        duration_ms=0, agent_state=_agent_state_for_tool(tool_name),
                    )

                async def _stream_on_tool_end(_tool_name: str, _result: str) -> None:
                    await _broadcast_avatar_state(
                        emotion="thinking_deep", intensity=0.4, is_speaking=False,
                        visemes=list(_AVATAR_IDLE_VISEMES), viseme_timeline=[],
                        duration_ms=0, agent_state="thinking",
                    )

                response_text = await _run_tool_loop(
                    llm=llm,
                    messages=messages,
                    tool_schemas=stream_tool_schemas,
                    on_tool_start=_stream_on_tool_start,
                    on_tool_end=_stream_on_tool_end,
                    user_id=getattr(http_request.state, "user_id", None),
                )
                if response_text:
                    full_text = response_text
                    buf = response_text
                    yield f"data: {json.dumps({'type': 'text', 'delta': response_text})}\n\n"
            else:
                # Concurrent pipeline: LLM tokens stream into the SSE generator
                # immediately, sentence boundaries fire TTS tasks asynchronously,
                # and audio_chunk events interleave with text deltas. The end-
                # of-stream sentinel ``None`` flushes the queue. Without this
                # multiplex, sentence_start would only fire after the LLM
                # finished its full response — defeating the latency win.
                sse_queue: asyncio.Queue = asyncio.Queue()
                tts_tasks: List[asyncio.Task] = []
                next_sentence_idx = [sentence_idx]

                async def _drain_speak(sentence_text: str, idx: int) -> None:
                    try:
                        async for line in _speak_sentence(
                            sentence=sentence_text,
                            sentence_idx=idx,
                            request=request,
                            mode=mode,
                            tts_svc=tts_svc,
                            is_disconnected=http_request.is_disconnected,
                            last_emotion_holder=_last_emotion_holder,
                        ):
                            await sse_queue.put(line)
                    except Exception as exc:
                        logger.warning("speak task %d failed: %s", idx, exc)

                def _spawn_speak(sentence_text: str) -> None:
                    idx = next_sentence_idx[0]
                    next_sentence_idx[0] = idx + 1
                    tts_tasks.append(asyncio.create_task(_drain_speak(sentence_text, idx)))

                async def _produce_text() -> None:
                    nonlocal full_text, buf
                    spoke_first = False
                    try:
                        async for chunk in llm.generate_stream(
                            messages,
                            max_tokens=request.max_tokens,
                            temperature=request.temperature,
                        ):
                            if await http_request.is_disconnected():
                                logger.info("chat_stream: client disconnected mid-stream, breaking cleanly")
                                break
                            full_text += chunk
                            buf += chunk
                            await sse_queue.put(
                                f"data: {json.dumps({'type': 'text', 'delta': chunk})}\n\n"
                            )
                            new_sentences, buf = _split_sentences(
                                buf,
                                allow_first_phrase_break=not spoke_first,
                            )
                            for s in new_sentences:
                                _spawn_speak(s)
                                spoke_first = True
                        remainder_local = buf.strip()
                        if remainder_local and len(remainder_local) >= 8:
                            _spawn_speak(remainder_local)
                            buf = ""
                    finally:
                        await sse_queue.put(None)

                producer = asyncio.create_task(_produce_text())
                producer_done = False
                while not producer_done or tts_tasks or not sse_queue.empty():
                    try:
                        item = await asyncio.wait_for(sse_queue.get(), timeout=0.05)
                    except asyncio.TimeoutError:
                        tts_tasks = [t for t in tts_tasks if not t.done()]
                        producer_done = producer.done()
                        continue
                    if item is None:
                        producer_done = True
                        continue
                    if item is _SPOKE_SENTINEL:
                        spoke_to_avatar = True
                        last_emotion = _last_emotion_holder["emotion"]
                        last_intensity = _last_emotion_holder["intensity"]
                    else:
                        yield item
                    tts_tasks = [t for t in tts_tasks if not t.done()]

                sentence_idx = next_sentence_idx[0]
                if not producer.done():
                    producer.cancel()
                for t in tts_tasks:
                    if not t.done():
                        t.cancel()

            # 5. Emotion detection on full text
            emotion_result = detect_emotion(full_text)

            await _broadcast_avatar_state(
                emotion=emotion_result.emotion,
                intensity=emotion_result.intensity,
                is_speaking=False,
                visemes=list(_AVATAR_IDLE_VISEMES),
                viseme_timeline=[],
                duration_ms=0,
            )
            spoke_to_avatar = False

            # 6. Done event
            yield f"data: {json.dumps({'type': 'done', 'emotion': emotion_result.emotion, 'intensity': emotion_result.intensity, 'full_text': full_text})}\n\n"

            # v0.6.4: explicit [DONE] sentinel + 'event: end' frame. OpenAI's SSE
            # convention. Packaged Electron's net stack with HTTP keep-alive can
            # hold the reader.read() promise open past 'type: done' until the
            # underlying TCP connection closes, which makes the frontend voice
            # loop wait for "more sentences" that never come. Emitting both
            # sentinels forces every well-behaved SSE consumer to flip the
            # stream into a terminated state immediately.
            yield "data: [DONE]\n\n"
            yield "event: end\ndata: \n\n"

            # 7. Persist to memory + SQLite after done
            is_internal = request.message in ("__greeting__", "__silence_check__")
            if request.conversation_id and full_text and not is_internal:
                memory_service.append_turn(
                    request.conversation_id,
                    user_text=user_message,
                    assistant_text=full_text,
                )
                await db_message_service.save_turn(
                    request.conversation_id,
                    user_text=user_message,
                    assistant_text=full_text,
                )

        except asyncio.CancelledError:
            logger.info("chat_stream: cancelled (client disconnect or task cancellation)")
            raise
        except Exception as e:
            logger.error(f"chat_stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            # Guarantee UE5 leaves speaking state on EVERY exit path: success,
            # voluntary break (client-disconnect poll), CancelledError, or any
            # other exception. Wrapped internally so a broadcaster failure here
            # does not mask the original termination reason.
            await _signal_idle_if_speaking()
            # v0.7.1: restore prior broadcast scope so the ContextVar mutation
            # doesn't leak into subsequent requests served on the same worker.
            try:
                _scope_bc.reset_broadcast_enabled(_scope_token)
            except Exception:
                pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
