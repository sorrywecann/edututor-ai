from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.config.learning_modes import get_all_modes, get_mode

router = APIRouter()


class ModeResponse(BaseModel):
    id: str
    label: str
    description: str
    ui_locale: str
    stt_language: str
    tts_voice: str
    tts_provider: str
    tutor_name: str
    tutor_color: str
    available_voices: List[str]
    native_language: Optional[str] = None
    target_language: Optional[str] = None
    native_tts_voice: Optional[str] = None
    native_tts_provider: Optional[str] = None
    enabled_skills: List[str] = []


def _to_response(m) -> ModeResponse:
    return ModeResponse(
        id=m.id,
        label=m.label,
        description=m.description,
        ui_locale=m.ui_locale,
        stt_language=m.stt_language,
        tts_voice=m.tts_voice,
        tts_provider=m.tts_provider,
        tutor_name=m.tutor_name,
        tutor_color=m.tutor_color,
        available_voices=m.available_voices,
        native_language=m.native_language,
        target_language=m.target_language,
        native_tts_voice=m.native_tts_voice,
        native_tts_provider=m.native_tts_provider,
        enabled_skills=list(m.enabled_skills),
    )


@router.get("/modes", response_model=List[ModeResponse])
async def list_modes():
    return [_to_response(m) for m in get_all_modes().values()]


@router.get("/modes/{mode_id}", response_model=ModeResponse)
async def get_mode_detail(mode_id: str):
    m = get_mode(mode_id)
    if not m:
        raise HTTPException(status_code=404, detail=f"Mode '{mode_id}' not found")
    return _to_response(m)
