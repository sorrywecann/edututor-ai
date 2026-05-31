"""
EduTutor.AI - TTS API
Text-to-Speech endpoint with multiple provider support
"""

import asyncio
import json
import logging
import os
import re
import shutil
import sys
import time
import zipfile
from typing import Optional, List, Dict, AsyncGenerator
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

EDGE_VOICES = [
    {"id": "sk-SK-LukasNeural", "name": "Lukáš — Edge (free, viseme z textu)", "lang": "sk"},
    {"id": "sk-SK-ViktoriaNeural", "name": "Viktória — Edge (free, viseme z textu)", "lang": "sk"},
    {"id": "en-US-AriaNeural", "name": "Aria — Edge (EN-US, female)", "lang": "en"},
    {"id": "en-US-GuyNeural", "name": "Guy — Edge (EN-US, male)", "lang": "en"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia — Edge (EN-GB, female)", "lang": "en"},
    {"id": "en-GB-RyanNeural", "name": "Ryan — Edge (EN-GB, male)", "lang": "en"},
]

OPENAI_VOICES = [
    {"id": "nova", "name": "Nova — OpenAI (cloud, viseme z textu)", "lang": "sk"},
]

GOOGLE_VOICES = [
    {"id": "sk-SK-Chirp3-HD-Achernar", "name": "Achernar — Google (cloud, viseme z textu)", "lang": "sk"},
    {"id": "sk-SK-Chirp3-HD-Kore", "name": "Kore — Google (cloud, viseme z textu)", "lang": "sk"},
]

AZURE_VOICES = [
    # Native Slovak (sk-SK) neural voices — Microsoft's dedicated SK voices.
    # These are the ONLY paths that give audio-anchored phoneme visemes
    # (Azure emits sk-SK phoneme boundaries → from_azure_phonemes in
    # viseme_timeline.py → zero-drift lip sync). Multilingual neural voices
    # sound natural but skip the viseme callback path, so we keep only the
    # natives in the picker until that gap is closed.
    {"id": "sk-SK-LukasNeural",    "name": "Lukáš — Azure SK (natívny)",    "lang": "sk"},
    {"id": "sk-SK-ViktoriaNeural", "name": "Viktória — Azure SK (natívna)", "lang": "sk"},
]

PIPER_VOICES = [
    {"id": "sk_SK-lili-medium", "name": "Lili — Piper (lokálne, offline, viseme z textu)", "lang": "sk"},
]

OMNIVOICE_VOICES = [
    {"id": "omnivoice_sk", "name": "OmniVoice — SK klon (slovenčina, 646 jazykov)", "lang": "sk"},
    {"id": "omnivoice_cs", "name": "OmniVoice — CZ klon (čeština)", "lang": "cs"},
    {"id": "omnivoice_en", "name": "OmniVoice — EN klon (angličtina)", "lang": "en"},
]

KOKORO_VOICES = [
    {"id": "af_heart", "name": "Heart — Kokoro (EN, ženský, premium)", "lang": "en"},
    {"id": "af_bella", "name": "Bella — Kokoro (EN, ženský, premium)", "lang": "en"},
    {"id": "af_alloy", "name": "Alloy — Kokoro (EN, ženský)", "lang": "en"},
    {"id": "af_nova", "name": "Nova — Kokoro (EN, ženský)", "lang": "en"},
    {"id": "af_sarah", "name": "Sarah — Kokoro (EN, ženský)", "lang": "en"},
    {"id": "am_michael", "name": "Michael — Kokoro (EN, mužský, premium)", "lang": "en"},
    {"id": "am_adam", "name": "Adam — Kokoro (EN, mužský)", "lang": "en"},
    {"id": "bf_emma", "name": "Emma — Kokoro (EN-GB, ženský)", "lang": "en"},
    {"id": "bm_george", "name": "George — Kokoro (EN-GB, mužský)", "lang": "en"},
    {"id": "ef_dora", "name": "Dora — Kokoro (ES, ženský)", "lang": "es"},
    {"id": "ff_siwis", "name": "Siwis — Kokoro (FR, ženský)", "lang": "fr"},
    {"id": "if_sara", "name": "Sara — Kokoro (IT, ženský)", "lang": "it"},
    {"id": "hf_alpha", "name": "Alpha — Kokoro (HI, ženský)", "lang": "hi"},
    {"id": "jf_alpha", "name": "Alpha — Kokoro (JA, ženský)", "lang": "ja"},
    {"id": "pf_dora", "name": "Dora — Kokoro (PT, ženský)", "lang": "pt"},
    {"id": "zf_xiaobei", "name": "Xiaobei — Kokoro (ZH, ženský)", "lang": "zh"},
]

OMNIVOICE_VOICES = [
    {"id": "omnivoice_sk", "name": "OmniVoice — SK klon (slovenčina, 646 jazykov)", "lang": "sk"},
    {"id": "omnivoice_cs", "name": "OmniVoice — CZ klon (čeština)", "lang": "cs"},
    {"id": "omnivoice_en", "name": "OmniVoice — EN klon (angličtina)", "lang": "en"},
]

CREDENTIALS_PATH = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "credentials.json")
)

PIPER_MODELS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "models", "piper"
)


EDGE_VOICE_IDS = {v["id"] for v in EDGE_VOICES}
OPENAI_VOICE_IDS = {v["id"] for v in OPENAI_VOICES}
GOOGLE_VOICE_IDS = {v["id"] for v in GOOGLE_VOICES}
AZURE_VOICE_IDS = {v["id"] for v in AZURE_VOICES}
PIPER_VOICE_IDS = {v["id"] for v in PIPER_VOICES}
KOKORO_VOICE_IDS = {v["id"] for v in KOKORO_VOICES}
OMNIVOICE_VOICE_IDS = {v["id"] for v in OMNIVOICE_VOICES}


