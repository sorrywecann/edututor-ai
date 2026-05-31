"""
EduTutor.AI — STT API
Speech-to-Text endpoints with hot-swap support.
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.services.stt_service import get_stt_service, AVAILABLE_STT_MODELS

logger = logging.getLogger(__name__)
router = APIRouter()

# Whisper hallucinates these phrases on silence / background noise.
# Any transcription that matches (case-insensitive, stripped) is discarded.
_HALLUCINATION_PHRASES = {
    # Slovak — greetings (common on short/silent clips)
    "zdravíte", "zdravím", "zdravím vás", "ahojte", "nazdar",
    "dobrý deň", "dobry den", "dobrý večer", "dobry vecer",
    "dobré ráno", "dobre rano",
    # Slovak — thanks/sign-off
    "ďakujem za pozornosť", "dakujem za pozornost",
    "ďakujem vám za pozornosť", "dakujem vam za pozornost",
    "ďakujem", "dakujem", "dovidenia", "do videnia",
    "titulky", "titulky vytvoril", "podtitulky",
    # Czech
    "děkuji za pozornost", "dekuji za pozornost",
    "zdravím", "zdravím vás",
    "děkuji", "dekuji", "na shledanou",
    # English
    "thank you for watching", "thank you for your attention",
    "thank you", "thanks for watching", "please subscribe",
    "like and subscribe", "subtitles by", "transcribed by",
    "you", "bye", "bye bye",
}


def _is_hallucination(text: str, confidence: float) -> bool:
    """Return True if the transcription looks like a Whisper hallucination."""
    cleaned = text.strip().lower().rstrip(".,!?…")
    if not cleaned:
        return True
    if cleaned in _HALLUCINATION_PHRASES:
        return True
    # Very short + low confidence = likely noise
    if len(cleaned.split()) <= 2 and confidence < 0.6:
        return True
    return False


class STTModel(BaseModel):
    id: str
    name: str
    description: str
    provider: str
    backend: str
    model_id: str
    accuracy_sk: str
    speed: str
    cost: str
    languages: List[str]
    requires: List[str]


class STTModelsResponse(BaseModel):
    models: List[STTModel]
    current: str


class STTResponse(BaseModel):
    text: str
    language: str
    confidence: float
    provider: str


class SwitchModelRequest(BaseModel):
    model_id: str


@router.get("/stt/models", response_model=STTModelsResponse)
async def list_stt_models():
    """List all available STT models with comparison metadata."""
    stt = await get_stt_service()
    return STTModelsResponse(
        models=[STTModel(**m) for m in AVAILABLE_STT_MODELS],
        current=stt.provider,
    )


async def _do_transcribe(
    audio: UploadFile,
    language: str,
    model: Optional[str],
) -> STTResponse:
    audio_data = await audio.read()
    ext = (audio.filename or "audio.webm").rsplit(".", 1)[-1]
    stt = await get_stt_service()
    try:
        if model and model != stt.provider:
            result = await stt.transcribe_with_model(audio_data, model_id=model, language=language, format=ext)
        else:
            result = await stt.transcribe(audio_data, language=language, format=ext)
    except Exception as e:
        logger.error(f"STT error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    text = result.text
    if _is_hallucination(text, result.confidence):
        logger.debug(f"STT hallucination filtered: {text!r} (confidence={result.confidence:.2f})")
        text = ""

    return STTResponse(
        text=text,
        language=result.language,
        confidence=result.confidence,
        provider=result.provider or model or stt.provider,
    )


@router.post("/stt", response_model=STTResponse)
async def speech_to_text(
    audio: UploadFile = File(...),
    language: str = Form("sk"),
    model: Optional[str] = Form(None),
):
    """Transcribe audio. Optionally pass model= to switch provider per-request."""
    return await _do_transcribe(audio, language, model)


@router.post("/stt/transcribe", response_model=STTResponse)
async def speech_to_text_transcribe(
    audio: UploadFile = File(...),
    language: str = Form("sk"),
    model: Optional[str] = Form(None),
):
    """Alias of /stt — matches the frontend useVoiceSession call."""
    return await _do_transcribe(audio, language, model)


@router.post("/stt/switch")
async def switch_stt_model(body: SwitchModelRequest):
    """
    Hot-swap the active STT provider at runtime.
    No restart needed. Example: POST /api/v1/stt/switch {"model_id": "groq-whisper"}
    """
    stt = await get_stt_service()
    try:
        await stt.switch_model(body.model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"status": "ok", "active": stt.provider}
