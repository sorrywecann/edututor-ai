"""
EduTutor.AI — STT Service
Modular speech-to-text with pluggable adapters.

Open-source priority order on Apple Silicon (MPS):
  mlx-whisper → fastest native (M1/M2/M3, uses Apple Neural Engine)
  faster-whisper → CPU int8, 3–4× faster than HF transformers
  hf-transformers → fallback when nothing else works

Cloud:
  groq-whisper → ~0.1s/clip, free tier (whisper-large-v3-turbo on Groq infra)
  openai-whisper → reliable, $0.006/min

Switch at runtime: POST /api/v1/stt/switch {"model_id": "..."}
Switch via env: STT_PROVIDER=mlx-whisper-large-v3
"""
import os
import io
import logging
import asyncio
import tempfile
import numpy as np
from dataclasses import dataclass
from typing import Optional, List

# MLX Whisper runs on the Metal GPU — concurrent calls cause a GPU assertion crash.
# This semaphore serializes all MLX transcription calls.
_MLX_GPU_LOCK = asyncio.Semaphore(1)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class TranscriptionSegment:
    text: str
    start: float
    end: float
    confidence: float


@dataclass
class TranscriptionResult:
    text: str
    language: str
    confidence: float
    segments: List[TranscriptionSegment]
    duration_seconds: float
    provider: str = ""


# ---------------------------------------------------------------------------
# Audio preprocessing — converts any browser audio to 16kHz float32
# Uses PyAV (installed with faster-whisper), no system ffmpeg needed.
# ---------------------------------------------------------------------------

def decode_audio(audio_data: bytes, format_hint: str = "webm") -> np.ndarray:
    """
    Decode browser audio (webm, ogg, mp3, wav, m4a) to 16kHz mono float32.
    PyAV handles the demux+decode without system ffmpeg.
    Falls back to a temp-file approach for formats PyAV can't stream.
    """
    try:
        import av

        container = av.open(io.BytesIO(audio_data), format=format_hint if format_hint != "webm" else None)
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
        chunks: List[np.ndarray] = []
        for frame in container.decode(audio=0):
            for rf in resampler.resample(frame):
                chunks.append(rf.to_ndarray()[0])
        container.close()
        if chunks:
            return np.concatenate(chunks).astype(np.float32)
    except Exception as e:
        logger.debug(f"PyAV stream decode failed ({e}), trying temp-file")

    # Fallback: write to temp file, open as file
    try:
        import av
        suffix = f".{format_hint}" if format_hint else ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_data)
            tmp = f.name
        container = av.open(tmp)
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
        chunks = []
        for frame in container.decode(audio=0):
            for rf in resampler.resample(frame):
                chunks.append(rf.to_ndarray()[0])
        container.close()
        os.unlink(tmp)
        if chunks:
            return np.concatenate(chunks).astype(np.float32)
    except Exception as e:
        logger.warning(f"PyAV temp-file decode failed ({e})")

    return np.zeros(16000, dtype=np.float32)  # 1s silence — model will return empty


def write_wav_temp(audio_data: bytes, format_hint: str = "webm") -> str:
    """Write decoded audio as 16kHz WAV to a temp file. Caller must unlink."""
    import soundfile as sf
    pcm = decode_audio(audio_data, format_hint)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp = f.name
    sf.write(tmp, pcm, 16000, subtype="PCM_16")
    return tmp


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------

