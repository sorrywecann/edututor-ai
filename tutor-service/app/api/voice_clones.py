# tutor-service/app/api/voice_clones.py
"""
Voice clone management — upload, list, delete, preview reference audio samples.

Reference audio files are stored in:
  models/omnivoice/references/{slug}.wav  — for OmniVoice engine (default)
  models/xtts/references/{slug}.wav       — legacy path (XTTS engine removed in b22c568,
                                            kept for backward-compat with pre-v5 voice clones)

Once uploaded, cloned voices auto-appear in GET /tts/voices because
tts.py already scans these directories.
"""

import logging
import os
import re
import io
import time
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Base paths for reference audio
_MODELS_DIR = Path(__file__).parent.parent.parent / "models"
_OMNIVOICE_REFS = _MODELS_DIR / "omnivoice" / "references"

_ALLOWED_ENGINES = {"omnivoice"}
_MAX_AUDIO_BYTES = 30 * 1024 * 1024  # 30 MB max upload


class VoiceCloneInfo(BaseModel):
    id: str
    name: str
    engine: str
    filename: str
    duration_s: float
    size_bytes: int


def _refs_dir(engine: str) -> Path:
    return _OMNIVOICE_REFS


def _slugify(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower().strip()).strip('-')
    return slug or "voice"


def _get_audio_duration(wav_path: Path) -> float:
    """Get duration in seconds from a WAV file."""
    try:
        import soundfile as sf
        info = sf.info(str(wav_path))
        return info.duration
    except Exception:
        # Fallback: estimate from file size (16-bit mono 22050Hz)
        size = wav_path.stat().st_size
        return max(0.0, (size - 44) / (22050 * 2))


def _convert_to_wav(audio_bytes: bytes, output_path: Path) -> None:
    """Convert any audio format to 22050Hz mono WAV using PyAV."""
    import av
    import numpy as np

    container = av.open(io.BytesIO(audio_bytes))
    resampler = av.AudioResampler(format="s16", layout="mono", rate=22050)
    chunks = []
    for frame in container.decode(audio=0):
        for rf in resampler.resample(frame):
            chunks.append(rf.to_ndarray().flatten())
    container.close()

    if not chunks:
        raise ValueError("No audio data found in uploaded file")

    pcm = np.concatenate(chunks)

    import soundfile as sf
    sf.write(str(output_path), pcm, 22050, subtype="PCM_16")


_AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a"}

def _list_clones(engine: str) -> List[VoiceCloneInfo]:
    refs = _refs_dir(engine)
    if not refs.is_dir():
        return []
    result = []
    for f in sorted(refs.iterdir()):
        if f.suffix.lower() in _AUDIO_SUFFIXES:
            stem = f.stem
            result.append(VoiceCloneInfo(
                id=f"{engine}-clone-{stem}",
                name=stem.replace("-", " ").title(),
                engine=engine,
                filename=f.name,
                duration_s=round(_get_audio_duration(f), 1),
                size_bytes=f.stat().st_size,
            ))
    return result


# ── Endpoints ──────────────────────────────────────────────────────────


@router.get("/voice-clones")
async def list_voice_clones() -> List[VoiceCloneInfo]:
    """List all uploaded voice clone references."""
    clones = []
    for engine in _ALLOWED_ENGINES:
        clones.extend(_list_clones(engine))
    return clones


