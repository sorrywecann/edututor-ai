# tutor-service/app/api/emotion.py
"""Runtime emotion detection backend switching."""
import os
import logging
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class EmotionSwitchRequest(BaseModel):
    backend: str


@router.get("/emotion/status")
async def emotion_status():
    current = os.environ.get("EMOTION_BACKEND", "regex")

    bert_available = False
    bert_reason = "Model not found"
    model_dir = os.path.join(
        os.path.dirname(__file__), "..", "..", "models", "sentiment", "output", "edututor-sentiment-sk"
    )
    if os.path.isdir(model_dir):
        bert_available = True
        bert_reason = "Ready"

    return {
        "active": current,
        "backends": {
            "regex": {"available": True, "reason": "Rule-based, fast, no GPU needed"},
            "bert": {
                "available": bert_available,
                "reason": bert_reason,
            },
        },
    }


@router.post("/emotion/switch")
async def switch_emotion(request: EmotionSwitchRequest):
    backend = request.backend.strip().lower()
    if backend not in ("regex", "bert"):
        return {"success": False, "error": f"Unknown backend: {backend}. Use 'regex' or 'bert'."}

    if backend == "bert":
        model_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "models", "sentiment", "output", "edututor-sentiment-sk"
        )
        if not os.path.isdir(model_dir):
            return {"success": False, "error": "BERT model not found. Train with models/sentiment/train_bert_sentiment.py first."}

    os.environ["EMOTION_BACKEND"] = backend
    logger.info(f"Emotion backend switched to: {backend}")
    return {"success": True, "backend": backend}