AVAILABLE_STT_MODELS = [
    # ── MLX (Apple Silicon native — fastest local option) ────────────────
    {
        "id": "mlx-whisper-turbo",
        "name": "Whisper Large V3 Turbo [MLX — Apple Silicon ⚡]",
        "description": "Apple MLX framework. Uses Neural Engine + GPU cores. ~0.5s on M2. Best daily driver.",
        "provider": "local",
        "backend": "mlx",
        "model_id": "mlx-community/whisper-large-v3-turbo",
        "accuracy_sk": "~90%",
        "speed": "ultra fast (~0.5s M2)",
        "cost": "free",
        "languages": ["sk", "cs", "en", "de", "pl"],
        "requires": ["mlx-whisper", "Apple Silicon"],
        "recommended_on": ["mps"],
    },
    {
        "id": "mlx-whisper-large-v3",
        "name": "Whisper Large V3 [MLX — Apple Silicon, max accuracy]",
        "description": "Full large-v3 on Apple MLX. Highest local accuracy, ~2s on M2.",
        "provider": "local",
        "backend": "mlx",
        "model_id": "mlx-community/whisper-large-v3-mlx",
        "accuracy_sk": "~92%",
        "speed": "fast (~2s M2)",
        "cost": "free",
        "languages": ["sk", "cs", "en", "de", "pl"],
        "requires": ["mlx-whisper", "Apple Silicon"],
        "recommended_on": ["mps"],
    },

    # ── faster-whisper (CTranslate2 — great on CPU, excellent on CUDA) ───
    {
        "id": "faster-whisper-sk-small",
        "name": "Whisper Small [faster-whisper — fast CPU]",
        "description": "OpenAI small via CTranslate2 int8. ~85% SK, 3× faster than HF transformers.",
        "provider": "local",
        "backend": "faster-whisper",
        "model_id": "small",
        "accuracy_sk": "~85%",
        "speed": "medium (~3s CPU)",
        "cost": "free",
        "languages": ["sk", "cs", "en", "de", "pl"],
        "requires": ["faster-whisper"],
        "recommended_on": ["cpu", "cuda"],
    },

    {
        "id": "faster-whisper-large-v3",
        "name": "Whisper Large V3 [faster-whisper — multilingual]",
        "description": "OpenAI large-v3 via CTranslate2. No SK fine-tune but 90%+ accuracy natively.",
        "provider": "local",
        "backend": "faster-whisper",
        "model_id": "large-v3",
        "accuracy_sk": "~90%",
        "speed": "fast (~4s CPU, ~1s GPU)",
        "cost": "free",
        "languages": ["sk", "cs", "en", "de", "pl", "fr"],
        "requires": ["faster-whisper"],
        "recommended_on": ["cpu", "cuda"],
    },

    # ── SloPal Slovak fine-tunes (NaiveNeuron, EMNLP 2025, CC-BY-4.0) ─────
    # Trained on 2,806 hours of Slovak parliamentary speech + 60M-word corpus;
    # 65–70% WER reduction on Common Voice 21 Slovak set vs. base Whisper.
    # Parliamentary training domain biases output toward political vocabulary
    # on casual-speech inputs — base mlx/faster-whisper above remain selectable
    # for general use. faster-whisper backend loads the HF IDs directly.
    {
        "id": "slopal-whisper-small-sk",
        "name": "SloPal Whisper Small [SK fine-tune ⭐ best CPU]",
        "description": "NaiveNeuron Slovak fine-tune of Whisper Small. ~25% WER on CV21 (was 58% baseline). 244M params, runs on CPU.",
        "provider": "local",
        "backend": "faster-whisper",
        "model_id": "NaiveNeuron/whisper-small-sk",
        "accuracy_sk": "~75% (25% WER)",
        "speed": "fast (~2s CPU)",
        "cost": "free",
        "languages": ["sk"],
        "requires": ["faster-whisper"],
        "recommended_on": ["cpu"],
    },
    {
        "id": "slopal-whisper-large-v3-turbo-sk",
        "name": "SloPal Whisper Large V3 Turbo [SK fine-tune ⭐ recommended]",
        "description": "NaiveNeuron Slovak fine-tune of Whisper Large V3 Turbo. ~13% WER on CV21 (was 32% baseline). Best speed/quality balance.",
        "provider": "local",
        "backend": "faster-whisper",
        "model_id": "NaiveNeuron/whisper-large-v3-turbo-sk",
        "accuracy_sk": "~87% (13% WER)",
        "speed": "fast (~3s CPU, ~0.8s GPU)",
        "cost": "free",
        "languages": ["sk"],
        "requires": ["faster-whisper"],
        "recommended_on": ["cpu", "cuda", "mps"],
    },
    {
        "id": "slopal-whisper-large-v3-sk",
        "name": "SloPal Whisper Large V3 [SK fine-tune — max accuracy]",
        "description": "NaiveNeuron Slovak fine-tune of Whisper Large V3. ~12% WER on CV21 (was 21% baseline). Highest local SK accuracy.",
        "provider": "local",
        "backend": "faster-whisper",
        "model_id": "NaiveNeuron/whisper-large-v3-sk",
        "accuracy_sk": "~88% (12% WER)",
        "speed": "medium (~5s CPU, ~1.2s GPU)",
        "cost": "free",
        "languages": ["sk"],
        "requires": ["faster-whisper"],
        "recommended_on": ["cuda"],
    },


    # ── Cloud: Groq ───────────────────────────────────────────────────────
    {
        "id": "groq-whisper",
        "name": "Groq Whisper Large V3 Turbo [cloud — fastest overall]",
        "description": "whisper-large-v3-turbo on Groq LPU hardware. ~0.1s/clip, generous free tier.",
        "provider": "cloud",
        "backend": "groq",
        "model_id": "whisper-large-v3-turbo",
        "accuracy_sk": "~90%",
        "speed": "ultra fast (~0.1s)",
        "cost": "free tier",
        "languages": ["sk", "cs", "en", "de", "pl", "fr", "es"],
        "requires": ["GROQ_API_KEY"],
        "recommended_on": [],
    },
    # ── Cloud: OpenAI ─────────────────────────────────────────────────────
    {
        "id": "openai-whisper",
        "name": "OpenAI Whisper [cloud — reliable]",
        "description": "whisper-1 API. ~88% SK, ~0.5s latency, $0.006/min.",
        "provider": "cloud",
        "backend": "openai",
        "model_id": "whisper-1",
        "accuracy_sk": "~88%",
        "speed": "fast (~0.5s)",
        "cost": "$0.006/min",
        "languages": ["sk", "cs", "en", "de", "pl", "fr", "es"],
        "requires": ["OPENAI_API_KEY"],
        "recommended_on": [],
    },
    # Test/CI provider — never recommended_on any hardware so detect_best_provider()
    # cannot pick it accidentally. conftest sets STT_PROVIDER=mock so the entire
    # test suite runs without loading an ML model. Returns deterministic Slovak.
    {
        "id": "mock",
        "name": "Mock [tests only]",
        "description": "Deterministic stub used by the test suite. Returns 'Ahoj svet' regardless of input.",
        "provider": "local",
        "backend": "mock",
        "model_id": "mock",
        "accuracy_sk": "n/a",
        "speed": "instant",
        "cost": "free",
        "languages": ["sk", "en"],
        "requires": [],
        "recommended_on": [],
    },
]

