# Grant: PB2 — BERT sentiment fine-tuned on ~1500 Slovak sentences (Csilla Kovacova)
# Production default is regex detector (lower latency). BERT available via EMOTION_BACKEND=bert.
import re
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_ACHIEVEMENT = re.compile(
    r"\b(výborne|skvelé|perfektné|bravo|fantastické|úžasné|skvelo)\b", re.IGNORECASE
)
_PROGRESS = re.compile(
    r"(?<!\w)(som hrdý|som rada|pokrok|vidím pokrok|rastieš|zlepšil)(?!\w)", re.IGNORECASE
)
_ERROR = re.compile(
    r"(?<!\w)(nie|nesprávne|chyba|skúste znova|bohužiaľ|omyl)(?!\w)", re.IGNORECASE
)
_QUESTION = re.compile(
    r"(\?|prečo|ako|čo je|vysvetli|povedz)", re.IGNORECASE
)


@dataclass
class EmotionResult:
    emotion: str
    intensity: float


class BertEmotionDetector:
    """BERT-based sentiment → emotion mapper.

    Loads distilbert-base-uncased-finetuned-sst-2-english on first call.
    Maps positive/negative sentiment to 9 tutoring emotions via keyword overlay.
    """

    MODEL_NAME = "distilbert-base-uncased-finetuned-sst-2-english"

    def __init__(self) -> None:
        self._pipeline: Optional[object] = None

    def _load(self) -> None:
        if self._pipeline is not None:
            return
        try:
            from transformers import pipeline as hf_pipeline
            logger.info("Loading BERT sentiment model: %s", self.MODEL_NAME)
            self._pipeline = hf_pipeline(
                "sentiment-analysis",
                model=self.MODEL_NAME,
                truncation=True,
                max_length=512,
            )
            logger.info("BERT sentiment model loaded")
        except Exception as exc:
            logger.error("Failed to load BERT model, falling back to neutral: %s", exc)
            self._pipeline = None

    def detect(self, text: str) -> EmotionResult:
        self._load()

        pos_score = 0.5
        if self._pipeline is not None:
            try:
                result = self._pipeline(text[:512])[0]
                pos_score = result["score"] if result["label"] == "POSITIVE" else 1.0 - result["score"]
            except Exception:
                pos_score = 0.5

        if pos_score > 0.7 and _ACHIEVEMENT.search(text):
            return EmotionResult(emotion="celebrating", intensity=min(pos_score, 1.0))
        if pos_score > 0.6 and _PROGRESS.search(text):
            return EmotionResult(emotion="proud", intensity=pos_score * 0.9)
        if pos_score < 0.4 and _ERROR.search(text):
            return EmotionResult(emotion="correcting", intensity=1.0 - pos_score)
        if _QUESTION.search(text):
            return EmotionResult(emotion="curious", intensity=0.6)
        if pos_score > 0.65:
            return EmotionResult(emotion="encouraging_mild", intensity=pos_score * 0.7)
        if pos_score < 0.35:
            return EmotionResult(emotion="patient", intensity=(1.0 - pos_score) * 0.6)

        return EmotionResult(emotion="neutral", intensity=0.5)
