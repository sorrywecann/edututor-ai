"""System-prompt editor API.

Lets Settings → Persona view and edit the master system prompt per learning
mode. Edits are stored as overrides (see learning_modes._prompt_overrides /
data/prompt_overrides.json) — the original prompts/*.md files are never
touched, and a revert just drops the override.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import learning_modes as lm

router = APIRouter()


class PromptListItem(BaseModel):
    mode_id: str
    label: str
    overridden: bool


class PromptDetail(BaseModel):
    mode_id: str
    label: str
    default: str
    override: Optional[str]
    effective: str
    overridden: bool


class PromptUpdate(BaseModel):
    content: str = Field(..., min_length=1)


def _detail(mode_id: str) -> PromptDetail:
    modes = lm.get_all_modes()
    mode = modes.get(mode_id)
    if mode is None:
        raise HTTPException(status_code=404, detail=f"Unknown mode '{mode_id}'")
    default = lm.get_default_prompt(mode_id)
    overridden = lm.has_prompt_override(mode_id)
    override = lm.get_system_prompt(mode_id) if overridden else None
    return PromptDetail(
        mode_id=mode_id,
        label=mode.label,
        default=default,
        override=override,
        effective=override if override is not None else default,
        overridden=overridden,
    )


@router.get("/prompts", response_model=List[PromptListItem])
async def list_prompts() -> List[PromptListItem]:
    """All learning modes with whether each has an edited (overridden) prompt."""
    modes = lm.get_all_modes()
    return [
        PromptListItem(mode_id=mid, label=m.label, overridden=lm.has_prompt_override(mid))
        for mid, m in modes.items()
    ]


@router.get("/prompts/{mode_id}", response_model=PromptDetail)
async def get_prompt(mode_id: str) -> PromptDetail:
    """Default (from disk), current override, and the effective prompt."""
    return _detail(mode_id)


@router.put("/prompts/{mode_id}", response_model=PromptDetail)
async def set_prompt(mode_id: str, body: PromptUpdate) -> PromptDetail:
    """Save an edited prompt as the override for this mode."""
    if mode_id not in lm.get_all_modes():
        raise HTTPException(status_code=404, detail=f"Unknown mode '{mode_id}'")
    lm.set_prompt_override(mode_id, body.content)
    return _detail(mode_id)


@router.delete("/prompts/{mode_id}", response_model=PromptDetail)
async def revert_prompt(mode_id: str) -> PromptDetail:
    """Remove the override → revert to the original prompts/*.md content."""
    lm.clear_prompt_override(mode_id)
    return _detail(mode_id)
