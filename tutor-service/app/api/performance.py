import time
from collections import deque
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_MAX_ENTRIES = 200
_turns: deque = deque(maxlen=_MAX_ENTRIES)


class TurnMetric(BaseModel):
    timestamp: float
    provider: str
    total_ms: int
    rag_ms: int
    llm_ms: int
    emotion_ms: int
    viseme_ms: int
    response_len: int
    rag_chunks: int = 0


def record_turn(
    provider: str,
    total_ms: int,
    rag_ms: int = 0,
    llm_ms: int = 0,
    emotion_ms: int = 0,
    viseme_ms: int = 0,
    response_len: int = 0,
    rag_chunks: int = 0,
) -> None:
    _turns.append(TurnMetric(
        timestamp=time.time(),
        provider=provider,
        total_ms=total_ms,
        rag_ms=rag_ms,
        llm_ms=llm_ms,
        emotion_ms=emotion_ms,
        viseme_ms=viseme_ms,
        response_len=response_len,
        rag_chunks=rag_chunks,
    ))


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0
    s = sorted(values)
    k = (len(s) - 1) * (p / 100)
    f = int(k)
    c = f + 1 if f + 1 < len(s) else f
    return s[f] + (k - f) * (s[c] - s[f])


@router.get("/performance")
async def get_performance(last: Optional[int] = 50):
    entries = list(_turns)[-min(last or 50, _MAX_ENTRIES):]
    if not entries:
        return {"turns": [], "summary": None}

    totals = [t.total_ms for t in entries]
    rags = [t.rag_ms for t in entries]
    llms = [t.llm_ms for t in entries]

    return {
        "turns": [t.dict() for t in entries],
        "summary": {
            "count": len(entries),
            "total_p50": int(_percentile(totals, 50)),
            "total_p95": int(_percentile(totals, 95)),
            "rag_avg": int(sum(rags) / len(rags)),
            "llm_avg": int(sum(llms) / len(llms)),
            "llm_p95": int(_percentile(llms, 95)),
        },
    }
