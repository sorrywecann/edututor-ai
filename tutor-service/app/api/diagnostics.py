import json
import os
import time
import logging
import re
from typing import Optional, List
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

GOLDEN_30_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "test-files", "golden_dataset", "golden_30.json"
)


class RAGBenchmarkRequest(BaseModel):
    knowledge_base: str
    top_k: int = 5
    similarity_threshold: float = 0.4
    mode: str = "auto"


class QuestionResult(BaseModel):
    id: str
    question: str
    hit: bool
    matched_keywords: list
    expected_keywords: list
    rag_score: float
    rag_chunks: int
    latency_ms: int


class RAGBenchmarkResponse(BaseModel):
    knowledge_base: str
    total_questions: int
    hits: int
    misses: int
    hit_rate: float
    avg_latency_ms: int
    avg_score: float
    mode: str
    results: list[QuestionResult]


def _extract_questions_from_chunks(chunks: List[str], max_questions: int = 20) -> List[dict]:
    topics_seen = set()
    questions = []

    for i, chunk in enumerate(chunks):
        if len(questions) >= max_questions:
            break

        lines = chunk.split('\n')
        for line in lines:
            line = line.strip()
            if len(line) < 8 or len(line) > 200:
                continue

            is_heading = (
                re.match(r'^[\d.]+\s+[A-ZÁČĎÉÍĽŇÓŔŠŤÚÝŽ]', line)
                or line.isupper() and len(line) > 10
                or re.match(r'^(Kapitola|Definícia|Veta|Tvrdenie|Príklad|Dôkaz|Úvod)', line, re.IGNORECASE)
            )
            if not is_heading:
                continue

            topic = re.sub(r'^[\d.]+\s*', '', line).strip().rstrip('.')
            topic_key = topic.lower()[:30]
            if topic_key in topics_seen:
                continue
            topics_seen.add(topic_key)

            words = re.findall(r'[a-záčďéíľňóŕšťúýžA-ZÁČĎÉÍĽŇÓŔŠŤÚÝŽ]{4,}', chunk[:500].lower())
            word_freq = {}
            for w in words:
                if w not in ('ktorý', 'každý', 'funkcie', 'podľa', 'medzi', 'alebo', 'potom', 'takže', 'príklad', 'definícia', 'kapitola', 'obsah'):
                    word_freq[w] = word_freq.get(w, 0) + 1
            keywords = sorted(word_freq, key=word_freq.get, reverse=True)[:5]
            if len(keywords) < 2:
                continue

            questions.append({
                "id": f"AUTO-{len(questions)+1:03d}",
                "question": f"Čo je {topic.lower()}?" if len(topic) < 50 else f"Vysvetli {topic.lower()[:40]}",
                "expected_keywords": keywords,
                "source_chunk": i,
            })

    return questions


async def _load_chat_history_questions(max_questions: int = 30) -> List[dict]:
    from app.database import AsyncSessionLocal
    from sqlalchemy import text

    skip_prefixes = ("začni konverzáciu", "ahoj", "mám sa", "výborne", "dobr")
    skip_patterns = re.compile(r'^[\.\s…öü]+$|^.{0,12}$')

    async with AsyncSessionLocal() as db:
        r = await db.execute(text("""
            SELECT DISTINCT content FROM messages
            WHERE role = 'USER' AND LENGTH(content) > 15
            ORDER BY created_at DESC
            LIMIT 100
        """))
        rows = r.fetchall()

    questions = []
    seen = set()
    for (content,) in rows:
        if len(questions) >= max_questions:
            break
        text_clean = content.strip()
        text_lower = text_clean.lower()
        if skip_patterns.match(text_clean):
            continue
        if any(text_lower.startswith(p) for p in skip_prefixes):
            continue
        key = text_lower[:40]
        if key in seen:
            continue
        seen.add(key)

        words = re.findall(r'[a-záčďéíľňóŕšťúýž]{4,}', text_lower)
        keywords = list(dict.fromkeys(words))[:5]

        questions.append({
            "id": f"CHAT-{len(questions)+1:03d}",
            "question": text_clean[:150],
            "expected_keywords": keywords,
            "source": "chat_history",
        })

    return questions


async def _auto_generate_from_kb(rag, knowledge_base: str, max_questions: int = 10) -> List[dict]:
    collection_name = None
    for c in rag._client.list_collections():
        if c.name.lower() == knowledge_base.lower() or knowledge_base.lower() in c.name.lower():
            collection_name = c.name
            break
    if not collection_name:
        return []

    try:
        col = rag._client.get_collection(collection_name)
        sample = col.get(limit=min(col.count(), 80), include=["documents"])
        docs = sample.get("documents", [])
        return _extract_questions_from_chunks(docs, max_questions=max_questions)
    except Exception as e:
        logger.warning(f"Auto-question generation failed: {e}")
        return []