def _infer_provider(voice: str, provider: Optional[str]) -> str:
    if provider:
        return provider
    if voice in EDGE_VOICE_IDS:
        return "edge"
    if voice in OPENAI_VOICE_IDS:
        return "openai"
    if voice in GOOGLE_VOICE_IDS:
        return "google"
    if voice in AZURE_VOICE_IDS:
        return "azure"
    if voice in PIPER_VOICE_IDS:
        return "piper"
    if voice in KOKORO_VOICE_IDS:
        return "kokoro"
    if voice in OMNIVOICE_VOICE_IDS or (voice.startswith("omnivoice-") and re.match(r'^omnivoice-[a-z]{2,3}-[a-zA-Z0-9_-]+$', voice)):
        return "omnivoice"
    return "edge"


class TTSRequest(BaseModel):
    text: str
    provider: Optional[str] = None
    voice: str = "sk-SK-LukasNeural"


class VoiceOption(BaseModel):
    id: str
    name: str
    lang: str
    provider: str


@router.get("/tts/voices")
async def list_voices() -> List[VoiceOption]:
    voices = []

    for v in EDGE_VOICES:
        voices.append(
            VoiceOption(id=v["id"], name=v["name"], lang=v["lang"], provider="edge")
        )

    if os.getenv("OPENAI_API_KEY"):
        for v in OPENAI_VOICES:
            voices.append(
                VoiceOption(
                    id=v["id"], name=v["name"], lang=v["lang"], provider="openai"
                )
            )

    if os.path.exists(CREDENTIALS_PATH):
        for v in GOOGLE_VOICES:
            voices.append(
                VoiceOption(
                    id=v["id"], name=v["name"], lang=v["lang"], provider="google"
                )
            )

    if os.getenv("AZURE_SPEECH_KEY"):
        for v in AZURE_VOICES:
            voices.append(
                VoiceOption(
                    id=v["id"], name=v["name"], lang=v["lang"], provider="azure"
                )
            )

    for v in PIPER_VOICES:
        model_path = os.path.join(PIPER_MODELS_PATH, f"{v['id']}.onnx")
        if os.path.exists(model_path):
            voices.append(
                VoiceOption(
                    id=v["id"], name=v["name"], lang=v["lang"], provider="piper"
                )
            )

    kokoro_available = False
    try:
        import kokoro  # noqa: F401
        kokoro_available = True
    except ImportError:
        pass

    if kokoro_available:
        for v in KOKORO_VOICES:
            voices.append(
                VoiceOption(id=v["id"], name=v["name"], lang=v["lang"], provider="kokoro")
            )

    omnivoice_available = False
    try:
        import omnivoice  # noqa: F401
        omnivoice_available = True
    except ImportError:
        pass

    if omnivoice_available:
        for v in OMNIVOICE_VOICES:
            voices.append(
                VoiceOption(id=v["id"], name=v["name"], lang=v["lang"], provider="omnivoice")
            )

    omnivoice_refs_dir = os.path.join(os.path.dirname(__file__), "..", "..", "models", "omnivoice", "references")
    if os.path.isdir(omnivoice_refs_dir):
        _AUDIO_EXTS = (".wav", ".mp3", ".m4a")
        for f in sorted(os.listdir(omnivoice_refs_dir)):
            if any(f.lower().endswith(ext) for ext in _AUDIO_EXTS):
                stem = os.path.splitext(f)[0]
                for lang, lang_code in [("sk", "sk"), ("cs", "cs"), ("en", "en")]:
                    voice_id = f"omnivoice-{lang}-{stem}"
                    if voice_id not in OMNIVOICE_VOICE_IDS:
                        voices.append(
                            VoiceOption(
                                id=voice_id,
                                name=f"{stem.replace('-', ' ').title()} — OmniVoice ({lang.upper()})",
                                lang=lang,
                                provider="omnivoice",
                            )
                        )

    return voices


class TTSProviderInfo(BaseModel):
    id: str
    label: str
    available: bool
    needs_key: Optional[str] = None


class TTSProvidersResponse(BaseModel):
    providers: List[TTSProviderInfo]
    default: str


# Display label per dispatch key. Order is intentional (UI rendering order).
_PROVIDER_DISPLAY: List[tuple] = [
    ("edge",       "Edge TTS"),
    ("elevenlabs", "ElevenLabs"),
    ("omnivoice",  "OmniVoice"),
    ("piper",      "Piper"),
    ("openai",     "OpenAI TTS"),
    ("google",     "Google TTS"),
    ("azure",      "Azure TTS"),
    ("kokoro",     "Kokoro"),
]


def _provider_available(pid: str) -> bool:
    """Return whether the given provider has the required key/credentials.

    Mirrors the gating logic in /tts/voices (above) without instantiating the
    TTSService. For local providers (piper, kokoro, omnivoice) we check the
    same modules / model paths; cloud providers check env credentials.
    """
    if pid == "edge":
        return True
    if pid == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    if pid == "google":
        return os.path.exists(CREDENTIALS_PATH)
    if pid == "azure":
        return bool(os.getenv("AZURE_SPEECH_KEY"))
    if pid == "piper":
        if not os.path.isfile(_piper_binary_path()):
            return False
        for v in PIPER_VOICES:
            vdir = _piper_voice_dir(v["id"])
            model = os.path.join(vdir, f"{v['id']}.onnx")
            marker = os.path.join(vdir, ".installed")
            if os.path.isfile(model) and os.path.isfile(marker):
                return True
        return False
    if pid == "kokoro":
        try:
            import kokoro  # noqa: F401
            return True
        except ImportError:
            return False
    if pid == "omnivoice":
        try:
            import omnivoice  # noqa: F401
            return True
        except ImportError:
            # Fallback: reference-based clones still work even without the
            # package installed in some bundles.
            refs = os.path.join(os.path.dirname(__file__), "..", "..", "models", "omnivoice", "references")
            return os.path.isdir(refs)
    if pid == "elevenlabs":
        # ElevenLabs has no backend dispatch entry yet (ADR-002 open).
        # Surface as a configurable provider — the frontend renders it with a
        # "Pripravujeme" pill regardless.
        return False
    return False


