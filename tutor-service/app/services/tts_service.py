"""EduTutor.AI - TTS Service.

Provider-abstracted Text-to-Speech with a dict-dispatch table for the
no-args path (`synthesize` → `_default_dispatch`) and an explicit
(provider, voice) path (`synthesize_with_options` → `_explicit_dispatch`).
Cloned-voice providers route through `_synthesize_clone` for reference-
audio resolution + Edge fallback.

Reachable providers (10): edge, openai, azure, azure-voice, google,
piper, kokoro, omnivoice, clone, mock. Adding a new provider is a single
entry in the relevant dispatch table — never an `if/elif` chain (project
invariant, see docs/adrs/002-dict-dispatch.md).

Dead methods retained pending removal: _synthesize_xtts_clone,
_synthesize_coqui (state attrs _xtts_*, _chatterbox_*). Unreferenced
from dispatch tables; scheduled for physical removal in the next
dispatch refactor pass.
"""

import io
import os
import logging
import asyncio
import tempfile
import wave
from typing import Optional, List, Dict, Any, Tuple, AsyncGenerator
from dataclasses import dataclass
import base64
import httpx


def _edu_userdata_dir() -> str:
    """Resolve EduTutor.AI userData root (mirrors api/tts.py _userdata_dir).

    Kept as a private duplicate to avoid an api → services import (services
    must not depend on api per the layering rule). The resolution order
    matches: EDU_USER_DATA_DIR → LOCALAPPDATA/EduTutor.AI →
    APPDATA/edututor-desktop → ~/.edututor.
    """
    if os.environ.get("EDU_USER_DATA_DIR"):
        return os.path.abspath(os.environ["EDU_USER_DATA_DIR"])
    if os.environ.get("LOCALAPPDATA"):
        return os.path.abspath(os.path.join(os.environ["LOCALAPPDATA"], "EduTutor.AI"))
    if os.environ.get("APPDATA"):
        return os.path.abspath(os.path.join(os.environ["APPDATA"], "edututor-desktop"))
    return os.path.abspath(os.path.join(os.path.expanduser("~"), ".edututor"))


def _edu_piper_binary_path() -> str:
    return os.path.abspath(os.path.join(
        _edu_userdata_dir(), "tts-engines", "piper", "piper.exe"
    ))


def _edu_piper_voice_paths(voice: str) -> Tuple[str, str, str]:
    """Per-voice (model, config, marker) under userData/tts-voices/piper/<voice>/."""
    voice_dir = os.path.abspath(os.path.join(
        _edu_userdata_dir(), "tts-voices", "piper", voice
    ))
    return (
        os.path.join(voice_dir, f"{voice}.onnx"),
        os.path.join(voice_dir, f"{voice}.onnx.json"),
        os.path.join(voice_dir, ".installed"),
    )

from app.config.tts_config import TTS_CONFIG, tts_config, SSML_TEMPLATE

logger = logging.getLogger(__name__)

OPENAI_TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
OPENAI_TTS_MODELS = ["tts-1", "tts-1-hd"]

# ── Kokoro preset voice → language code map ────────────────────────────────
# Language codes: a=American EN, b=British EN, e=Spanish, f=French,
#                 h=Hindi, i=Italian, j=Japanese, p=Portuguese, z=Chinese
KOKORO_LANG_MAP = {
    "af_": "a", "am_": "a",  # American English
    "bf_": "b", "bm_": "b",  # British English
    "ef_": "e", "em_": "e",  # Spanish
    "ff_": "f", "fm_": "f",  # French
    "hf_": "h", "hm_": "h",  # Hindi
    "if_": "i", "im_": "i",  # Italian
    "jf_": "j", "jm_": "j",  # Japanese
    "pf_": "p", "pm_": "p",  # Portuguese
    "zf_": "z", "zm_": "z",  # Chinese
}


def _kokoro_lang_from_voice(voice_id: str) -> str:
    """Extract Kokoro language code from preset voice ID prefix."""
    for prefix, lang in KOKORO_LANG_MAP.items():
        if voice_id.startswith(prefix):
            return lang
    return "a"  # default to American English


@dataclass
class Viseme:
    """Viseme data for lip sync"""

    offset_ms: int
    viseme_id: int


@dataclass
class TTSResult:
    """Result from TTS synthesis"""

    audio_data: bytes
    audio_format: str
    duration_ms: int
    visemes: List[Viseme]


