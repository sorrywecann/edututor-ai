"""v0.7.0 (W6) — Avatar debug harness.

Triggers individual emotion or viseme broadcasts without going through the
LLM/TTS roundtrip. Used for QA: verify each emotion makes the UE5 BP
transition correctly, verify each viseme moves the right blendshape on
MHC_Girl.

Gated by EDU_DEV_AVATAR_DEBUG env (default off). Production builds leave
this disabled — same pattern as avatar_dev.py's EDU_DEV_MODE flip in
v0.7.0 (W2).
"""
from __future__ import annotations

import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.avatar_broadcaster import get_avatar_broadcaster

router = APIRouter(prefix="/api/v1/avatar/debug", tags=["avatar-debug"])


def _is_debug_enabled() -> bool:
    """Default OFF — opt-in via EDU_DEV_AVATAR_DEBUG=1."""
    raw = os.getenv("EDU_DEV_AVATAR_DEBUG", "0").strip().lower()
    return raw in ("1", "true", "yes", "on")


# 9 emotions, identity passthrough per chat.py:_UE5_EMOTION_MAP (c3c7eeb1)
ALLOWED_EMOTIONS: List[str] = [
    "neutral",
    "celebrating",
    "proud",
    "encouraging_mild",
    "correcting",
    "patient",
    "curious",
    "thinking_deep",
    "surprise",
]

# 15 viseme labels — 14 emitted by Slovak grapheme tokenizer + 1 reserved (TH).
# Documented in viseme_timeline.py SLOVAK_CHAR_VISEME.
ALLOWED_VISEMES: List[str] = [
    "sil",
    "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR",
    "aa", "E", "ih", "oh", "ou",
]


class InjectRequest(BaseModel):
    """Inject one frame to all connected UE5 clients.

    Either emotion (full AvatarCommand with intensity) OR viseme (single-key
    timeline) is required; both at once supported for combined QA.
    """
    emotion: Optional[str] = Field(default=None, description="One of ALLOWED_EMOTIONS")
    intensity: float = Field(default=0.8, ge=0.0, le=1.0)
    viseme: Optional[str] = Field(default=None, description="One of ALLOWED_VISEMES")
    hold_ms: int = Field(default=800, ge=50, le=5000)


class InjectResponse(BaseModel):
    sent: bool
    clients: int
    emotion: Optional[str]
    viseme: Optional[str]


@router.post("/inject", response_model=InjectResponse)
async def inject(req: InjectRequest) -> InjectResponse:
    """Broadcast one debug frame to every connected UE5 client.

    Bypasses the LLM/TTS pipeline so the QA loop is pure protocol:
    click → broadcast → observe BP transition.
    """
    if not _is_debug_enabled():
        raise HTTPException(
            status_code=403,
            detail="Avatar debug disabled. Set EDU_DEV_AVATAR_DEBUG=1 to enable.",
        )

    if not req.emotion and not req.viseme:
        raise HTTPException(status_code=400, detail="Provide at least one of: emotion, viseme")

    if req.emotion and req.emotion not in ALLOWED_EMOTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown emotion '{req.emotion}'. Allowed: {ALLOWED_EMOTIONS}",
        )

    if req.viseme and req.viseme not in ALLOWED_VISEMES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown viseme '{req.viseme}'. Allowed: {ALLOWED_VISEMES}",
        )

    bc = get_avatar_broadcaster()

    # Build a single-frame timeline if a viseme was requested
    viseme_timeline = []
    visemes = []
    if req.viseme:
        viseme_frame = {"t": 0, "viseme": req.viseme, "weight": 1.0}
        viseme_timeline = [viseme_frame, {"t": req.hold_ms, "viseme": "sil", "weight": 0.0}]
        visemes = [{"key": req.viseme, "weight": 1.0}]

    # Build the payload directly (avoid the chat.py helper because we want to
    # bypass scope/mute gates — this is debug only and runs in dev builds).
    payload = {
        "emotion": req.emotion or "neutral",
        "intensity": req.intensity,
        "isSpeaking": bool(req.viseme),
        "visemes": visemes,
        "blink": 0.0,
        "viseme_timeline": viseme_timeline,
        "total_duration_ms": req.hold_ms,
        "_source": "avatar-debug",
    }

    # Temporarily force broadcast scope on so we don't get gated by a stale
    # context flag from a prior request.
    tok = bc.set_broadcast_enabled(True)
    try:
        await bc.broadcast(payload)
    finally:
        bc.reset_broadcast_enabled(tok)

    return InjectResponse(
        sent=True,
        clients=bc.connection_count,
        emotion=req.emotion,
        viseme=req.viseme,
    )


@router.get("/state", response_model=dict)
async def state() -> dict:
    """Debug status — confirms harness is enabled + counts UE5 clients."""
    bc = get_avatar_broadcaster()
    return {
        "enabled": _is_debug_enabled(),
        "clients": bc.connection_count,
        "is_speaking": bc.is_speaking,
        "broadcast_enabled": bc.broadcast_enabled,
        "allowed_emotions": ALLOWED_EMOTIONS,
        "allowed_visemes": ALLOWED_VISEMES,
    }