def _provider_needs_key(pid: str) -> Optional[str]:
    return {
        "openai":     "openai_api_key",
        "azure":      "azure_speech_key",
        "elevenlabs": "elevenlabs_api_key",
    }.get(pid)


@router.get("/tts/providers", response_model=TTSProvidersResponse)
async def list_tts_providers() -> TTSProvidersResponse:
    """List TTS providers + their availability flag.

    Drives the v0.8.0 HlasTab card list. Backed by the TTSService dispatch
    table (`_explicit_dispatch`) so new providers added there appear here
    automatically once an entry is added to `_PROVIDER_DISPLAY`.
    """
    from app.services.tts_service import get_tts_service

    svc = await get_tts_service()
    dispatch_keys = set(svc._explicit_dispatch().keys())

    providers: List[TTSProviderInfo] = []
    seen = set()
    for pid, label in _PROVIDER_DISPLAY:
        in_dispatch = pid in dispatch_keys
        # Always emit the row — frontend can show "Pripravujeme" for entries
        # that have no dispatch entry yet (e.g. elevenlabs).
        providers.append(TTSProviderInfo(
            id=pid,
            label=label,
            available=in_dispatch and _provider_available(pid),
            needs_key=_provider_needs_key(pid),
        ))
        seen.add(pid)

    # Surface any future dispatch keys not yet in _PROVIDER_DISPLAY.
    for pid in dispatch_keys:
        if pid not in seen:
            providers.append(TTSProviderInfo(
                id=pid, label=pid.title(),
                available=_provider_available(pid),
                needs_key=_provider_needs_key(pid),
            ))

    return TTSProvidersResponse(providers=providers, default="edge")