class TTSService:
    """Service for Text-to-Speech operations"""

    def __init__(self):
        self._azure_key: Optional[str] = None
        self._azure_region: Optional[str] = None
        self._openai_key: Optional[str] = None
        self._speech_config = None
        self._provider: str = "mock"
        self._openai_voice: str = "nova"
        self._openai_model: str = "tts-1"
        self._xtts_model = None
        self._xtts_reference_wav: Optional[str] = None
        # XTTS-v2 supports: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar,
        # zh-cn, ja, hu, ko, hi — NOT sk (Slovak). Czech is the closest
        # phonetic + grammatical match (mutually intelligible with Slovak)
        # and produces materially better synthesis than English-on-Slovak-text.
        # Override via XTTS_LANGUAGE env var if the user prefers a different
        # fallback (e.g. "pl" Polish for some dialects).
        self._xtts_language: str = os.getenv("XTTS_LANGUAGE", "cs")
        self._omnivoice_model = None
        self._omnivoice_ref_wav: Optional[str] = None
        self._omnivoice_language: str = os.getenv("OMNIVOICE_LANGUAGE", "sk")
        self._kokoro_model = None
        self._kokoro_pipelines: Dict[str, Any] = {}
        self._chatterbox_model = None
        self._chatterbox_device: Optional[str] = None

    async def initialize(self) -> None:
        """Initialize TTS service - tries Edge TTS first (free & fast), then OpenAI, then Azure"""
        self._credentials_path = os.getenv(
            "GOOGLE_APPLICATION_CREDENTIALS",
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "credentials.json")
        )
        self._google_available = os.path.exists(self._credentials_path)
        if self._google_available:
            logger.info(f"Google Cloud TTS credentials found: {self._credentials_path}")
        else:
            logger.info("Google Cloud TTS not configured (set GOOGLE_APPLICATION_CREDENTIALS or place credentials.json in project root)")
        # Voices-dir is the parent of per-engine voice subtrees. The B-series
        # /api/v1/tts/install/* endpoints install Piper voices into
        # <voices-dir>/piper/<voice-id>/<voice-id>.onnx with a sibling
        # `.installed` marker file written atomically once download + checksum
        # both succeed. We continue to support the legacy flat layout
        # <piper-models-path>/<voice-id>.onnx for backward-compat with existing
        # bundles.
        self._voices_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "models")
        )
        self._piper_models_path = os.path.join(self._voices_dir, "piper")
        self._openai_key = os.getenv("OPENAI_API_KEY")
        self._azure_key = os.getenv("AZURE_SPEECH_KEY")
        self._azure_region = os.getenv("AZURE_SPEECH_REGION", "westeurope")
        self._elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")
        use_edge = os.getenv("USE_EDGE_TTS", "true").lower() == "true"

        # Priority: Edge TTS (free) > OpenAI > Azure > Mock
        if use_edge:
            self._provider = "edge"
            self._edge_voice = os.getenv("EDGE_TTS_VOICE", "sk-SK-LukasNeural")
            logger.info(f"Edge TTS initialized with voice: {self._edge_voice}")
        elif self._openai_key:
            self._provider = "openai"
            logger.info("OpenAI TTS initialized")
        elif self._azure_key:
            try:
                import azure.cognitiveservices.speech as speechsdk

                self._speech_config = speechsdk.SpeechConfig(
                    subscription=self._azure_key,
                    region=self._azure_region,
                )

                self._speech_config.set_speech_synthesis_output_format(
                    speechsdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3
                )

                self._provider = "azure"
                logger.info(f"Azure TTS initialized")

            except ImportError:
                logger.warning("azure-cognitiveservices-speech not installed")
                self._provider = "mock"
        else:
            logger.warning("No TTS API keys set, using mock TTS")
            self._provider = "mock"

    def _piper_voice_paths(self, voice_id: str) -> Tuple[str, str, str]:
        """Return (model_path, config_path, marker_path) for a Piper voice id.

        Resolves the v0.8.x nested install layout
        <voices-dir>/piper/<voice-id>/<voice-id>.onnx with a sibling
        `.installed` marker. Callers that need the legacy flat layout
        (<piper-models-path>/<voice-id>.onnx) should fall back manually —
        the marker only exists under the nested layout.
        """
        voice_dir = os.path.join(self._piper_models_path, voice_id)
        model_path = os.path.join(voice_dir, f"{voice_id}.onnx")
        config_path = os.path.join(voice_dir, f"{voice_id}.onnx.json")
        marker_path = os.path.join(voice_dir, ".installed")
        return model_path, config_path, marker_path

    def _detect_installed_local(self) -> Dict[str, bool]:
        """Probe locally-installed TTS engines.

        Returns a {engine_id: available} dict that the /api/v1/tts/providers
        endpoint folds into its `available` flag.

        - piper: ``piper.exe`` present under userData AND the
          ``sk_SK-lili-medium.onnx`` voice present AND the atomic
          ``.installed`` marker. We do NOT import the ``piper`` Python
          package — the install path switched to the standalone binary in
          v0.9.x because the embedded Python ships without pip (see
          CLAUDE.md "Bundled python MUST have python311._pth").
        - kokoro: ``kokoro`` package importable. Kokoro has no SK voice
          (KOKORO_LANG_MAP has no ``sk_`` prefix) so it ships as a non-SK
          provider only — the model itself downloads lazily on first synth.
        """
        result: Dict[str, bool] = {"piper": False, "kokoro": False}

        # ── piper ────────────────────────────────────────────────────────
        binary_path = _edu_piper_binary_path()
        model_path, _config_path, marker_path = _edu_piper_voice_paths(
            "sk_SK-lili-medium"
        )
        if (
            os.path.isfile(binary_path)
            and os.path.isfile(model_path)
            and os.path.isfile(marker_path)
        ):
            result["piper"] = True

        # ── kokoro ───────────────────────────────────────────────────────
        try:
            import kokoro  # noqa: F401
            result["kokoro"] = True
        except ImportError:
            result["kokoro"] = False

        return result

    async def reinitialize_from_env(self) -> None:
        """Re-read cloud TTS credentials from the environment and apply them.

        Called by B2's save_config after the user pastes a key into HlasTab so
        TTS picks up the new credential without a backend restart. We re-read
        OPENAI_API_KEY, AZURE_SPEECH_KEY / AZURE_SPEECH_REGION, and
        ELEVENLABS_API_KEY (the four cloud creds the UI surfaces) and rebuild
        the Azure SpeechConfig if the Azure key changed. We deliberately do
        NOT touch self._provider here — the active provider only changes via
        an explicit switch_provider() call, never as a side-effect of a key
        update.
        """
        self._openai_key = os.getenv("OPENAI_API_KEY")
        self._elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")

        new_azure_key = os.getenv("AZURE_SPEECH_KEY")
        new_azure_region = os.getenv("AZURE_SPEECH_REGION", "westeurope")
        azure_changed = (
            new_azure_key != self._azure_key
            or new_azure_region != self._azure_region
        )
        self._azure_key = new_azure_key
        self._azure_region = new_azure_region

        if azure_changed and self._azure_key:
            try:
                import azure.cognitiveservices.speech as speechsdk

                self._speech_config = speechsdk.SpeechConfig(
                    subscription=self._azure_key,
                    region=self._azure_region,
                )
                self._speech_config.set_speech_synthesis_output_format(
                    speechsdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3
                )
                logger.info("Azure SpeechConfig rebuilt from updated env")
            except ImportError:
                logger.warning("azure-cognitiveservices-speech not installed — Azure key set but unusable")
                self._speech_config = None
            except Exception as exc:
                logger.warning(f"Azure SpeechConfig rebuild failed: {exc}")
                self._speech_config = None
        elif azure_changed and not self._azure_key:
            self._speech_config = None
            logger.info("Azure SpeechConfig cleared (key removed from env)")

        logger.info(
            "TTS env reloaded: openai=%s azure=%s elevenlabs=%s",
            bool(self._openai_key),
            bool(self._azure_key),
            bool(self._elevenlabs_key),
        )

    def switch_provider(self, provider: str, voice: Optional[str] = None) -> bool:
        """Hot-swap TTS provider and optional voice at runtime. Returns True if successful."""
        valid = {"edge", "openai", "azure", "piper", "kokoro", "omnivoice", "mock"}
        if provider not in valid:
            return False
        if provider == "openai" and not self._openai_key:
            return False
        if provider == "azure" and not self._azure_key:
            return False
        self._provider = provider
        if voice:
            if provider == "edge":
                self._edge_voice = voice
            elif provider == "openai":
                self._openai_voice = voice
            elif provider == "piper":
                self._piper_voice_id = voice
            elif provider == "xtts_clone":
                self._xtts_reference_wav = voice
            elif provider == "omnivoice":
                self._omnivoice_ref_wav = voice
        logger.info(f"TTS switched to {provider}" + (f" / {voice}" if voice else ""))
        return True

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def current_voice(self) -> str:
        if self._provider == "edge":
            return getattr(self, "_edge_voice", "sk-SK-LukasNeural")
        if self._provider == "openai":
            return self._openai_voice
        if self._provider == "piper":
            return getattr(self, "_piper_voice_id", "sk_SK-lili-medium")
        if self._provider == "xtts_clone":
            return self._xtts_reference_wav or "default"
        if self._provider == "omnivoice":
            return self._omnivoice_ref_wav or "auto"
        return ""

    async def synthesize(
        self,
        text: str,
        emotion: Optional[str] = None,
        speech_rate: Optional[str] = None,
        pitch: Optional[str] = None,
        return_visemes: bool = True,
    ) -> TTSResult:
        """Synthesize speech from text using the currently-selected provider.

        Dispatches via _DEFAULT_DISPATCH (built once at instance creation)
        so adding a provider here is a single dict entry, not a new elif.
        """
        emotion = emotion or tts_config.default_emotion
        speech_rate = speech_rate or tts_config.speech_rate
        pitch = pitch or tts_config.pitch

        if self._provider == "azure":
            return await self._synthesize_azure(text, emotion, speech_rate, pitch, return_visemes)

        handler = self._default_dispatch().get(self._provider)
        if handler is None:
            return await self._synthesize_mock(text)
        return await handler(text)

    def _default_dispatch(self):
        """Provider id → bound method for the no-args 'use my configured voice' path."""
        return {
            "edge":       self._synthesize_edge,
            "openai":     self._synthesize_openai,
            "omnivoice":  self._synthesize_omnivoice,
            "mock":       self._synthesize_mock,
        }

    async def _synthesize_edge(self, text: str, voice: Optional[str] = None) -> TTSResult:
        """Synthesize with Edge TTS (free Microsoft voices).

        Wrapped in asyncio.timeout because Edge TTS is an unofficial reverse-
        engineered Microsoft endpoint and can hang indefinitely on bad days.
        Tunable via EDU_EDGE_TTS_TIMEOUT_S env var (default 15s).
        """
        import edge_tts

        timeout_s = float(os.getenv("EDU_EDGE_TTS_TIMEOUT_S", "15"))
        communicate = edge_tts.Communicate(text, voice or self._edge_voice)
        audio_data = b""

        try:
            async with asyncio.timeout(timeout_s):
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_data += chunk["data"]
        except asyncio.TimeoutError:
            raise RuntimeError(
                f"Edge TTS hung beyond {timeout_s}s — endpoint may be down. "
                "Set EDU_EDGE_TTS_TIMEOUT_S to increase, or switch provider."
            )

        word_count = len(text.split())
        duration_ms = word_count * 150

        return TTSResult(
            audio_data=audio_data,
            audio_format="audio/mp3",
            duration_ms=duration_ms,
            visemes=[],
        )

    async def _synthesize_openai(self, text: str, voice: Optional[str] = None) -> TTSResult:
        """Synthesize with OpenAI TTS API"""
        if not self._openai_key:
            raise RuntimeError("OpenAI API key not configured")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {self._openai_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._openai_model,
                    "input": text,
                    "voice": voice or self._openai_voice,
                    "response_format": "mp3",
                },
                timeout=30.0,
            )

            if response.status_code != 200:
                error_msg = response.text
                logger.error(f"OpenAI TTS failed: {error_msg}")
                raise RuntimeError(f"OpenAI TTS failed: {error_msg}")

            audio_data = response.content
            word_count = len(text.split())
            duration_ms = word_count * 150

            return TTSResult(
                audio_data=audio_data,
                audio_format="audio/mp3",
                duration_ms=duration_ms,
                visemes=[],
            )

    async def _synthesize_azure(
        self,
        text: str,
        emotion: str,
        speech_rate: str,
        pitch: str,
        return_visemes: bool,
    ) -> TTSResult:
        """Synthesize with Azure Neural Voice"""
        import azure.cognitiveservices.speech as speechsdk

        if not self._speech_config:
            raise RuntimeError("Azure TTS not initialized")

        # Build SSML
        if tts_config.enable_ssml:
            ssml = SSML_TEMPLATE.format(
                voice_name=tts_config.voice_name,
                emotion=emotion,
                rate=speech_rate,
                pitch=pitch,
                text=self._escape_ssml(text),
            )
        else:
            ssml = f"""
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sk-SK">
                <voice name="{tts_config.voice_name}">
                    {self._escape_ssml(text)}
                </voice>
            </speak>
            """

        # Create synthesizer
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=self._speech_config,
            audio_config=None,  # We want the audio data directly
        )

        visemes: List[Viseme] = []

        # Set up viseme callback if enabled
        if return_visemes and tts_config.enable_viseme:

            def viseme_callback(evt):
                visemes.append(
                    Viseme(
                        offset_ms=evt.audio_offset // 10000,  # Convert to ms
                        viseme_id=evt.viseme_id,
                    )
                )

            synthesizer.viseme_received.connect(viseme_callback)

        # Synthesize
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, synthesizer.speak_ssml_async(ssml).get
        )

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            audio_data = result.audio_data
            duration_ms = len(audio_data) // (24 * 48 // 8)  # Approximate from bitrate

            return TTSResult(
                audio_data=audio_data,
                audio_format="audio/mp3",
                duration_ms=duration_ms,
                visemes=visemes,
            )
        else:
            error = (
                result.cancellation_details.error_details
                if result.cancellation_details
                else "Unknown error"
            )
            logger.error(f"TTS synthesis failed: {error}")
            raise RuntimeError(f"TTS synthesis failed: {error}")

    async def _synthesize_coqui(self, text: str, model_name: str) -> TTSResult:
        import asyncio

        def _run_coqui():
            from TTS.api import TTS

            tts = TTS(model_name).to("cpu")
            output_path = os.path.join(
                tempfile.gettempdir(), f"coqui_output_{id(text)}.wav"
            )
            tts.tts_to_file(text=text, file_path=output_path)

            with open(output_path, "rb") as f:
                audio_data = f.read()
            os.unlink(output_path)
            return audio_data

        loop = asyncio.get_event_loop()
        audio_data = await loop.run_in_executor(None, _run_coqui)

        return TTSResult(
            audio_data=audio_data,
            audio_format="audio/wav",
            duration_ms=0,
            visemes=[],
        )

    async def _synthesize_xtts_clone(self, text: str, reference_wav: Optional[str] = None) -> TTSResult:
        import asyncio
        import wave
        import io

        ref_wav = reference_wav or self._xtts_reference_wav
        if not ref_wav:
            xtts_refs_dir = os.path.join(
                os.path.dirname(__file__), "..", "..", "models", "xtts", "references"
            )
            _AUDIO_EXTS = (".wav", ".mp3", ".m4a")
            candidates = sorted([
                f for f in os.listdir(xtts_refs_dir)
                if any(f.lower().endswith(ext) for ext in _AUDIO_EXTS)
            ]) if os.path.isdir(xtts_refs_dir) else []
            if candidates:
                ref_wav = os.path.join(xtts_refs_dir, candidates[0])
            else:
                raise RuntimeError(
                    "XTTS clone requires a reference audio file (WAV/MP3/M4A). "
                    "Place a 5-10s audio file in models/xtts/references/ "
                    "or pass a reference_wav path."
                )

        language = self._xtts_language

        def _run_xtts():
            import torch
            torch.serialization.add_safe_globals([])
            os.environ["COQUI_TOS_AGREED"] = "1"
            import torch.serialization
            _orig_load = torch.load
            def _patched_load(*a, **kw):
                kw.setdefault("weights_only", False)
                return _orig_load(*a, **kw)
            torch.load = _patched_load

            # ── transformers 5.x compat ────────────────────────────────────
            # Coqui TTS 0.22.0 imports BeamSearchScorer, ConstrainedBeamSearchScorer,
            # DisjunctiveConstraint, and PhrasalConstraint from transformers. These
            # were removed in transformers 5.x. Our code uses tts_to_file() (non-
            # streaming) so beam-search stubs are safe. Must use sys.modules because
            # transformers wraps itself in _LazyModule.
            import sys
            if "transformers" in sys.modules:
                tf_mod = sys.modules["transformers"]
                _TTS_COMPAT_NEEDS = (
                    "BeamSearchScorer",
                    "ConstrainedBeamSearchScorer",
                    "DisjunctiveConstraint",
                    "PhrasalConstraint",
                )
                for _name in _TTS_COMPAT_NEEDS:
                    if not hasattr(tf_mod, _name):
                        setattr(tf_mod, _name, type(_name, (), {}))

            from TTS.api import TTS

            if self._xtts_model is None:
                logger.info("Loading XTTS2 model (first load takes ~30s)...")
                self._xtts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
                if getattr(torch, "mps", None) and torch.mps.is_available():
                    self._xtts_model.to("mps")
                    logger.info("XTTS2 model loaded on MPS (Apple Silicon)")
                elif torch.cuda.is_available():
                    self._xtts_model.to("cuda")
                    logger.info("XTTS2 model loaded on CUDA")
                else:
                    self._xtts_model.to("cpu")
                    logger.info("XTTS2 model loaded on CPU")

            output_path = os.path.join(
                tempfile.gettempdir(), f"xtts_output_{id(text)}.wav"
            )
            self._xtts_model.tts_to_file(
                text=text,
                speaker_wav=ref_wav,
                language=language,
                file_path=output_path,
            )

            with open(output_path, "rb") as f:
                audio_data = f.read()

            os.unlink(output_path)
            return audio_data

        loop = asyncio.get_event_loop()
        audio_data = await loop.run_in_executor(None, _run_xtts)

        return TTSResult(
            audio_data=audio_data,
            audio_format="audio/wav",
            duration_ms=0,
            visemes=[],
        )

    def _numpy_to_wav_bytes(self, audio: 'np.ndarray', sample_rate: int) -> bytes:
        import wave
        import io
        import numpy as np

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            audio = np.clip(audio, -1.0, 1.0)
            int16_data = (audio * 32767).astype(np.int16)
            wav_file.writeframes(int16_data.tobytes())
        wav_buffer.seek(0)
        return wav_buffer.read()

    async def _synthesize_kokoro(self, text: str, voice: str = "af_heart") -> TTSResult:
        import asyncio
        import numpy as np

        def _run_kokoro():
            from kokoro import KModel, KPipeline

            if self._kokoro_model is None:
                logger.info("Loading Kokoro-82M model (first load downloads ~300MB)...")
                self._kokoro_model = KModel(repo_id="hexgrad/Kokoro-82M").eval()
                logger.info("Kokoro-82M loaded")

            lang_code = _kokoro_lang_from_voice(voice)

            if lang_code not in self._kokoro_pipelines:
                self._kokoro_pipelines[lang_code] = KPipeline(lang_code=lang_code)

            pipeline = self._kokoro_pipelines[lang_code]

            audio_chunks = []
            for result in pipeline(text, voice=voice, speed=1.0):
                if result.audio is not None:
                    import torch
                    chunk = result.audio
                    if isinstance(chunk, torch.Tensor):
                        chunk = chunk.detach().cpu().numpy()
                    audio_chunks.append(chunk.squeeze())

            if not audio_chunks:
                return np.zeros(24000, dtype=np.float32), 24000

            audio = np.concatenate(audio_chunks).astype(np.float32)
            return audio, 24000

        loop = asyncio.get_event_loop()
        audio, sample_rate = await loop.run_in_executor(None, _run_kokoro)

        wav_bytes = self._numpy_to_wav_bytes(audio, sample_rate)
        duration_ms = int(len(audio) / sample_rate * 1000)

        return TTSResult(
            audio_data=wav_bytes,
            audio_format="audio/wav",
            duration_ms=duration_ms,
            visemes=[],
        )

    async def _synthesize_chatterbox(self, text: str, voice: str = "chatterbox-pl") -> TTSResult:
        import asyncio
        import numpy as np

        parts = voice.split("-")
        language = parts[1] if len(parts) >= 2 else "pl"

        refs_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "models", "chatterbox", "references"
        )

        ref_audio_path = None
        if len(parts) >= 3 and parts[2] != "default":
            for ext in (".wav", ".mp3", ".m4a"):
                candidate = os.path.join(refs_dir, f"{parts[2]}{ext}")
                if os.path.exists(candidate):
                    ref_audio_path = candidate
                    break

        if ref_audio_path is None and os.path.isdir(refs_dir):
            _AUDIO_EXTS = (".wav", ".mp3", ".m4a")
            candidates = sorted([
                f for f in os.listdir(refs_dir)
                if any(f.lower().endswith(ext) for ext in _AUDIO_EXTS)
            ])
            if candidates:
                ref_audio_path = os.path.join(refs_dir, candidates[0])

        def _run_chatterbox():
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            import torch

            if self._chatterbox_model is None:
                device = "cpu"
                if getattr(torch, "mps", None) and torch.mps.is_available():
                    device = "mps"
                elif torch.cuda.is_available():
                    device = "cuda"
                self._chatterbox_device = device
                logger.info(f"Loading Chatterbox Multilingual on {device} (first load downloads ~2GB)...")
                self._chatterbox_model = ChatterboxMultilingualTTS.from_pretrained(device=device)
                logger.info("Chatterbox Multilingual loaded")

            logger.info(f"Chatterbox generating: lang={language}, ref={ref_audio_path}")

            wav = self._chatterbox_model.generate(
                text,
                language_id=language,
                audio_prompt_path=ref_audio_path,
                exaggeration=0.5,
                cfg_weight=0.5,
                temperature=0.8,
            )

            if isinstance(wav, torch.Tensor):
                audio = wav.squeeze().cpu().numpy().astype(np.float32)
            else:
                audio = np.asarray(wav, dtype=np.float32)

            sr = getattr(self._chatterbox_model, "sr", None) or 24000
            return audio, sr

        loop = asyncio.get_event_loop()
        audio, sample_rate = await loop.run_in_executor(None, _run_chatterbox)

        wav_bytes = self._numpy_to_wav_bytes(audio, sample_rate)
        duration_ms = int(len(audio) / sample_rate * 1000)

        return TTSResult(
            audio_data=wav_bytes,
            audio_format="audio/wav",
            duration_ms=duration_ms,
            visemes=[],
        )

    async def _synthesize_mock(self, text: str) -> TTSResult:
        """Generate mock TTS result for development"""
        await asyncio.sleep(0.1)  # Simulate latency

        # Generate silent audio placeholder (valid MP3 header)
        # This is a minimal valid MP3 file (silence)
        mock_audio = base64.b64decode(
            "//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"
            "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"
            "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"
        )

        # Estimate duration (rough: 150ms per word)
        word_count = len(text.split())
        duration_ms = word_count * 150

        # Generate mock visemes
        visemes = []
        for i in range(min(len(text), 20)):
            visemes.append(
                Viseme(
                    offset_ms=i * 100,
                    viseme_id=i % 22,  # 22 viseme IDs in standard set
                )
            )

        return TTSResult(
            audio_data=mock_audio,
            audio_format="audio/mp3",
            duration_ms=duration_ms,
            visemes=visemes,
        )

    async def synthesize_with_options(
        self,
        text: str,
        provider: str,
        voice: str,
    ) -> TTSResult:
        """Synthesize with explicitly specified provider and voice.

        Cloned-voice providers (xtts_clone, chatterbox) need reference-audio
        resolution before dispatch and gracefully fall back to Edge on failure.
        Other providers go straight through the dispatch table.
        """
        if provider in ("omnivoice",):
            return await self._synthesize_clone(text, provider, voice)

        handler = self._explicit_dispatch().get(provider)
        if handler is None:
            raise ValueError(f"Unknown TTS provider: {provider}")
        return await handler(text, voice)

    async def stream_chunks(
        self,
        text: str,
        provider: str,
        voice: str,
        word_boundaries: Optional[List[dict]] = None,
    ) -> AsyncGenerator[bytes, None]:
        """Yield raw audio bytes incrementally for lower time-to-first-audio.

        Edge TTS yields ~50-100ms CBR-MP3 chunks as they arrive from the
        Microsoft service (~150ms to first chunk vs ~800ms for full synthesis).
        Every other provider falls back to single-chunk emission so callers
        get identical observable behaviour regardless of provider.

        When ``word_boundaries`` is provided (a list the caller mutates as a
        side channel) AND the provider is Edge TTS, every WordBoundary event
        from communicate.stream() is appended to it as a dict
        ``{"offset_ms": int, "duration_ms": int, "text": str}``. This gives
        the caller word-level audio-aligned timing (~5ms accuracy) without
        any extra TTS roundtrip — Microsoft's Edge service emits these
        boundary events interleaved with the audio packets at no extra cost.
        Other providers do not populate the list.
        """
        if provider == "edge":
            import edge_tts
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                t = chunk.get("type")
                if t == "audio":
                    yield chunk["data"]
                elif t == "WordBoundary" and word_boundaries is not None:
                    word_boundaries.append({
                        "offset_ms": int(chunk.get("offset", 0)) // 10000,
                        "duration_ms": int(chunk.get("duration", 0)) // 10000,
                        "text": str(chunk.get("text", "")),
                    })
        else:
            result = await self.synthesize_with_options(text, provider, voice)
            yield result.audio_data

    def _explicit_dispatch(self):
        """Provider id → bound (text, voice) handler for synthesize_with_options."""
        return {
            "edge":   self._synthesize_edge,
            "openai": self._synthesize_openai,
            "azure":  self._synthesize_azure_voice,
            "google": self._synthesize_google,
            "piper":  self._synthesize_piper,
            "kokoro": self._synthesize_kokoro,
            "omnivoice": self._synthesize_omnivoice,
        }

    async def _synthesize_clone(self, text: str, provider: str, voice: str) -> TTSResult:
        """Resolve a cloned-voice reference and dispatch, falling back to Edge."""
        try:
            if provider == "omnivoice":
                refs_dir = os.path.join(os.path.dirname(__file__), "..", "..", "models", "omnivoice", "references")
                _AUDIO_EXTS = (".wav", ".mp3", ".m4a")
                audio_files = sorted([
                    f for f in os.listdir(refs_dir)
                    if any(f.lower().endswith(ext) for ext in _AUDIO_EXTS)
                ]) if os.path.isdir(refs_dir) else []
                ref_path = os.path.join(refs_dir, audio_files[0]) if audio_files else None
                return await self._synthesize_omnivoice(text, ref_path)
            raise ValueError(f"Unknown clone provider: {provider}")
        except Exception as e:
            logger.warning(f"Clone TTS failed ({provider}): {e} — falling back to Edge TTS")
            return await self._synthesize_edge(text, "sk-SK-LukasNeural")

    async def _synthesize_omnivoice(self, text: str, reference_wav: Optional[str] = None) -> TTSResult:
        import numpy as np

        ref_wav = reference_wav or self._omnivoice_ref_wav
        language = self._omnivoice_language

        def _run_omnivoice():
            nonlocal ref_wav
            from omnivoice.models.omnivoice import OmniVoice

            if self._omnivoice_model is None:
                logger.info("Loading OmniVoice model (~1.2GB, first load)...")
                self._omnivoice_model = OmniVoice.from_pretrained(
                    "k2-fsa/OmniVoice", load_asr=False
                )
                logger.info("OmniVoice model loaded")

            kwargs = dict(
                text=text,
                language=language,
                num_step=32,
                guidance_scale=2.0,
            )
            if ref_wav and os.path.exists(ref_wav):
                # Trim long references to 10s for fast synthesis
                import torchaudio as _ta
                _ref, _sr = _ta.load(ref_wav)
                _max_samples = 10 * _sr
                if _ref.shape[-1] > _max_samples:
                    _ref = _ref[..., :_max_samples]
                    _trimmed = os.path.join(tempfile.gettempdir(), f"omnivoice_ref_{os.path.basename(ref_wav)}")
                    _ta.save(_trimmed, _ref, _sr)
                    ref_wav = _trimmed
                    logger.info(f"Trimmed reference from {_ref.shape[-1]/_sr:.1f}s to 10s")
                kwargs["ref_audio"] = ref_wav
                kwargs["ref_text"] = ""

            audio = self._omnivoice_model.generate(**kwargs)
            result = audio[0] if isinstance(audio, list) else audio
            squeezed = result.squeeze()
            wav = (squeezed.cpu().numpy() if hasattr(squeezed, "cpu") else np.asarray(squeezed)).astype(np.float32)
            sr = 24000
            return wav, sr

        loop = asyncio.get_event_loop()
        audio, sample_rate = await loop.run_in_executor(None, _run_omnivoice)

        wav_bytes = self._numpy_to_wav_bytes(audio, sample_rate)
        duration_ms = int(len(audio) / sample_rate * 1000)

        return TTSResult(
            audio_data=wav_bytes,
            audio_format="audio/wav",
            duration_ms=duration_ms,
            visemes=[],
        )

    async def _synthesize_azure_voice(self, text: str, voice: str) -> TTSResult:
        """Synthesize with Azure using explicit voice name."""
        import azure.cognitiveservices.speech as speechsdk
        import asyncio

        speech_key = os.getenv("AZURE_SPEECH_KEY")
        speech_region = os.getenv("AZURE_SPEECH_REGION", "westeurope")
        if not speech_key:
            raise RuntimeError("Azure Speech key not configured")

        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
        speech_config.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )
        speech_config.speech_synthesis_voice_name = voice

        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, synthesizer.speak_text_async(text).get)

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return TTSResult(
                audio_data=result.audio_data,
                audio_format="audio/mp3",
                duration_ms=0,
                visemes=[],
            )
        cancellation = result.cancellation_details
        raise RuntimeError(f"Azure TTS failed: {cancellation.reason} - {cancellation.error_details}")

    async def _synthesize_google(self, text: str, voice: str) -> TTSResult:
        """Synthesize with Google Cloud TTS."""
        import asyncio
        from google.cloud import texttospeech
        from google.oauth2 import service_account

        if not os.path.exists(self._credentials_path):
            raise RuntimeError(
                f"Google Cloud credentials not found at: {self._credentials_path}. "
                "Set GOOGLE_APPLICATION_CREDENTIALS env var to your service account JSON path."
            )

        credentials = service_account.Credentials.from_service_account_file(
            self._credentials_path
        )
        client = texttospeech.TextToSpeechClient(credentials=credentials)

        voice_parts = voice.split("-")
        lang_code = f"{voice_parts[0]}-{voice_parts[1]}"

        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice_params = texttospeech.VoiceSelectionParams(language_code=lang_code, name=voice)
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0,
            pitch=0.0,
        )

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.synthesize_speech(
                input=synthesis_input, voice=voice_params, audio_config=audio_config
            ),
        )

        return TTSResult(
            audio_data=response.audio_content,
            audio_format="audio/mp3",
            duration_ms=0,
            visemes=[],
        )

    async def _synthesize_piper(self, text: str, voice: str) -> TTSResult:
        """Synthesize with Piper via the standalone Windows binary.

        Resolution: ``<userData>/tts-engines/piper/piper.exe`` plus the per-
        voice tree ``<userData>/tts-voices/piper/<voice>/<voice>.onnx`` with
        a sibling ``.installed`` marker (written atomically by the installer).
        A missing marker means a partial download — refuse rather than feed
        a truncated .onnx into piper and crash with a cryptic onnxruntime
        error.

        We spawn ``piper.exe --model <voice>.onnx --output_raw`` and feed
        ``text`` on stdin. stdout is raw 16-bit signed PCM at the model's
        sample rate (22050 Hz for sk_SK-lili-medium). We wrap that into a
        WAV container, then optionally LAME-encode to MP3 if lameenc is
        importable. Frontend accepts either.
        """
        binary_path = _edu_piper_binary_path()
        model_path, config_path, marker_path = _edu_piper_voice_paths(voice)

        if not os.path.isfile(binary_path):
            raise RuntimeError(
                f"Piper binary not installed at {binary_path} — "
                "call /api/v1/tts/install/start"
            )
        if not os.path.isfile(model_path) or not os.path.isfile(marker_path):
            raise RuntimeError(
                f"Piper voice '{voice}' not installed — "
                "call /api/v1/tts/install/start"
            )

        args = [binary_path, "--model", model_path, "--output_raw"]
        # Pass the config explicitly if present — piper.exe auto-detects a
        # sibling .json but UNC paths / weird casing can trip the lookup.
        if os.path.isfile(config_path):
            args.extend(["--config", config_path])

        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(input=(text + "\n").encode("utf-8")),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            raise RuntimeError("piper.exe synthesis timed out after 60s")

        if proc.returncode != 0 or not stdout_bytes:
            tail = (stderr_bytes or b"").decode(errors="replace")[-400:]
            raise RuntimeError(
                f"piper.exe synthesis failed (rc={proc.returncode}): {tail.strip()}"
            )

        # The .onnx.json metadata file lists the actual sample rate; read it
        # cheaply with stdlib json so we don't drag onnxruntime in just to
        # construct the WAV header. Default to 22050 if anything goes wrong.
        sample_rate = 22050
        try:
            if os.path.isfile(config_path):
                import json as _json
                with open(config_path, "r", encoding="utf-8") as fh:
                    cfg = _json.load(fh)
                sr = (
                    cfg.get("audio", {}).get("sample_rate")
                    if isinstance(cfg, dict) else None
                )
                if isinstance(sr, int) and sr > 0:
                    sample_rate = sr
        except Exception:
            pass

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(stdout_bytes)
        wav_bytes = wav_buffer.getvalue()
        num_samples = len(stdout_bytes) // 2
        duration_ms = int(num_samples / sample_rate * 1000) if sample_rate else 0

        # MP3-encode when lameenc is available (requirements.lock pins
        # lameenc==1.8.2 so this is the normal path in production). Falling
        # back to WAV keeps the unit-tests on stripped-down envs happy.
        try:
            import lameenc  # type: ignore

            def _encode():
                enc = lameenc.Encoder()
                enc.set_bit_rate(64)
                enc.set_in_sample_rate(sample_rate)
                enc.set_channels(1)
                enc.set_quality(2)
                mp3 = enc.encode(stdout_bytes)
                mp3 += enc.flush()
                return mp3

            mp3_bytes = await asyncio.to_thread(_encode)
            return TTSResult(
                audio_data=mp3_bytes,
                audio_format="audio/mp3",
                duration_ms=duration_ms,
                visemes=[],
            )
        except ImportError:
            return TTSResult(
                audio_data=wav_bytes,
                audio_format="audio/wav",
                duration_ms=duration_ms,
                visemes=[],
            )

    def _escape_ssml(self, text: str) -> str:
        """Escape special characters for SSML"""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("'", "&apos;")
            .replace('"', "&quot;")
        )

    def get_supported_emotions(self) -> List[str]:
        """Get list of supported emotions"""
        return [
            "friendly",
            "cheerful",
            "empathetic",
            "calm",
            "serious",
            "professional",
        ]

    @property
    def provider(self) -> str:
        """Get current provider"""
        return self._provider


# Singleton instance
_tts_service: Optional[TTSService] = None
_tts_service_init_lock = asyncio.Lock()


async def get_tts_service() -> TTSService:
    """Get or create TTS service instance (concurrency-safe via double-checked locking)."""
    global _tts_service
    if _tts_service is not None:
        return _tts_service
    async with _tts_service_init_lock:
        if _tts_service is None:
            svc = TTSService()
            await svc.initialize()
            _tts_service = svc
    return _tts_service