@router.post("/voice-clones/upload")
async def upload_voice_clone(
    audio: UploadFile = File(...),
    name: str = Form(...),
    engine: str = Form("omnivoice"),
):
    """Upload a voice reference sample (3-30s, any audio format)."""
    if engine not in _ALLOWED_ENGINES:
        raise HTTPException(400, f"Engine must be one of: {_ALLOWED_ENGINES}")

    # Read and validate size
    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(400, f"Audio file too large (max {_MAX_AUDIO_BYTES // 1024 // 1024}MB)")
    if len(audio_bytes) < 1000:
        raise HTTPException(400, "Audio file too small — need at least 3 seconds of speech")

    # Prepare output directory and path
    refs = _refs_dir(engine)
    refs.mkdir(parents=True, exist_ok=True)

    slug = _slugify(name)
    output_path = refs / f"{slug}.wav"

    # Don't overwrite — add timestamp suffix
    if output_path.exists():
        slug = f"{slug}-{int(time.time()) % 100000}"
        output_path = refs / f"{slug}.wav"

    # Convert to WAV
    try:
        _convert_to_wav(audio_bytes, output_path)
    except Exception as e:
        logger.error(f"Audio conversion failed: {e}")
        raise HTTPException(400, f"Could not process audio file: {e}")

    # Validate duration
    duration = _get_audio_duration(output_path)
    if duration < 2.0:
        output_path.unlink(missing_ok=True)
        raise HTTPException(400, f"Audio too short ({duration:.1f}s). Need at least 3 seconds.")
    if duration > 60.0:
        output_path.unlink(missing_ok=True)
        raise HTTPException(400, f"Audio too long ({duration:.1f}s). Max 60 seconds.")
    if duration < 5.0:
        logger.warning(
            f"Voice clone reference is short ({duration:.1f}s). "
            f"XTTS cloning works best with 5-10 seconds of clear, dry speech."
        )

    info = VoiceCloneInfo(
        id=f"{engine}-clone-{slug}",
        name=name,
        engine=engine,
        filename=output_path.name,
        duration_s=round(duration, 1),
        size_bytes=output_path.stat().st_size,
    )
    logger.info(f"Voice clone uploaded: {info.id} ({duration:.1f}s)")
    return info


@router.delete("/voice-clones/{clone_id}")
async def delete_voice_clone(clone_id: str):
    """Delete a voice clone reference."""
    # Parse ID format: {engine}-clone-{slug}
    import re
    for engine in _ALLOWED_ENGINES:
        prefix = f"{engine}-clone-"
        if clone_id.startswith(prefix):
            slug = clone_id[len(prefix):]
            if not re.match(r'^[a-zA-Z0-9_-]+$', slug):
                raise HTTPException(400, "Invalid clone ID format")
            refs = _refs_dir(engine)
            wav_path = refs / f"{slug}.wav"
            if wav_path.exists():
                wav_path.unlink()
                logger.info(f"Voice clone deleted: {clone_id}")
                return {"deleted": True, "id": clone_id}

    raise HTTPException(404, f"Voice clone not found: {clone_id}")


class PreviewRequest(BaseModel):
    text: str = "Ahoj, som tvoj osobný tutor."


@router.post("/voice-clones/{clone_id}/preview")
async def preview_voice_clone(clone_id: str, body: Optional[PreviewRequest] = None, text: Optional[str] = None):
    """Preview a cloned voice. Accepts text via JSON body or query param."""
    from app.services.tts_service import get_tts_service
    preview_text = (body.text if body else None) or text or "Ahoj, som tvoj osobný tutor."

    # Determine engine and find reference
    engine = None
    for eng in _ALLOWED_ENGINES:
        prefix = f"{eng}-clone-"
        if clone_id.startswith(prefix):
            engine = eng
            slug = clone_id[len(prefix):]
            break

    if engine is None:
        raise HTTPException(404, f"Voice clone not found: {clone_id}")

    refs = _refs_dir(engine)
    wav_path = refs / f"{slug}.wav"
    if not wav_path.exists():
        raise HTTPException(404, f"Reference file not found for: {clone_id}")

    tts = await get_tts_service()
    result = None

    try:
        result = await tts.synthesize_with_options(
            text=preview_text, provider="omnivoice", voice=str(wav_path)
        )
    except Exception as e:
        logger.warning(f"OmniVoice clone preview failed ({e}), falling back to Edge TTS")

    if result is None:
        try:
            result = await tts.synthesize_with_options(
                text=preview_text, provider="edge", voice="sk-SK-LukasNeural"
            )
        except Exception as e:
            raise HTTPException(500, f"All TTS providers failed: {e}")

    ext = "wav" if "wav" in result.audio_format else "mp3"
    return Response(
        content=result.audio_data,
        media_type=result.audio_format,
        headers={
            "Content-Disposition": f"inline; filename=preview.{ext}",
            "X-TTS-Provider": "cloned" if engine in {"omnivoice", "xtts"} else "edge-fallback",
        },
    )