_REGISTRY = {m["id"]: m for m in AVAILABLE_STT_MODELS}


def detect_best_provider() -> str:
    """Auto-select best available provider for the current hardware."""
    try:
        import torch
        if torch.backends.mps.is_available():
            try:
                import mlx_whisper
                return "mlx-whisper-turbo"  # Apple Silicon → MLX wins
            except ImportError:
                pass
        if torch.cuda.is_available():
            try:
                import faster_whisper  # noqa: F401
                return "faster-whisper-large-v3"
            except ImportError:
                pass
    except ImportError:
        pass

    try:
        import faster_whisper  # noqa: F401
        return "faster-whisper-sk-small"
    except ImportError:
        pass

    return "openai-whisper"


# ---------------------------------------------------------------------------
# STTService
# ---------------------------------------------------------------------------

class STTService:
    """Modular STT. Call switch_model() to hot-swap at any time — no restart needed."""

    def __init__(self):
        self._model = None
        self._provider_id: str = "uninitialized"
        self._backend: str = "uninitialized"
        self._model_name: str = ""

    async def initialize(self) -> None:
        provider_id = os.getenv("STT_PROVIDER", "").strip()
        if provider_id and provider_id in _REGISTRY:
            await self.switch_model(provider_id)
            return

        # Legacy compat
        use_local = os.getenv("USE_LOCAL_STT", "true").lower() == "true"
        openai_key = os.getenv("OPENAI_API_KEY", "")

        if use_local:
            auto = detect_best_provider()
            logger.info(f"Auto-selected STT provider: {auto}")
            await self.switch_model(auto)
        elif openai_key:
            await self.switch_model("openai-whisper")
        else:
            logger.warning("No STT configured — install faster-whisper or set OPENAI_API_KEY")
            await self.switch_model(detect_best_provider())

    async def switch_model(self, model_id: str) -> None:
        if model_id not in _REGISTRY:
            raise ValueError(f"Unknown STT model: {model_id}. Available: {sorted(_REGISTRY)}")

        entry = _REGISTRY[model_id]
        backend = entry["backend"]
        hf_model = entry["model_id"]
        logger.info(f"STT switch → {model_id} ({backend} / {hf_model})")

        if backend == "mlx":
            await self._init_mlx(hf_model)
        elif backend == "faster-whisper":
            await self._init_faster_whisper(hf_model)
        elif backend == "openai":
            key = os.getenv("OPENAI_API_KEY", "")
            if not key:
                raise RuntimeError("OPENAI_API_KEY not set")
            await self._init_openai(key)
        elif backend == "groq":
            key = os.getenv("GROQ_API_KEY", "")
            if not key:
                raise RuntimeError("GROQ_API_KEY not set")
            await self._init_groq(key)
        elif backend == "mock":
            self._model = None
        else:
            raise ValueError(f"Unknown backend: {backend}")

        self._provider_id = model_id
        self._backend = backend
        self._model_name = hf_model

    # ── Initializers ────────────────────────────────────────────────────

    async def _init_mlx(self, model_repo: str) -> None:
        """MLX Whisper — Apple Silicon native, uses Neural Engine + GPU cores."""
        try:
            import mlx_whisper  # noqa: F401
            # mlx_whisper lazy-loads the model on first transcription call,
            # so we just store the repo path as the "model"
            self._model = model_repo
            self._backend = "mlx"
            logger.info(f"MLX Whisper ready: {model_repo} (loads on first transcription)")
        except ImportError:
            raise RuntimeError(
                "mlx-whisper not installed. Run: pip install mlx-whisper. "
                "Or switch to openai-whisper: POST /api/v1/stt/switch {\"model_id\": \"openai-whisper\"}"
            )

    async def _init_faster_whisper(self, model_id: str) -> None:
        """CTranslate2 backend — 2–4× faster than HF, works on CPU/CUDA."""
        try:
            from faster_whisper import WhisperModel

            loop = asyncio.get_event_loop()

            def _load():
                try:
                    import torch
                    if torch.cuda.is_available():
                        return WhisperModel(model_id, device="cuda", compute_type="float16")
                except Exception:
                    pass
                # CPU with int8 — fast on Apple Silicon and x86
                return WhisperModel(model_id, device="cpu", compute_type="int8")

            self._model = await loop.run_in_executor(None, _load)
            self._backend = "faster-whisper"
            logger.info(f"faster-whisper loaded: {model_id}")
        except ImportError:
            raise RuntimeError("faster-whisper not installed. Run: pip install faster-whisper")
        except Exception as e:
            raise RuntimeError(f"faster-whisper init failed: {e}")



    async def _init_openai(self, api_key: str) -> None:
        try:
            from openai import AsyncOpenAI
            self._model = AsyncOpenAI(api_key=api_key)
            self._backend = "openai"
        except ImportError:
            logger.error("openai package not installed")
            self._model = None
            self._backend = "mock"

    async def _init_groq(self, api_key: str) -> None:
        try:
            from groq import AsyncGroq
            self._model = AsyncGroq(api_key=api_key)
            self._backend = "groq"
        except ImportError:
            logger.error("groq package not installed. Run: pip install groq")
            self._model = None
            self._backend = "mock"

    # ── Transcription ────────────────────────────────────────────────────

    async def transcribe(
        self,
        audio_data: bytes,
        language: Optional[str] = "sk",
        format: str = "webm",
    ) -> TranscriptionResult:
        if self._backend == "mlx":
            return await self._transcribe_mlx(audio_data, language, format)
        elif self._backend == "faster-whisper":
            return await self._transcribe_faster_whisper(audio_data, language, format)
        elif self._backend == "openai":
            return await self._transcribe_openai(audio_data, language, format)
        elif self._backend == "groq":
            return await self._transcribe_groq(audio_data, language, format)
        elif self._backend == "mock":
            return TranscriptionResult(
                text="Ahoj svet",
                language=language or "sk",
                confidence=1.0,
                segments=[],
                duration_seconds=0.0,
                provider=self._provider_id,
            )
        else:
            raise RuntimeError(f"No STT backend available (current: {self._backend})")

    async def transcribe_with_model(
        self,
        audio_data: bytes,
        model_id: str,
        language: Optional[str] = "sk",
        format: str = "webm",
    ) -> TranscriptionResult:
        if model_id != self._provider_id:
            await self.switch_model(model_id)
        return await self.transcribe(audio_data, language=language, format=format)

    async def _transcribe_mlx(
        self, audio_data: bytes, language: Optional[str], format: str
    ) -> TranscriptionResult:
        """
        MLX Whisper — Apple Silicon native.
        Passes raw numpy float32 directly; no temp file needed for most formats.
        Serialized via _MLX_GPU_LOCK to prevent concurrent Metal GPU assertion crashes.
        """
        import mlx_whisper

        loop = asyncio.get_event_loop()

        # Decode audio to 16kHz float32 numpy array using PyAV
        pcm = await loop.run_in_executor(None, decode_audio, audio_data, format)

        def _run():
            return mlx_whisper.transcribe(
                pcm,
                path_or_hf_repo=self._model,
                language=language or "sk",
                task="transcribe",
                word_timestamps=True,
                verbose=False,
            )

        async with _MLX_GPU_LOCK:
            result = await loop.run_in_executor(None, _run)

        segments = [
            TranscriptionSegment(
                text=s["text"].strip(),
                start=s["start"],
                end=s["end"],
                confidence=s.get("avg_logprob", 0.92) if "avg_logprob" in s else 0.92,
            )
            for s in result.get("segments", [])
        ]
        return TranscriptionResult(
            text=result.get("text", "").strip(),
            language=result.get("language", language or "sk"),
            confidence=0.92,
            segments=segments,
            duration_seconds=segments[-1].end if segments else 0,
            provider=self._provider_id,
        )

    async def _transcribe_faster_whisper(
        self, audio_data: bytes, language: Optional[str], format: str
    ) -> TranscriptionResult:
        loop = asyncio.get_event_loop()
        pcm = await loop.run_in_executor(None, decode_audio, audio_data, format)

        def _run():
            segs, info = self._model.transcribe(
                pcm,
                language=language or "sk",
                task="transcribe",
                beam_size=5,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 300},
                word_timestamps=True,
            )
            return list(segs), info

        segs, info = await loop.run_in_executor(None, _run)
        segments = [
            TranscriptionSegment(
                text=s.text.strip(), start=s.start, end=s.end,
                confidence=getattr(s, "avg_logprob", 0.9),
            )
            for s in segs
        ]
        full_text = " ".join(s.text for s in segments).strip()
        return TranscriptionResult(
            text=full_text,
            language=getattr(info, "language", language or "sk"),
            confidence=getattr(info, "language_probability", 0.92),
            segments=segments,
            duration_seconds=getattr(info, "duration", segments[-1].end if segments else 0),
            provider=self._provider_id,
        )



    async def _transcribe_openai(
        self, audio_data: bytes, language: Optional[str], format: str
    ) -> TranscriptionResult:
        with tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False) as f:
            f.write(audio_data)
            tmp = f.name
        try:
            with open(tmp, "rb") as af:
                resp = await self._model.audio.transcriptions.create(
                    model="whisper-1", file=af, language=language,
                    response_format="verbose_json",
                )
            segments = [
                TranscriptionSegment(text=s.text.strip(), start=s.start, end=s.end, confidence=0.9)
                for s in getattr(resp, "segments", [])
            ]
            return TranscriptionResult(
                text=resp.text.strip(),
                language=getattr(resp, "language", language or "sk"),
                confidence=0.92, segments=segments,
                duration_seconds=getattr(resp, "duration", 0),
                provider=self._provider_id,
            )
        finally:
            os.unlink(tmp)

    async def _transcribe_groq(
        self, audio_data: bytes, language: Optional[str], format: str
    ) -> TranscriptionResult:
        with tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False) as f:
            f.write(audio_data)
            tmp = f.name
        try:
            with open(tmp, "rb") as af:
                resp = await self._model.audio.transcriptions.create(
                    model="whisper-large-v3-turbo", file=af,
                    language=language or "sk", response_format="verbose_json",
                )
            return TranscriptionResult(
                text=resp.text.strip(),
                language=getattr(resp, "language", language or "sk"),
                confidence=0.92, segments=[],
                duration_seconds=getattr(resp, "duration", 0),
                provider=self._provider_id,
            )
        finally:
            os.unlink(tmp)



    @property
    def provider(self) -> str:
        return self._provider_id

    @property
    def model_name(self) -> str:
        return self._model_name


# ── Singleton ────────────────────────────────────────────────────────────

_stt_service: Optional[STTService] = None
_stt_service_init_lock = asyncio.Lock()


async def get_stt_service() -> STTService:
    """Get or create STT service instance (concurrency-safe via double-checked locking)."""
    global _stt_service
    if _stt_service is not None:
        return _stt_service
    async with _stt_service_init_lock:
        if _stt_service is None:
            svc = STTService()
            await svc.initialize()
            _stt_service = svc
    return _stt_service