@router.post("/diagnostics/rag", response_model=RAGBenchmarkResponse)
async def run_rag_benchmark(req: RAGBenchmarkRequest):
    from app.services.rag_service import get_rag_service

    rag = await get_rag_service()
    questions = []

    if req.mode == "golden" and os.path.exists(GOLDEN_30_PATH):
        with open(GOLDEN_30_PATH, "r") as f:
            questions = json.load(f)
    elif req.mode == "chat_history":
        questions = await _load_chat_history_questions()
    else:
        questions = await _load_chat_history_questions()
        if len(questions) < 5:
            auto_qs = await _auto_generate_from_kb(rag, req.knowledge_base)
            questions.extend(auto_qs)

    if not questions:
        return RAGBenchmarkResponse(
            knowledge_base=req.knowledge_base, total_questions=0,
            hits=0, misses=0, hit_rate=0, avg_latency_ms=0, avg_score=0,
            mode=req.mode, results=[],
        )

    results = []
    hits = 0

    for q in questions:
        t0 = time.perf_counter()
        try:
            search_results = await rag.search(
                query=q["question"],
                knowledge_base=req.knowledge_base,
                top_k=req.top_k,
                similarity_threshold=req.similarity_threshold,
            )
        except Exception as e:
            logger.warning(f"RAG search failed for {q.get('id', '?')}: {e}")
            search_results = []

        latency_ms = int((time.perf_counter() - t0) * 1000)

        combined_text = " ".join(r.get("content", "") for r in search_results).lower()
        expected = q.get("expected_keywords", [])
        matched = [kw for kw in expected if kw.lower() in combined_text]

        best_score = max((r.get("score", 0) for r in search_results), default=0)

        is_hit = (
            best_score >= 0.70
            or len(matched) >= 2
            or (len(expected) <= 2 and len(matched) >= 1)
        )

        if is_hit:
            hits += 1

        results.append(QuestionResult(
            id=q.get("id", f"Q-{len(results)+1}"),
            question=q["question"],
            hit=is_hit,
            matched_keywords=matched,
            expected_keywords=expected,
            rag_score=round(best_score, 3),
            rag_chunks=len(search_results),
            latency_ms=latency_ms,
        ))

    total = len(questions)
    avg_lat = int(sum(r.latency_ms for r in results) / total) if total else 0
    avg_score = round(sum(r.rag_score for r in results) / total, 3) if total else 0

    return RAGBenchmarkResponse(
        knowledge_base=req.knowledge_base,
        total_questions=total,
        hits=hits,
        misses=total - hits,
        hit_rate=round(hits / total, 3) if total else 0,
        avg_latency_ms=avg_lat,
        avg_score=avg_score,
        mode="auto" if req.mode != "golden" else "golden",
        results=results,
    )


@router.get("/diagnostics/rag/chunks/{knowledge_base}")
async def view_chunks(knowledge_base: str, page: int = 1, per_page: int = 20):
    from app.services.rag_service import get_rag_service

    rag = await get_rag_service()

    collection_name = None
    for c in rag._client.list_collections():
        if c.name.lower() == knowledge_base.lower() or knowledge_base.lower() in c.name.lower():
            collection_name = c.name
            break
    if not collection_name:
        safe = re.sub(r"[^a-zA-Z0-9_-]", "_", knowledge_base)
        if not safe[0].isalnum():
            safe = "kb_" + safe
        collection_name = safe[:63]

    try:
        col = rag._client.get_collection(collection_name)
        total = col.count()
        offset = (page - 1) * per_page

        data = col.get(
            limit=per_page,
            offset=offset,
            include=["documents", "metadatas"],
        )

        chunks = []
        docs = data.get("documents", [])
        metas = data.get("metadatas", [])
        ids = data.get("ids", [])

        for i, (doc, meta, cid) in enumerate(zip(docs, metas, ids)):
            meta = meta or {}
            chunks.append({
                "id": cid,
                "content": doc[:500] if doc else "",
                "full_length": len(doc) if doc else 0,
                "source": meta.get("source", "unknown"),
                "page": meta.get("page"),
                "chunk_index": offset + i,
            })

        return {
            "knowledge_base": knowledge_base,
            "chunks": chunks,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        }
    except Exception as e:
        logger.warning(f"Chunk listing failed: {e}")
        return {
            "knowledge_base": knowledge_base,
            "chunks": [], "total": 0, "page": 1, "per_page": per_page, "total_pages": 0,
        }


@router.get("/diagnostics/rag/golden-questions")
async def list_golden_questions():
    if not os.path.exists(GOLDEN_30_PATH):
        return {"questions": [], "count": 0}
    with open(GOLDEN_30_PATH, "r") as f:
        questions = json.load(f)
    return {
        "questions": [{"id": q["id"], "question": q["question"], "subject": q["subject"], "difficulty": q["difficulty"]} for q in questions],
        "count": len(questions),
    }