@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech audio. Returns MP3 or WAV audio data."""
    from app.services.tts_service import get_tts_service

    try:
        provider = _infer_provider(request.voice, request.provider)
        service = await get_tts_service()
        result = await service.synthesize_with_options(
            text=request.text,
            provider=provider,
            voice=request.voice,
        )
        ext = "wav" if "wav" in result.audio_format else "mp3"
        return Response(
            content=result.audio_data,
            media_type=result.audio_format,
            headers={"Content-Disposition": f"inline; filename=speech.{ext}"},
        )
    except ValueError as e:
        logger.warning(f"TTS bad request (provider={request.provider} voice={request.voice}): {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"TTS synth failure (provider={request.provider} voice={request.voice}): {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"TTS unexpected error (provider={request.provider} voice={request.voice})")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tts/warmup")
async def warmup_tts(provider: str = "omnivoice"):
    """Pre-load a TTS engine so first synthesis is fast.

    Default switched from `xtts_clone` (removed in b22c568) to `omnivoice`
    which is the production voice clone path. References are now looked up
    in models/omnivoice/references/ (the legacy models/xtts/references/
    path is retained as a fallback for backward-compat installs).
    """
    from app.services.tts_service import get_tts_service

    tts = await get_tts_service()
    try:
        candidate_dirs = [
            os.path.join(os.path.dirname(__file__), "..", "..", "models", "omnivoice", "references"),
            os.path.join(os.path.dirname(__file__), "..", "..", "models", "xtts", "references"),  # legacy
        ]
        refs_dir = next((d for d in candidate_dirs if os.path.isdir(d)), None)
        if not refs_dir:
            return {"status": "no_references"}
        wavs = [f for f in os.listdir(refs_dir) if f.endswith(".wav")]
        if not wavs:
            return {"status": "no_references"}
        ref = os.path.join(refs_dir, wavs[0])
        await tts.synthesize_with_options("test", provider, ref)
        return {"status": "ready", "provider": provider}
    except Exception as e:
        logger.warning(f"TTS warmup failed: {e}")
        return {"status": "failed", "error": str(e)}


# ── TTS Install endpoints (v0.9.x) ────────────────────────────────────────────
#
# Pattern mirrors /system/ollama-pull{,/status,/stream} in app/api/system.py:
# a module-level state dict + asyncio.Lock dedupes concurrent installs by
# task_id ("{engine}:{voice}"). One background asyncio.Task drives the install;
# the SSE endpoint reads from a per-task asyncio.Queue so progress streams to
# the client in real time. Heartbeat keeps proxies from idling out.

_PIPER_DEFAULT_VOICE = "sk_SK-lili-medium"
_KOKORO_DEFAULT_VOICE = "af_heart"

# Kokoro voice prefix → language code (mirror of tts_service.KOKORO_LANG_MAP).
# Used only for the "no_slovak_voice" gate so we don't have to import the
# service at install-start time.
_KOKORO_PREFIXES = {"af_", "am_", "bf_", "bm_", "ef_", "em_", "ff_", "fm_",
                    "hf_", "hm_", "if_", "im_", "jf_", "jm_", "pf_", "pm_",
                    "zf_", "zm_"}

# In-memory state per task_id. Same shape as system._active_pulls so a future
# refactor can extract the SSE-pump pattern. Cleared 60s after terminal state.
_active_tts_installs: Dict[str, dict] = {}
_active_tts_installs_lock = asyncio.Lock()


def _userdata_dir() -> str:
    """Resolve the EduTutor.AI per-user state root.

    Mirrors the resolution in run_dev.py's _resolve_access_log_path so all
    backend state lives under one tree. On Windows we prefer
    ``%LOCALAPPDATA%\\EduTutor.AI`` (matches the installer/launcher path);
    fall back to ``%APPDATA%\\edututor-desktop`` and finally ``~/.edututor``
    so the function never raises in headless dev shells.
    """
    if os.environ.get("EDU_USER_DATA_DIR"):
        return os.path.abspath(os.environ["EDU_USER_DATA_DIR"])
    if os.environ.get("LOCALAPPDATA"):
        return os.path.abspath(os.path.join(os.environ["LOCALAPPDATA"], "EduTutor.AI"))
    if os.environ.get("APPDATA"):
        return os.path.abspath(os.path.join(os.environ["APPDATA"], "edututor-desktop"))
    return os.path.abspath(os.path.join(os.path.expanduser("~"), ".edututor"))


def _piper_binary_dir() -> str:
    """Where the rhasspy piper standalone Windows binary lands.

    ``<userData>/tts-engines/piper/piper.exe`` is the final layout. The
    rhasspy release zip contains a top-level ``piper/`` directory holding
    ``piper.exe`` + its DLLs + ``espeak-ng-data/`` — we extract such that
    *the contents* of that inner ``piper/`` end up directly under this dir.
    """
    return os.path.abspath(os.path.join(_userdata_dir(), "tts-engines", "piper"))


def _piper_binary_path() -> str:
    return os.path.join(_piper_binary_dir(), "piper.exe")


def _piper_voice_dir(voice: str) -> str:
    """Per-voice install dir under userData."""
    return os.path.abspath(os.path.join(_userdata_dir(), "tts-voices", "piper", voice))


def _piper_voices_dir() -> str:
    """Legacy alias kept for callers that still resolve a *flat* voices dir.

    New code should call ``_piper_voice_dir(voice)`` (per-voice layout).
    The ``.installed`` marker is written into the per-voice dir.
    """
    return os.path.abspath(os.path.join(_userdata_dir(), "tts-voices", "piper"))


def _kokoro_marker_dir() -> str:
    """Pre-warm marker for kokoro lives next to the piper dir for symmetry.

    Kokoro auto-downloads on first synth (KModel pulls from HF cache), so the
    install task only instantiates it once to warm the HF cache. The marker
    file lets `/tts/providers` detect the warmup happened without re-importing.
    """
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "models", "kokoro"))


def _installed_marker(engine: str, voice: str) -> str:
    if engine == "piper":
        # Per-voice marker so installing a second voice doesn't claim the
        # first is verified. The directory always exists by the time we
        # write — guaranteed by _install_piper's makedirs.
        return os.path.join(_piper_voice_dir(voice), ".installed")
    return os.path.join(_kokoro_marker_dir(), ".installed")


def _fmt_speed(bps: float) -> str:
    if bps <= 0:
        return ""
    for unit in ("B/s", "KB/s", "MB/s", "GB/s"):
        if bps < 1024:
            return f"{bps:.1f} {unit}"
        bps /= 1024
    return f"{bps:.1f} TB/s"


class TTSInstallStartRequest(BaseModel):
    engine: str
    voice: Optional[str] = None


def _resolve_install_request(engine: str, voice: Optional[str]) -> tuple:
    """Return (task_id, resolved_voice, error_or_None).

    Validates engine + voice up front so /install/start can return the right
    error code synchronously. Slovak Kokoro is explicitly blocked because
    Kokoro has no Slovak language pack (see spec §6).
    """
    engine = (engine or "").strip().lower()
    if engine not in ("piper", "kokoro"):
        return None, None, "unknown_engine"

    if engine == "piper":
        resolved = (voice or _PIPER_DEFAULT_VOICE).strip()
        if resolved not in PIPER_VOICE_IDS:
            return None, None, "voice_unavailable"
        return f"piper:{resolved}", resolved, None

    # kokoro
    resolved = (voice or _KOKORO_DEFAULT_VOICE).strip()
    # Block SK requests — Kokoro has no Slovak voice pack. The frontend should
    # hide the option, but if it slips through we surface a clear code.
    prefix = resolved[:3] if len(resolved) >= 3 else ""
    if prefix not in _KOKORO_PREFIXES:
        return None, None, "voice_unavailable"
    return f"kokoro:{resolved}", resolved, None


async def _emit(task_id: str, event: str, payload: dict) -> None:
    """Push an SSE event onto every queue subscribed to this task."""
    async with _active_tts_installs_lock:
        st = _active_tts_installs.get(task_id)
        if not st:
            return
        queues: List[asyncio.Queue] = list(st.get("_queues", []))
    for q in queues:
        try:
            q.put_nowait((event, payload))
        except asyncio.QueueFull:
            # Drop heartbeats / progress under back-pressure; never block.
            pass


async def _set_state(task_id: str, **fields) -> None:
    async with _active_tts_installs_lock:
        st = _active_tts_installs.get(task_id)
        if st:
            st.update(fields)


# ── Piper standalone-binary install (v0.9.x) ──────────────────────────────
#
# The embedded Python shipped with the installer has no pip (by design —
# python311._pth strict isolation must NOT be broken; see CLAUDE.md memory
# entry "Python bundle isolation"). So instead of `pip install piper-tts`
# we download the official Windows standalone binary published by
# rhasspy/piper on GitHub Releases and the .onnx voice from HuggingFace.

_PIPER_GITHUB_RELEASES_LATEST = "https://api.github.com/repos/rhasspy/piper/releases/latest"
_PIPER_GITHUB_RELEASE_TAG_FALLBACK = "2023.11.14-2"
_PIPER_WINDOWS_ASSET = "piper_windows_amd64.zip"


def _piper_release_zip_url(tag: str) -> str:
    return (
        f"https://github.com/rhasspy/piper/releases/download/{tag}/"
        f"{_PIPER_WINDOWS_ASSET}"
    )


async def _resolve_latest_piper_tag(client) -> str:
    """Hit the GitHub API for the latest release tag; fall back on any failure.

    GitHub's anonymous API allows ~60 requests/h per IP which is more than
    enough for a one-shot install. We never raise here — the pinned fallback
    tag is known-good (verified by hand on 2024-Q1) so an offline GitHub
    must not block the install.
    """
    try:
        resp = await client.get(_PIPER_GITHUB_RELEASES_LATEST, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
        tag = (data or {}).get("tag_name")
        if isinstance(tag, str) and tag.strip():
            return tag.strip()
    except Exception as exc:
        logger.warning(
            "Piper release lookup failed (%s) — using pinned tag %s",
            exc, _PIPER_GITHUB_RELEASE_TAG_FALLBACK,
        )
    return _PIPER_GITHUB_RELEASE_TAG_FALLBACK


def _cleanup_partial_piper_install(binary_dir: str, voice_dir: str) -> None:
    """Best-effort cleanup of half-extracted files after a mid-flight failure.

    Removes both the binary tree and the voice tree. We deliberately do NOT
    raise — cleanup runs in the error path and any exception here would
    mask the real install failure surfaced to the SSE client.
    """
    for path in (binary_dir, voice_dir):
        try:
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
        except Exception as exc:  # pragma: no cover — best-effort
            logger.warning("partial-install cleanup of %s failed: %s", path, exc)


async def _install_piper(task_id: str, voice: str) -> None:
    """Install Piper as a standalone binary + .onnx voice under userData.

    Pipeline (matches the SSE stage names the frontend renders):
      0-40%  ``binary-download``   piper_windows_amd64.zip from GitHub
      40-90% ``voice-download``    .onnx + .onnx.json from HuggingFace
      90-99% ``verify``            spawn piper.exe and read audio bytes
      100%   ``done``              .installed marker written

    NOTHING in this function uses pip — embedded Python's isolation must
    stay intact (see CLAUDE.md "Bundled python MUST have python311._pth").
    """
    import httpx

    binary_dir = _piper_binary_dir()
    voice_dir = _piper_voice_dir(voice)
    onnx_path = os.path.join(voice_dir, f"{voice}.onnx")
    json_path = os.path.join(voice_dir, f"{voice}.onnx.json")
    binary_path = _piper_binary_path()

    # Track which dirs we created so cleanup-on-failure only nukes what we
    # actually wrote (a pre-existing binary install from a previous voice
    # add must NOT be wiped when only the voice download fails).
    binary_dir_existed_before = os.path.isdir(binary_dir) and os.path.isfile(binary_path)
    voice_dir_existed_before = os.path.isdir(voice_dir) and os.path.isfile(onnx_path)

    os.makedirs(binary_dir, exist_ok=True)
    os.makedirs(voice_dir, exist_ok=True)

    await _set_state(task_id, stage="binary-download", percent=1)
    await _emit(task_id, "progress", {
        "task_id": task_id, "percent": 1,
        "bytes_done": 0, "bytes_total": 0,
        "speed": "", "stage": "binary-download",
    })

    zip_tmp = os.path.join(binary_dir, "piper_windows_amd64.zip.part")

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=20.0),
            follow_redirects=True,
            headers={"User-Agent": "EduTutor.AI-installer"},
        ) as client:

            # ── Stage 1: binary-download (0-40%) ────────────────────────────
            if not os.path.isfile(binary_path):
                tag = await _resolve_latest_piper_tag(client)
                zip_url = _piper_release_zip_url(tag)

                async with client.stream("GET", zip_url) as resp:
                    resp.raise_for_status()
                    total = int(resp.headers.get("Content-Length") or 0)
                    logger.info(
                        "Downloading piper from %s (size: %s MB)",
                        zip_url,
                        f"{total / (1024 * 1024):.1f}" if total else "?",
                    )
                    done = 0
                    start = time.time()
                    last_emit = 0.0
                    with open(zip_tmp, "wb") as fh:
                        async for chunk in resp.aiter_bytes(64 * 1024):
                            fh.write(chunk)
                            done += len(chunk)
                            now = time.time()
                            if now - last_emit > 0.5:
                                last_emit = now
                                elapsed = max(now - start, 0.001)
                                pct = int(40 * (done / total)) if total else 20
                                pct = max(1, min(39, pct))
                                speed = _fmt_speed(done / elapsed)
                                await _set_state(
                                    task_id, percent=pct,
                                    bytes_done=done, bytes_total=total,
                                    speed=speed, stage="binary-download",
                                )
                                await _emit(task_id, "progress", {
                                    "task_id": task_id, "percent": pct,
                                    "bytes_done": done, "bytes_total": total,
                                    "speed": speed, "stage": "binary-download",
                                })

                # Extract. The zip ships a top-level `piper/` folder; we
                # strip it so piper.exe lands directly at <binary_dir>/piper.exe
                # (the layout _piper_binary_path() expects).
                logger.info("Extracting to %s", binary_dir)
                await _set_state(task_id, percent=40, stage="binary-download")

                def _extract():
                    with zipfile.ZipFile(zip_tmp, "r") as zf:
                        for member in zf.infolist():
                            name = member.filename.replace("\\", "/")
                            # Drop the leading "piper/" prefix if present so
                            # the inner tree lands directly under binary_dir.
                            if name.startswith("piper/"):
                                rel = name[len("piper/"):]
                            else:
                                rel = name
                            if not rel or rel.endswith("/"):
                                continue
                            # Reject absolute / traversal entries.
                            if rel.startswith(("/", "\\")) or ".." in rel.split("/"):
                                continue
                            target = os.path.join(binary_dir, *rel.split("/"))
                            os.makedirs(os.path.dirname(target) or binary_dir, exist_ok=True)
                            with zf.open(member, "r") as src, open(target, "wb") as dst:
                                shutil.copyfileobj(src, dst)

                await asyncio.to_thread(_extract)

                try:
                    os.remove(zip_tmp)
                except OSError:
                    pass

                if not os.path.isfile(binary_path):
                    raise RuntimeError(
                        f"piper.exe not found after extract at {binary_path} — "
                        "release zip layout unexpected"
                    )
            else:
                logger.info("Reusing existing piper.exe at %s", binary_path)

            # ── Stage 2: voice-download (40-90%) ────────────────────────────
            await _set_state(task_id, percent=40, stage="voice-download")
            await _emit(task_id, "progress", {
                "task_id": task_id, "percent": 40,
                "bytes_done": 0, "bytes_total": 0,
                "speed": "", "stage": "voice-download",
            })

            # Pull voice ID layout out of the id (e.g. sk_SK-lili-medium →
            # sk/sk_SK/lili/medium). Today we only ship sk_SK-lili-medium so
            # we hard-code; once the picker grows this is the only place
            # that needs the lookup.
            base_url = (
                "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
                "sk/sk_SK/lili/medium"
            )
            files = [
                (f"{voice}.onnx", onnx_path, True),        # the big one — drives %
                (f"{voice}.onnx.json", json_path, False),  # tiny config
            ]

            for fname, dest, is_primary in files:
                if os.path.exists(dest) and os.path.getsize(dest) > 0 and not is_primary:
                    continue
                async with client.stream("GET", f"{base_url}/{fname}") as resp:
                    resp.raise_for_status()
                    total = int(resp.headers.get("Content-Length") or 0)
                    done = 0
                    start = time.time()
                    last_emit = 0.0
                    tmp = dest + ".part"
                    with open(tmp, "wb") as fh:
                        async for chunk in resp.aiter_bytes(64 * 1024):
                            fh.write(chunk)
                            done += len(chunk)
                            now = time.time()
                            if is_primary and now - last_emit > 0.5:
                                last_emit = now
                                elapsed = max(now - start, 0.001)
                                pct = 40 + int(50 * (done / total)) if total else 65
                                pct = min(89, pct)
                                speed = _fmt_speed(done / elapsed)
                                logger.info(
                                    "Voice install: %s/%s bytes",
                                    done, total or "?",
                                )
                                await _set_state(
                                    task_id, percent=pct,
                                    bytes_done=done, bytes_total=total,
                                    speed=speed, stage="voice-download",
                                )
                                await _emit(task_id, "progress", {
                                    "task_id": task_id, "percent": pct,
                                    "bytes_done": done, "bytes_total": total,
                                    "speed": speed, "stage": "voice-download",
                                })
                    os.replace(tmp, dest)

        # ── Stage 3: verify (90-99%) ────────────────────────────────────────
        await _set_state(task_id, percent=92, stage="verify")
        await _emit(task_id, "progress", {
            "task_id": task_id, "percent": 92,
            "bytes_done": 0, "bytes_total": 0,
            "speed": "", "stage": "verify",
        })

        if not os.path.exists(onnx_path) or os.path.getsize(onnx_path) < 1_000_000:
            raise RuntimeError("downloaded onnx file is too small — bad mirror?")

        # Spawn piper.exe with --output_raw, feed "test" on stdin, expect
        # 16-bit PCM on stdout. 10s timeout — first invocation loads the
        # espeak-ng phoneme tables which can take a few seconds on cold disk.
        smoke_args = [
            binary_path, "--model", onnx_path, "--output_raw",
        ]
        smoke_proc = await asyncio.create_subprocess_exec(
            *smoke_args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                smoke_proc.communicate(input=b"test\n"),
                timeout=10.0,
            )
        except asyncio.TimeoutError:
            try:
                smoke_proc.kill()
            except ProcessLookupError:
                pass
            raise RuntimeError("piper.exe smoke test timed out after 10s")

        logger.info(
            "Smoke test: stdin=test, stdout=%d bytes audio",
            len(stdout_bytes or b""),
        )
        if smoke_proc.returncode != 0 or not stdout_bytes or len(stdout_bytes) < 1024:
            tail = (stderr_bytes or b"").decode(errors="replace")[-400:]
            raise RuntimeError(
                f"piper.exe smoke test failed (rc={smoke_proc.returncode}, "
                f"bytes={len(stdout_bytes or b'')}): {tail.strip()}"
            )

        # Marker so /tts/providers can detect installed state cheaply.
        try:
            with open(_installed_marker("piper", voice), "w", encoding="utf-8") as fh:
                fh.write(json.dumps({
                    "voice": voice,
                    "installed_at": time.time(),
                    "binary": binary_path,
                    "model": onnx_path,
                }))
        except OSError:
            pass

        await _set_state(task_id, percent=100, stage="done", status="done")
        await _emit(task_id, "done", {
            "task_id": task_id, "engine": "piper",
            "voice": voice, "path": onnx_path,
        })

    except asyncio.CancelledError:
        # On cancel only nuke dirs we created; preserve pre-existing trees.
        if not binary_dir_existed_before:
            _cleanup_partial_piper_install(binary_dir, "")
        if not voice_dir_existed_before:
            _cleanup_partial_piper_install("", voice_dir)
        await _set_state(task_id, status="error", error="cancelled")
        await _emit(task_id, "error", {
            "task_id": task_id, "error": "cancelled", "code": "cancelled",
        })
        raise
    except httpx.HTTPError as e:
        if not binary_dir_existed_before:
            _cleanup_partial_piper_install(binary_dir, "")
        if not voice_dir_existed_before:
            _cleanup_partial_piper_install("", voice_dir)
        msg = f"network error: {e}"
        await _set_state(task_id, status="error", error=msg)
        await _emit(task_id, "error", {"task_id": task_id, "error": msg, "code": "network"})
    except OSError as e:
        if not binary_dir_existed_before:
            _cleanup_partial_piper_install(binary_dir, "")
        if not voice_dir_existed_before:
            _cleanup_partial_piper_install("", voice_dir)
        msg = f"disk error: {e}"
        code = "disk_full" if getattr(e, "errno", 0) == 28 else "network"
        await _set_state(task_id, status="error", error=msg)
        await _emit(task_id, "error", {"task_id": task_id, "error": msg, "code": code})
    except Exception as e:
        if not binary_dir_existed_before:
            _cleanup_partial_piper_install(binary_dir, "")
        if not voice_dir_existed_before:
            _cleanup_partial_piper_install("", voice_dir)
        msg = str(e)
        await _set_state(task_id, status="error", error=msg)
        await _emit(task_id, "error", {"task_id": task_id, "error": msg, "code": "checksum"})
    finally:
        # Always sweep the in-progress zip even if exception path didn't.
        try:
            if os.path.exists(zip_tmp):
                os.remove(zip_tmp)
        except OSError:
            pass


async def _install_kokoro(task_id: str, voice: str) -> None:
    """Pre-warm Kokoro by instantiating KModel + KPipeline for the voice's lang.

    Kokoro auto-downloads on first instantiation (KModel(repo_id="hexgrad/
    Kokoro-82M") pulls weights into the HF cache). All we do here is force
    that download to happen NOW so first /tts call is snappy.
    """
    try:
        os.makedirs(_kokoro_marker_dir(), exist_ok=True)

        await _set_state(task_id, stage="pip-install", percent=5)
        await _emit(task_id, "progress", {
            "task_id": task_id, "percent": 5,
            "bytes_done": 0, "bytes_total": 0,
            "speed": "", "stage": "pip-install",
        })

        # Make sure the kokoro package itself is importable.
        try:
            import kokoro  # type: ignore  # noqa: F401
        except ImportError:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pip", "install", "--no-input", "kokoro",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout_data, _ = await proc.communicate()
            if proc.returncode != 0:
                tail = (stdout_data or b"").decode(errors="replace")[-400:]
                raise RuntimeError(f"pip install kokoro failed: {tail.strip()}")

        await _set_state(task_id, percent=50, stage="voice-download")
        await _emit(task_id, "progress", {
            "task_id": task_id, "percent": 50,
            "bytes_done": 0, "bytes_total": 0,
            "speed": "", "stage": "voice-download",
        })

        # Run the blocking HF download in a thread so we don't stall the loop.
        def _warmup():
            from kokoro import KModel, KPipeline  # type: ignore
            # Map af_/am_/... → lang code without importing tts_service (which
            # would drag in the whole TTSService just for a dict lookup).
            prefix = voice[:3] if len(voice) >= 3 else "af_"
            lang_map = {"af_": "a", "am_": "a", "bf_": "b", "bm_": "b",
                        "ef_": "e", "em_": "e", "ff_": "f", "fm_": "f",
                        "hf_": "h", "hm_": "h", "if_": "i", "im_": "i",
                        "jf_": "j", "jm_": "j", "pf_": "p", "pm_": "p",
                        "zf_": "z", "zm_": "z"}
            lang = lang_map.get(prefix, "a")
            model = KModel(repo_id="hexgrad/Kokoro-82M")
            KPipeline(lang_code=lang, model=model, repo_id="hexgrad/Kokoro-82M")
            return True

        await asyncio.to_thread(_warmup)

        await _set_state(task_id, percent=95, stage="verify")
        await _emit(task_id, "progress", {
            "task_id": task_id, "percent": 95,
            "bytes_done": 0, "bytes_total": 0,
            "speed": "", "stage": "verify",
        })

        try:
            with open(_installed_marker("kokoro", voice), "w", encoding="utf-8") as fh:
                fh.write(json.dumps({"voice": voice, "installed_at": time.time()}))
        except OSError:
            pass

        await _set_state(task_id, percent=100, stage="done", status="done")
        await _emit(task_id, "done", {
            "task_id": task_id, "engine": "kokoro",
            "voice": voice, "path": _kokoro_marker_dir(),
        })

    except asyncio.CancelledError:
        await _set_state(task_id, status="error", error="cancelled")
        await _emit(task_id, "error", {
            "task_id": task_id, "error": "cancelled", "code": "cancelled",
        })
        raise
    except Exception as e:
        msg = str(e)
        await _set_state(task_id, status="error", error=msg)
        await _emit(task_id, "error", {"task_id": task_id, "error": msg, "code": "network"})


async def _cleanup_task_later(task_id: str, delay: float = 60.0) -> None:
    """Drop the task from the dict 60s after it terminates (Ollama-pattern)."""
    await asyncio.sleep(delay)
    async with _active_tts_installs_lock:
        st = _active_tts_installs.get(task_id)
        if st and st["status"] in ("done", "error"):
            _active_tts_installs.pop(task_id, None)


@router.post("/tts/install/start")
async def tts_install_start(body: TTSInstallStartRequest):
    """Kick off a piper / kokoro install in the background.

    Returns immediately with a task_id; client follows up with either
    GET /tts/install/stream (SSE, recommended) or GET /tts/install/status
    (poll fallback). Dedupe key = "{engine}:{voice}" — a second POST for an
    already-running install returns the existing task_id with started=false.
    """
    task_id, voice, err = _resolve_install_request(body.engine, body.voice)
    if err == "unknown_engine":
        return {"success": False, "error": "unknown_engine"}
    if err == "voice_unavailable":
        # Spec §6 carve-out for Kokoro + SK: surface a more actionable code.
        if (body.engine or "").strip().lower() == "kokoro":
            return {"success": False, "error": "no_slovak_voice"}
        return {"success": False, "error": "voice_unavailable"}

    async with _active_tts_installs_lock:
        existing = _active_tts_installs.get(task_id)
        if existing and existing["status"] == "running":
            logger.info(f"tts install {task_id} already running — returning handle")
            return {
                "success": True,
                "task_id": task_id,
                "started": False,
                "already_running": True,
            }
        # Fresh entry (replaces any terminal state from a prior run).
        _active_tts_installs[task_id] = {
            "task_id": task_id,
            "engine": body.engine.strip().lower(),
            "voice": voice,
            "status": "running",
            "percent": 0,
            "bytes_done": 0,
            "bytes_total": 0,
            "speed": "",
            "stage": "pip-install",
            "started_at": time.time(),
            "error": None,
            "_queues": [],
            "_task": None,
        }

    engine = body.engine.strip().lower()
    if engine == "piper":
        runner = _install_piper(task_id, voice)
    else:
        runner = _install_kokoro(task_id, voice)

    async def _runner_wrapper():
        try:
            await runner
        finally:
            asyncio.create_task(_cleanup_task_later(task_id))

    bg = asyncio.create_task(_runner_wrapper())
    async with _active_tts_installs_lock:
        st = _active_tts_installs.get(task_id)
        if st:
            st["_task"] = bg

    logger.info(f"Started TTS install {task_id}")
    return {
        "success": True,
        "task_id": task_id,
        "started": True,
        "already_running": False,
    }


@router.get("/tts/install/stream")
async def tts_install_stream(task_id: str):
    """SSE stream of install progress for the given task_id.

    Heartbeats every 15s as `:keepalive\\n\\n` so reverse proxies don't idle
    the connection. Closes after `done` or `error`. If the task_id is unknown
    we send a single `error` event with code=not_tracked then close.
    """
    async with _active_tts_installs_lock:
        st = _active_tts_installs.get(task_id)
        if not st:
            async def _not_tracked() -> AsyncGenerator[bytes, None]:
                payload = json.dumps({
                    "task_id": task_id,
                    "error": "not_tracked",
                    "code": "cancelled",
                })
                yield f"event: error\ndata: {payload}\n\n".encode("utf-8")
            return StreamingResponse(
                _not_tracked(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        st.setdefault("_queues", []).append(queue)
        # Replay the most recent state so a late subscriber doesn't sit at 0%.
        initial_status = st["status"]
        initial_payload = {
            "task_id": task_id,
            "percent": st["percent"],
            "bytes_done": st["bytes_done"],
            "bytes_total": st["bytes_total"],
            "speed": st["speed"],
            "stage": st["stage"],
        }

    async def _gen() -> AsyncGenerator[bytes, None]:
        try:
            # Initial snapshot.
            yield f"event: progress\ndata: {json.dumps(initial_payload)}\n\n".encode("utf-8")
            if initial_status in ("done", "error"):
                async with _active_tts_installs_lock:
                    st2 = _active_tts_installs.get(task_id) or {}
                if initial_status == "done":
                    final = {
                        "task_id": task_id,
                        "engine": st2.get("engine"),
                        "voice": st2.get("voice"),
                        "path": _piper_voices_dir() if st2.get("engine") == "piper" else _kokoro_marker_dir(),
                    }
                    yield f"event: done\ndata: {json.dumps(final)}\n\n".encode("utf-8")
                else:
                    final = {
                        "task_id": task_id,
                        "error": st2.get("error") or "unknown",
                        "code": "cancelled" if st2.get("error") == "cancelled" else "network",
                    }
                    yield f"event: error\ndata: {json.dumps(final)}\n\n".encode("utf-8")
                return

            while True:
                try:
                    event, payload = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield b":keepalive\n\n"
                    continue
                data = json.dumps(payload)
                yield f"event: {event}\ndata: {data}\n\n".encode("utf-8")
                if event in ("done", "error"):
                    return
        finally:
            async with _active_tts_installs_lock:
                st2 = _active_tts_installs.get(task_id)
                if st2 and queue in st2.get("_queues", []):
                    st2["_queues"].remove(queue)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/tts/install/status")
async def tts_install_status(task_id: str):
    """Poll-based fallback for clients that can't use SSE.

    Matches the Ollama pattern: 200 with success=false + error=not_tracked
    when the task_id is unknown, NOT a 404. Keeps the frontend's polling
    loop branch-free.
    """
    async with _active_tts_installs_lock:
        st = _active_tts_installs.get(task_id.strip())
        if not st:
            return {"success": False, "error": "not_tracked"}
        return {
            "success": True,
            "task_id": st["task_id"],
            "engine": st["engine"],
            "voice": st["voice"],
            "status": st["status"],
            "percent": st["percent"],
            "bytes_done": st["bytes_done"],
            "bytes_total": st["bytes_total"],
            "speed": st["speed"],
            "stage": st["stage"],
            "started_at": st["started_at"],
            "error": st["error"],
        }
