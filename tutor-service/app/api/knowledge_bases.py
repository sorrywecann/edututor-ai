"""
EduTutor.AI - Knowledge Bases API
API endpoints for knowledge base management with RAG
"""

import asyncio
import logging
import re
import time
import uuid
from typing import List, Optional

from fastapi import (
    APIRouter,
    HTTPException,
    UploadFile,
    File,
    Query,
    Depends,
    BackgroundTasks,
    Request,
)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, AsyncSessionLocal
from app.models.knowledge_base import (
    KnowledgeBase as KBModel,
    Document as DocModel,
    DocumentStatus as DBDocStatus,
)
from app.schemas.knowledge_base import (
    DocumentUploadResponse,
    DocumentDetail,
    DocumentUpdate,
    SearchQuery,
    SearchResult,
    SearchResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
    DocumentStatus,
)
from app.services.rag_service import RAGService, get_rag_service
from app.services.llm_service import get_llm_service, ChatMessage as LLMChatMessage
from app.schemas.knowledge_base import ContextChunk

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/knowledge-bases", response_model=KnowledgeBaseResponse)
async def create_knowledge_base(
    request: KnowledgeBaseCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new knowledge base.

    - **name**: Unique identifier (alphanumeric, dashes, underscores)
    - **description**: Optional description
    """
    result = await db.execute(select(KBModel).where(KBModel.name == request.name))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=400, detail=f"Knowledge base '{request.name}' already exists"
        )

    kb = KBModel(
        name=request.name,
        description=request.description,
        weaviate_collection=request.name.replace("-", "_").title(),
        document_count=0,
        total_chunks=0,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)

    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        document_count=kb.document_count,
        total_chunks=kb.total_chunks,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
    )


@router.get("/knowledge-bases", response_model=List[KnowledgeBaseResponse])
async def list_knowledge_bases(db: AsyncSession = Depends(get_db)):
    """List all knowledge bases"""
    result = await db.execute(select(KBModel))
    kbs = result.scalars().all()
    return [
        KnowledgeBaseResponse(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            document_count=kb.document_count,
            total_chunks=kb.total_chunks,
            created_at=kb.created_at,
            updated_at=kb.updated_at,
        )
        for kb in kbs
    ]


@router.get("/knowledge-bases/{name}", response_model=KnowledgeBaseResponse)
async def get_knowledge_base(name: str, db: AsyncSession = Depends(get_db)):
    """Get knowledge base details"""
    result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{name}' not found"
        )
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        document_count=kb.document_count,
        total_chunks=kb.total_chunks,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
    )


@router.delete("/knowledge-bases/{name}")
async def delete_knowledge_base(name: str, db: AsyncSession = Depends(get_db)):
    """Delete a knowledge base and all its documents"""
    result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{name}' not found"
        )

    # Delete from vector store
    try:
        rag_service = await get_rag_service()
        await rag_service.delete_collection(name)
    except Exception as e:
        logger.warning(f"Could not delete collection from vector store: {e}")

    await db.delete(kb)
    await db.commit()
    return {"status": "deleted", "name": name}


@router.patch("/knowledge-bases/{name}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(
    name: str,
    update: KnowledgeBaseUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Rename a knowledge base and/or update its description."""
    result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{name}' not found")

    if update.name is not None and update.name != name:
        existing = await db.execute(
            select(KBModel).where(KBModel.name == update.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400, detail=f"Name '{update.name}' already taken"
            )
        kb.name = update.name
    if update.description is not None:
        kb.description = update.description

    await db.commit()
    await db.refresh(kb)
    return KnowledgeBaseResponse(
        id=kb.id, name=kb.name, description=kb.description,
        document_count=kb.document_count, total_chunks=kb.total_chunks,
        created_at=kb.created_at, updated_at=kb.updated_at,
    )


@router.delete("/knowledge-bases/{name}/documents")
async def clear_knowledge_base_documents(
    name: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete all documents from a knowledge base (keep the KB itself)."""
    result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{name}' not found")

    doc_result = await db.execute(
        select(DocModel).where(DocModel.knowledge_base_id == kb.id)
    )
    docs = doc_result.scalars().all()
    for doc in docs:
        await db.delete(doc)

    try:
        rag_service = await get_rag_service()
        await rag_service.delete_collection(name)
    except Exception as e:
        logger.warning(f"Could not delete vector collection for '{name}': {e}")

    # Reset counters
    kb.document_count = 0
    kb.total_chunks = 0
    await db.commit()
    return {"status": "cleared", "name": name, "documents_removed": len(docs)}


async def process_document_background(
    document_id: str,
    content: bytes,
    filename: str,
    file_type: str,
    knowledge_base: str,
):
    """Background task to process and index document"""
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(DocModel).where(DocModel.id == document_id)
            )
            doc = result.scalar_one_or_none()
            if not doc:
                logger.error(f"Document {document_id} not found in DB")
                return

            doc.status = DBDocStatus.PROCESSING
            await db.commit()
            await db.refresh(doc)

            rag_service = await get_rag_service()
            result_data = await rag_service.process_document(
                content=content,
                filename=filename,
                file_type=file_type,
                knowledge_base=knowledge_base,
                document_id=document_id,
            )

            doc.status = DBDocStatus.COMPLETED
            doc.chunk_count = result_data["chunk_count"]
            doc.token_count = result_data["token_count"]

            # Update KB stats
            kb_result = await db.execute(
                select(KBModel).where(KBModel.name == knowledge_base)
            )
            kb = kb_result.scalar_one_or_none()
            if kb:
                kb.document_count += 1
                kb.total_chunks += result_data["chunk_count"]

            await db.commit()
            logger.info(
                f"Document {document_id} processed: {result_data['chunk_count']} chunks"
            )

        except Exception as e:
            logger.error(f"Failed to process document {document_id}: {e}")
            try:
                async with AsyncSessionLocal() as db2:
                    result = await db2.execute(
                        select(DocModel).where(DocModel.id == document_id)
                    )
                    doc = result.scalar_one_or_none()
                    if doc:
                        doc.status = DBDocStatus.FAILED
                        doc.error_message = str(e)
                        await db2.commit()
            except Exception as e2:
                logger.error(f"Failed to update error status for document {document_id}: {e2}")


@router.post("/knowledge-bases/{name}/documents", response_model=DocumentUploadResponse)
async def upload_document(
    name: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a document to the knowledge base.

    - **name**: Knowledge base name
    - **file**: Document file (PDF, DOCX, XLSX, TXT, MD)

    The document will be processed asynchronously:
    1. Text extraction
    2. Chunking
    3. Embedding generation
    4. Vector storage in Weaviate
    """
    # Validate file type
    allowed_types = {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "text/plain": "txt",
        "text/markdown": "md",
    }

    content_type = file.content_type or "application/octet-stream"

    # Also check by extension
    ext = file.filename.split(".")[-1].lower() if file.filename else ""
    ext_to_type = {
        "pdf": "pdf",
        "docx": "docx",
        "xlsx": "xlsx",
        "txt": "txt",
        "md": "md",
    }

    file_type = allowed_types.get(content_type) or ext_to_type.get(ext)

    if not file_type:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Supported: PDF, DOCX, XLSX, TXT, MD",
        )

    content = await file.read()
    file_size = len(content)

    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file_size // (1024*1024)}MB. Maximum is 50MB.",
        )

    # Get or auto-create knowledge base
    result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = result.scalar_one_or_none()
    if not kb:
        kb = KBModel(
            name=name,
            description=f"Auto-created for {name}",
            weaviate_collection=name.replace("-", "_").title(),
            document_count=0,
            total_chunks=0,
        )
        db.add(kb)
        await db.flush()
        await db.refresh(kb)

    document_id = str(uuid.uuid4())
    safe_filename = re.sub(r'[^\w.\- ]', '', file.filename or "unnamed")[:255]
    doc = DocModel(
        id=document_id,
        knowledge_base_id=kb.id,
        filename=safe_filename,
        file_type=file_type,
        file_size=file_size,
        status=DBDocStatus.PENDING,
        chunk_count=0,
        token_count=0,
    )
    db.add(doc)
    await db.commit()  # commit before background task so it can find the row

    # Process in background
    background_tasks.add_task(
        process_document_background,
        document_id,
        content,
        safe_filename,
        file_type,
        name,
    )

    return DocumentUploadResponse(
        document_id=document_id,
        filename=safe_filename,
        file_type=file_type,
        file_size=file_size,
        status=DocumentStatus.PENDING,
        chunk_count=0,
        token_count=0,
    )


@router.get("/knowledge-bases/{name}/documents", response_model=List[DocumentDetail])
async def list_documents(name: str, db: AsyncSession = Depends(get_db)):
    """List all documents in a knowledge base"""
    kb_result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(
            status_code=404, detail=f"Knowledge base '{name}' not found"
        )

    docs_result = await db.execute(
        select(DocModel).where(DocModel.knowledge_base_id == kb.id)
    )
    docs = docs_result.scalars().all()
    return [
        DocumentDetail(
            id=d.id,
            knowledge_base_id=d.knowledge_base_id,
            filename=d.filename,
            file_type=d.file_type,
            file_size=d.file_size,
            status=d.status.value,
            chunk_count=d.chunk_count,
            token_count=d.token_count,
            context_mode=d.context_mode,
            error_message=d.error_message,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in docs
    ]


@router.get(
    "/knowledge-bases/{name}/documents/{document_id}", response_model=DocumentDetail
)
async def get_document(name: str, document_id: str, db: AsyncSession = Depends(get_db)):
    """Get document details and processing status"""
    result = await db.execute(select(DocModel).where(DocModel.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=404, detail=f"Document '{document_id}' not found"
        )
    return DocumentDetail(
        id=doc.id,
        knowledge_base_id=doc.knowledge_base_id,
        filename=doc.filename,
        file_type=doc.file_type,
        file_size=doc.file_size,
        status=doc.status.value,
        chunk_count=doc.chunk_count,
        token_count=doc.token_count,
        context_mode=doc.context_mode,
        error_message=doc.error_message,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.patch("/documents/{document_id}", response_model=DocumentDetail)
async def update_document(document_id: str, payload: DocumentUpdate, db: AsyncSession = Depends(get_db)):
    """Update document settings such as context mode."""
    result = await db.execute(select(DocModel).where(DocModel.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=404, detail=f"Document '{document_id}' not found"
        )

    doc.context_mode = payload.context_mode
    await db.commit()
    await db.refresh(doc)

    return DocumentDetail(
        id=doc.id,
        knowledge_base_id=doc.knowledge_base_id,
        filename=doc.filename,
        file_type=doc.file_type,
        file_size=doc.file_size,
        status=doc.status.value,
        chunk_count=doc.chunk_count,
        token_count=doc.token_count,
        context_mode=doc.context_mode,
        error_message=doc.error_message,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.get("/documents/{document_id}/content")
async def get_document_content(document_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocModel).where(DocModel.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    kb_result = await db.execute(select(KBModel).where(KBModel.id == doc.knowledge_base_id))
    kb = kb_result.scalar_one_or_none()
    kb_name = kb.name if kb else ""

    rag_service = await get_rag_service()
    content = ""
    try:
        chunks = await rag_service.get_document_chunks(document_id, kb_name)
        content = "\n\n".join(chunks)
    except Exception as e:
        logger.warning(f"Failed to get chunks for {document_id}: {e}")

    return {
        "document_id": document_id,
        "filename": doc.filename,
        "file_type": doc.file_type,
        "content": content or f"[{doc.filename} — obsah zatiaľ nedostupný]",
    }


@router.delete("/knowledge-bases/{name}/documents/{document_id}")
async def delete_document(name: str, document_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a document from the knowledge base"""
    result = await db.execute(select(DocModel).where(DocModel.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=404, detail=f"Document '{document_id}' not found"
        )

    # Update KB stats
    kb_result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = kb_result.scalar_one_or_none()
    if kb:
        kb.document_count = max(0, kb.document_count - 1)
        kb.total_chunks = max(0, kb.total_chunks - doc.chunk_count)

    # Delete from vector store
    try:
        rag_service = await get_rag_service()
        await rag_service.delete_document(document_id, name)
    except Exception as e:
        logger.warning(f"Could not delete from vector store: {e}")

    await db.delete(doc)
    await db.commit()
    return {"status": "deleted", "document_id": document_id}


@router.get("/knowledge-bases/{name}/query", response_model=SearchResponse)
async def query_knowledge_base(
    name: str,
    q: str = Query(..., description="Search query", min_length=1),
    top_k: int = Query(5, ge=1, le=20, description="Number of results"),
    threshold: float = Query(0.7, ge=0.0, le=1.0, description="Similarity threshold"),
    search_type: str = Query("vector", description="vector | text | hybrid"),
    db: AsyncSession = Depends(get_db),
):
    kb_result = await db.execute(select(KBModel).where(KBModel.name == name))
    if not kb_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Knowledge base '{name}' not found")

    start_time = time.time()
    try:
        if search_type == "text":
            from app.services.fts_service import text_search as fts_search
            fts_results = await fts_search(q, top_k)
            search_results = [
                SearchResult(content=r["content"], score=1.0, metadata={"source": "", "page": 0, "document_id": r["document_id"], "chunk_index": 0}, document_id=r["document_id"], chunk_index=0)
                for r in fts_results
            ]
        else:
            rag_service = await get_rag_service()
            results = await rag_service.search(query=q, knowledge_base=name, top_k=top_k, similarity_threshold=threshold)
            search_results = [
                SearchResult(content=r["content"], score=r["score"], metadata=r["metadata"], document_id=r.get("document_id"), chunk_index=r.get("chunk_index"))
                for r in results
            ]

        search_time = (time.time() - start_time) * 1000
        return SearchResponse(results=search_results, query=q, total_results=len(search_results), search_time_ms=search_time)
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/knowledge-bases/{name}/query", response_model=SearchResponse)
async def query_knowledge_base_post(
    name: str,
    query: SearchQuery,
    db: AsyncSession = Depends(get_db),
):
    """
    Search the knowledge base (POST version for complex queries).

    Allows filtering by metadata and more complex query options.
    """
    return await query_knowledge_base(
        name=name,
        q=query.query,
        top_k=query.top_k,
        threshold=query.similarity_threshold,
        db=db,
    )


class AskRequest(BaseModel):
    question: str


@router.post("/knowledge-bases/{name}/ask")
async def ask_knowledge_base(
    name: str,
    payload: AskRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """One-shot comprehensive answer across ALL sources — no manual context selection.

    Phase 8a: uses request.state.user_id for audit logging (set by
    UserIdentityMiddleware; never None on routed requests).
    Hardening: 60s timeout on the LLM call (504 instead of hang).
    """
    from app.api.chat import _format_context_for_prompt, _resolve_active_document_ids

    kb_result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{name}' not found")

    start = time.time()
    rag = await get_rag_service()
    active_ids = await _resolve_active_document_ids(db, name, None)

    chunks = await rag.search_with_metadata(
        query=payload.question, knowledge_base=name,
        top_k=15, similarity_threshold=0.4, document_ids=active_ids,
    )

    context = _format_context_for_prompt(chunks) if chunks else ""
    llm = await get_llm_service()
    system = llm.get_system_prompt()
    if context:
        system += f"\n\nPOUŽI TIETO INFORMÁCIE:\n{context}\n\nODPOVEDZ KOMPLEXNE A CITUJ ZDROJE V TVARE [Zdroj N]."
    else:
        system += "\n\nV DATABÁZE ZNALOSTÍ NEBOLI NÁJDENÉ ŽIADNE RELEVANTNÉ INFORMÁCIE."

    messages = [LLMChatMessage(role="system", content=system), LLMChatMessage(role="user", content=payload.question)]

    try:
        answer = await asyncio.wait_for(
            llm.generate(messages, max_tokens=1024, temperature=0.3),
            timeout=60.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Ask query timed out after 60s")

    latency_ms = int((time.time() - start) * 1000)
    user_id = getattr(request.state, "user_id", "anonymous") or "anonymous"
    logger.info(f"ask: kb={name} user={user_id[:8]} chunks={len(chunks)} latency_ms={latency_ms}")

    return {
        "question": payload.question,
        "answer": answer,
        "sources": [chunk.model_dump() for chunk in chunks],
        "latency_ms": latency_ms,
    }


class PodcastRequest(BaseModel):
    format: str = "summary"  # summary | deep-dive


@router.post("/knowledge-bases/{name}/podcast")
async def generate_podcast(name: str, request: PodcastRequest, db: AsyncSession = Depends(get_db)):
    """Generate a podcast-style audio summary from KB sources."""
    from app.services.tts_service import get_tts_service
    import base64 as b64

    kb_result = await db.execute(select(KBModel).where(KBModel.name == name))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{name}' not found")

    start = time.time()
    rag = await get_rag_service()
    chunks = await rag.search_with_metadata(query="zhrnutie hlavné body", knowledge_base=name, top_k=10, similarity_threshold=0.4)
    context = "\n\n".join([f"[{c.filename}] {c.content}" for c in chunks]) if chunks else ""

    llm = await get_llm_service()
    if request.format == "deep-dive":
        prompt = f"Vytvor podcastový scenár (slovensky, ~3-5 minút čítania) na základe týchto materiálov. Začni úvodom, potom rozveď hlavné body, a zakonči zhrnutím. Piš prirodzene, ako keby si hovoril k poslucháčovi:\n\n{context}"
    else:
        prompt = f"Vytvor krátky podcastový sumár (slovensky, ~1-2 minúty čítania) z týchto materiálov. Piš prirodzene a pútavo:\n\n{context}"

    messages = [LLMChatMessage(role="system", content="Si EduTutor — tvoríš vzdelávacie podcasty."), LLMChatMessage(role="user", content=prompt)]
    script = await llm.generate(messages, max_tokens=800, temperature=0.7)

    audio_b64 = ""
    try:
        tts = await get_tts_service()
        result = await tts.synthesize_with_options(script, provider="edge", voice="sk-SK-LukasNeural")
        audio_b64 = b64.b64encode(result.audio_data).decode()
    except Exception as e:
        logger.warning(f"TTS failed for podcast: {e}")

    return {
        "title": f"Podcast — {name}",
        "script": script,
        "audio_base64": audio_b64,
        "format": request.format,
        "latency_ms": int((time.time() - start) * 1000),
    }
