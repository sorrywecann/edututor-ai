"""
EduTutor.AI - Notes API
"""
import logging
import uuid
from typing import List

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.knowledge_base import KnowledgeBase as KBModel
from app.models.note import Note as NoteModel
from app.schemas.note import (
    NoteCreate,
    NoteUpdate,
    NoteResponse,
    SaveFromChatRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "/knowledge-bases/{kb_name}/notes",
    response_model=List[NoteResponse],
)
async def list_notes(kb_name: str, db: AsyncSession = Depends(get_db)):
    kb_result = await db.execute(select(KBModel).where(KBModel.name == kb_name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_name}' not found"
        )

    notes_result = await db.execute(
        select(NoteModel)
        .where(NoteModel.knowledge_base_id == kb.id)
        .order_by(NoteModel.updated_at.desc())
    )
    return list(notes_result.scalars().all())


@router.post(
    "/knowledge-bases/{kb_name}/notes",
    response_model=NoteResponse,
    status_code=201,
)
async def create_note(
    kb_name: str,
    request: NoteCreate,
    db: AsyncSession = Depends(get_db),
):
    kb_result = await db.execute(select(KBModel).where(KBModel.name == kb_name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_name}' not found"
        )

    note = NoteModel(
        knowledge_base_id=kb.id,
        title=request.title,
        content=request.content,
        source_type=request.source_type,
        source_message_id=request.source_message_id,
        source_references=request.source_references,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch(
    "/knowledge-bases/{kb_name}/notes/{note_id}",
    response_model=NoteResponse,
)
async def update_note(
    kb_name: str,
    note_id: str,
    request: NoteUpdate,
    db: AsyncSession = Depends(get_db),
):
    kb_result = await db.execute(select(KBModel).where(KBModel.name == kb_name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{kb_name}' not found")
    result = await db.execute(select(NoteModel).where(NoteModel.id == note_id))
    note = result.scalar_one_or_none()
    if not note or note.knowledge_base_id != kb.id:
        raise HTTPException(status_code=404, detail=f"Note '{note_id}' not found")

    if request.title is not None:
        note.title = request.title
    if request.content is not None:
        note.content = request.content

    await db.commit()
    await db.refresh(note)
    return note


@router.delete(
    "/knowledge-bases/{kb_name}/notes/{note_id}",
    status_code=204,
)
async def delete_note(
    kb_name: str,
    note_id: str,
    db: AsyncSession = Depends(get_db),
):
    kb_result = await db.execute(select(KBModel).where(KBModel.name == kb_name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{kb_name}' not found")
    result = await db.execute(select(NoteModel).where(NoteModel.id == note_id))
    note = result.scalar_one_or_none()
    if not note or note.knowledge_base_id != kb.id:
        raise HTTPException(status_code=404, detail=f"Note '{note_id}' not found")

    await db.delete(note)
    await db.commit()


@router.post(
    "/knowledge-bases/{kb_name}/notes/from-chat",
    response_model=NoteResponse,
    status_code=201,
)
async def save_from_chat(
    kb_name: str,
    request: SaveFromChatRequest,
    db: AsyncSession = Depends(get_db),
):
    kb_result = await db.execute(select(KBModel).where(KBModel.name == kb_name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{kb_name}' not found"
        )

    note = NoteModel(
        knowledge_base_id=kb.id,
        title=request.title,
        content=request.content,
        source_type="saved_from_chat",
        source_references=request.source_references,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note
