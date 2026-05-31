"""Dev-only avatar synthetic broadcast endpoint.

Pushes test payloads directly onto /ws/avatar without triggering a chat turn.
Gated on EDU_DEV_MODE (default "1"); set EDU_DEV_MODE=0 to hide the route.
"""
from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.avatar_broadcaster import get_avatar_broadcaster

router = APIRouter()


def _is_dev_mode() -> bool:
    # v0.7.0 (W2): default flipped from "1" to "0" so production builds
    # don't ship a broadcast backdoor. Set EDU_DEV_MODE=1 in dev only.
    raw = os.getenv("EDU_DEV_MODE", "0").strip().lower()
    return raw not in ("0", "false", "no", "off", "")


class DevBroadcastResponse(BaseModel):
    success: bool
    connections: int = Field(description="Number of /ws/avatar clients that received the payload")


@router.post("/avatar/dev/broadcast", response_model=DevBroadcastResponse)
async def dev_broadcast(payload: Dict[str, Any]) -> DevBroadcastResponse:
    """Synthetic avatar broadcast for dev/QA. Returns 404 outside dev mode.

    Payload is passed verbatim to AvatarBroadcaster.broadcast(), so callers
    can exercise any contract field (visemes, arkit, agentState,
    audioPositionMs, sentenceIdx). No validation — the Blueprint is the
    contract validator at the receiving end.
    """
    if not _is_dev_mode():
        raise HTTPException(status_code=404, detail="Not Found")

    broadcaster = get_avatar_broadcaster()
    conn_count = broadcaster.connection_count
    await broadcaster.broadcast(payload)
    return DevBroadcastResponse(success=True, connections=conn_count)
