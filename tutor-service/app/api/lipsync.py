import logging
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.audio2lipsync_client import (
    check_health,
    generate_from_audio,
    arkit_to_frames,
    get_lipsync_provider,
    set_lipsync_provider,
)
from app.services.viseme_timeline import build_timeline, text_to_tokens

logger = logging.getLogger(__name__)
router = APIRouter()


class LipsyncSwitchRequest(BaseModel):
    provider: str


class LipsyncPreviewRequest(BaseModel):
    text: str


class LipsyncPreviewResponse(BaseModel):
    text: str
    viseme_timeline: list[dict]
    total_duration_ms: int
    frame_count: int
    tokens: list[dict] = []


class LipsyncPreviewFullRequest(BaseModel):
    text: str
    include_arkit: bool = True


class LipsyncPreviewFullResponse(BaseModel):
    text: str
    # Tier 3: text-only
    text_tier: dict
    # Tier 1: audio2lipsync ARKit (when include_arkit=True and TTS+model available)
    arkit_tier: Optional[dict] = None
    # Diagnostic: which tier UE5 actually receives during chat
    production_tier: str


@router.get("/lipsync/status")
async def lipsync_status():
    sidecar_ok = await check_health()
    return {
        "active": get_lipsync_provider(),
        "providers": {
            "text": {"available": True, "reason": "Built-in Slovak viseme mapping"},
            "audio2lipsync": {
                "available": sidecar_ok,
                "reason": "Ready" if sidecar_ok else "Model not loaded (downloads on first use)",
            },
            "hybrid": {
                "available": True,
                "reason": "Auto: uses ARKit when model loaded, text visemes otherwise",
            },
        },
    }


@router.post("/lipsync/switch")
async def switch_lipsync(request: LipsyncSwitchRequest):
    provider = request.provider.strip().lower()

    if provider == "audio2lipsync":
        sidecar_ok = await check_health()
        if not sidecar_ok:
            return {
                "success": False,
                "error": "Audio2Lipsync model failed to load. Check logs.",
            }

    ok = set_lipsync_provider(provider)
    if not ok:
        return {
            "success": False,
            "error": f"Unknown provider: {provider}. Use 'text' or 'audio2lipsync'.",
        }

    logger.info(f"Lipsync provider switched to: {provider}")
    return {"success": True, "provider": provider}


@router.post("/lipsync/preview", response_model=LipsyncPreviewResponse)
async def lipsync_preview(request: LipsyncPreviewRequest):
    """Deterministic text → viseme sequence for backtesting.

    Runs the same Slovak grapheme→viseme pipeline that the chat path uses
    (`build_timeline`), without LLM/TTS/audio. Used by the Pipeline Inspector's
    Backtest panel to verify that a known sentence produces the expected
    viseme sequence — answers "are we sending the right visemes for THIS text?"
    """
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    frames, duration_ms = build_timeline(text)
    tokens = text_to_tokens(text)
    return LipsyncPreviewResponse(
        text=text,
        viseme_timeline=frames,
        total_duration_ms=duration_ms,
        frame_count=len(frames),
        tokens=tokens,
    )


@router.post("/lipsync/preview/full", response_model=LipsyncPreviewFullResponse)
async def lipsync_preview_full(request: LipsyncPreviewFullRequest):
    """Tri-tier preview — text-only AND audio2lipsync ARKit for the same text.

    Used by the Pipeline Inspector to show, side-by-side:
      - text_tier: the 14-symbol coarse mapping (fallback path)
      - arkit_tier: 52 ARKit blendshapes per frame at 60fps (production path)
    The text_tier and arkit_tier dicts have the same shape so the frontend
    can render them in parallel columns. arkit_tier is None when either
    include_arkit is False, the Audio2Lipsync model isn't loaded, or TTS
    audio generation failed.

    This is the answer to "what does UE5 actually receive for this text?"
    — production_tier names the highest-quality tier that fired.
    """
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # Tier 3 — text-only — always available.
    text_frames, text_duration = build_timeline(text)
    text_tokens = text_to_tokens(text)
    text_tier = {
        "viseme_timeline": text_frames,
        "tokens": text_tokens,
        "total_duration_ms": text_duration,
        "frame_count": len(text_frames),
    }

    arkit_tier: Optional[dict] = None
    production_tier = "text"

    # Tier 1 — audio2lipsync ARKit — needs TTS audio + loaded model.
    if request.include_arkit:
        provider = get_lipsync_provider()
        if provider in ("audio2lipsync", "hybrid"):
            try:
                # Use Edge TTS (configured in .env) to get audio bytes for the
                # exact same text the text tier saw.
                from app.services.tts_service import get_tts_service
                tts = await get_tts_service()
                tts_result = await tts.synthesize(text, return_visemes=False)
                audio_bytes = getattr(tts_result, "audio_data", None)
                if audio_bytes:
                    result = await generate_from_audio(audio_bytes)
                    if result and "arkit_raw" in result:
                        arkit_frames, arkit_duration = arkit_to_frames(
                            result["arkit_raw"], result.get("fps", 60)
                        )
                        # First-frame sample so the frontend doesn't need to
                        # parse all 52 channels just to display them.
                        sample = {}
                        if arkit_frames and arkit_frames[0].get("arkit"):
                            sample = arkit_frames[0]["arkit"]
                        arkit_tier = {
                            "frames": arkit_frames,
                            "frame_count": len(arkit_frames),
                            "total_duration_ms": arkit_duration,
                            "fps": result.get("fps", 60),
                            "sample_channels": sample,
                            "channel_count": len(sample),
                            "audio_bytes_size": len(audio_bytes),
                        }
                        production_tier = "audio2lipsync"
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "preview/full: ARKit tier failed, falling back to text only: %s",
                    exc,
                )

    return LipsyncPreviewFullResponse(
        text=text,
        text_tier=text_tier,
        arkit_tier=arkit_tier,
        production_tier=production_tier,
    )
