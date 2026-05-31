"""
EduTutor.AI — System / Hardware API
Detects hardware capabilities and returns recommended configuration profile.
"""
import asyncio
import logging
import os
import platform
import subprocess
import time
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Cache hardware detection — subprocess + torch.cuda probes are slow and stable.
# Hardware doesn't change while the process is running, but we still expire so
# new ollama-pulled models become visible without a backend restart.
_HW_CACHE: dict = {"data": None, "ts": 0.0}
_HW_CACHE_TTL_S = 60.0
_HW_CACHE_LOCK = asyncio.Lock()


# ── v0.7.8: live Ollama pull progress tracking ──────────────────────────────
# In-memory map of in-flight `ollama pull` subprocesses. The drain task reads
# the subprocess stdout (which Ollama uses for progress updates via \r-overwritten
# lines), parses each progress line into percent / bytes / speed / eta, and
# updates the dict so /system/ollama-pull/status?model=X can read it.
#
# Entries are removed 60 s after the pull finishes (done OR error) so a
# polling client can see the final state, then the entry self-cleans.
#
# Survival: this is module-level — it does NOT survive backend restart. After
# a restart the subprocess continues (it's spawned without parent process
# tracking), but our status endpoint returns 404 until the client re-issues
# POST /system/ollama-pull (which is idempotent — Ollama dedupes by model).
_active_pulls: Dict[str, dict] = {}
_active_pulls_lock = asyncio.Lock()

# Ollama prints layer progress lines like:
#   pulling 7cd4618c1faf:  12% ▕██                ▏  96 MB/815 MB   55 MB/s     12s
# (older versions used `...` after the sha instead of `:`). The block-char
# gauge is non-ASCII but we don't capture it — only the semantic fields.
# v0.7.8: tested against live ollama 0.x output — sha is followed by `:` OR
# `...`, ETA has NO `~` prefix and may be `12s` / `1m30s` / `2h` etc.
import re as _re
_ANSI_ESC_RE = _re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07")
_PULL_LINE_RE = _re.compile(
    r"pulling\s+(?P<sha>[a-f0-9]+)(?:\.\.\.|:)\s+"
    r"(?P<pct>\d+)\s*%"
    r".*?"
    r"(?P<done>[\d.]+\s*[KMGT]?B)\s*/\s*(?P<total>[\d.]+\s*[KMGT]?B)"
    r"(?:.*?(?P<speed>[\d.]+\s*[KMGT]?B/s))?"
    r"(?:\s+(?P<eta>\d+[hms](?:\d+[ms])*|\d+m\d+s|--))?",
    _re.IGNORECASE,
)


def _parse_size_to_bytes(s: str) -> int:
    """Turn '2.1 GB' / '512 MB' / '900 KB' / '7.0 KB' into bytes (int)."""
    if not s:
        return 0
    s = s.strip().upper().replace(" ", "")
    multipliers = {"TB": 1 << 40, "GB": 1 << 30, "MB": 1 << 20, "KB": 1 << 10, "B": 1}
    for suffix, mul in multipliers.items():
        if s.endswith(suffix):
            try:
                return int(float(s[: -len(suffix)]) * mul)
            except ValueError:
                return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


async def _drain_pull(model: str, proc: "asyncio.subprocess.Process") -> None:
    """Read subprocess stdout in raw chunks, split on \\r AND \\n (ollama
    overwrites progress lines with \\r), parse each line, update state dict.
    On EOF / non-zero exit, mark final status and schedule cleanup."""
    buf = b""
    try:
        while True:
            chunk = await proc.stdout.read(4096) if proc.stdout else b""
            if not chunk:
                break
            buf += chunk
            # Split on both line terminators ollama uses.
            while True:
                # Find earliest \r or \n.
                positions = [i for i in (buf.find(b"\r"), buf.find(b"\n")) if i != -1]
                if not positions:
                    break
                idx = min(positions)
                raw = buf[:idx]
                buf = buf[idx + 1:]
                line = raw.decode("utf-8", errors="replace")
                # v0.7.8: strip ANSI escape sequences ollama writes for
                # terminal cursor positioning (\x1b[K, \x1b[?25l, \x1b[1G…).
                # Without this our regex misses everything past the first ANSI.
                line = _ANSI_ESC_RE.sub("", line).strip()
                if not line:
                    continue
                async with _active_pulls_lock:
                    st = _active_pulls.get(model)
                    if not st:
                        return
                    st["last_line"] = line
                    # Terminal phase markers
                    if line == "success":
                        st["status"] = "done"
                        st["percent"] = 100
                        continue
                    if line.startswith("error"):
                        st["status"] = "error"
                        st["error"] = line[6:].strip(": ") or "unknown error"
                        continue
                    # Progress line
                    m = _PULL_LINE_RE.search(line)
                    if m:
                        try:
                            st["percent"] = int(m.group("pct"))
                            st["bytes_done"] = _parse_size_to_bytes(m.group("done") or "")
                            st["bytes_total"] = _parse_size_to_bytes(m.group("total") or "")
                            st["speed"] = (m.group("speed") or "").strip()
                            st["eta"] = (m.group("eta") or "").strip()
                            st["current_layer"] = (m.group("sha") or "")[:12]
                        except Exception as exc:
                            logger.debug("pull line parse non-fatal: %s (line=%r)", exc, line)
        rc = await proc.wait()
        async with _active_pulls_lock:
            st = _active_pulls.get(model)
            if st and st["status"] == "running":
                st["status"] = "done" if rc == 0 else "error"
                if rc != 0 and not st.get("error"):
                    st["error"] = f"exit {rc}"
                if rc == 0:
                    st["percent"] = 100
    except Exception as exc:
        logger.warning("ollama pull drain failed for %s: %s", model, exc)
        async with _active_pulls_lock:
            st = _active_pulls.get(model)
            if st:
                st["status"] = "error"
                st["error"] = str(exc)
    finally:
        # Schedule cleanup so a polling client can see the final state once,
        # then the entry self-removes.
        async def _cleanup() -> None:
            await asyncio.sleep(60)
            async with _active_pulls_lock:
                _active_pulls.pop(model, None)
        asyncio.create_task(_cleanup())


# ── Hardware profiles ────────────────────────────────────────────────────────

PROFILES = {
    "minimal": {
        "label": "Minimal",
        "description": "8GB RAM or less — basic local setup",
        "ram_gb_min": 0,
        "ram_gb_max": 10,
        "stt": {
            "recommended": "faster-whisper-sk-small",
            "why": "Lightweight CPU model, ~1s, no GPU needed",
            "alternatives": ["mlx-whisper-turbo (Apple Silicon only)"],
        },
        "llm": {
            "recommended": "openai",
            "model": "gpt-4o-mini",
            "why": "Local 7B+ models need 8GB just for the model — leaves no RAM",
            "local_option": "ollama:phi4-mini (3.8GB) if you want offline",
            "alternatives": ["ollama:phi4-mini", "groq (free tier, fastest)"],
        },
        "tts": {
            "recommended": "edge",
            "voice": "sk-SK-LukasNeural",
            "why": "Free, no install, decent quality",
            "local_option": "piper (30ms, needs model download)",
        },
        "install": [
            "pip install faster-whisper",
            "# Optional local TTS: pip install piper-tts",
            "# ollama pull phi4-mini  (3.8GB)",
        ],
    },

    "standard": {
        "label": "Standard",
        "description": "16GB RAM — Apple Silicon M1/M2/M3 or modern laptop",
        "ram_gb_min": 10,
        "ram_gb_max": 24,
        "stt": {
            "recommended": "mlx-whisper-turbo",
            "why": "Apple Neural Engine, ~500ms, best local accuracy",
            "alternatives": ["faster-whisper-sk-small (cross-platform)"],
        },
        "llm": {
            "recommended": "openai",
            "model": "gpt-4o-mini",
            "why": "~4s latency, best quality, free tier exists",
            "local_option": "ollama:gemma3:4b via mlx-lm (~3s, fits in 16GB)",
            "alternatives": [
                "groq:llama-3.3-70b (free API, ~0.5s)",
                "ollama:gemma3:12b (8.1GB, 16GB tight — ~40s, text only)",
            ],
        },
        "tts": {
            "recommended": "edge",
            "voice": "sk-SK-LukasNeural",
            "why": "Free cloud, ~1s — enough for 16GB where LLM is the bottleneck",
            "local_option": "piper sk_SK-lili-medium (30ms, fully offline)",
        },
        "install": [
            "pip install mlx-whisper  # Apple Silicon only",
            "pip install faster-whisper  # cross-platform fallback",
            "brew install ollama && ollama serve",
            "ollama pull gemma3:4b  # 3.3GB — fast local option",
            "# Optional Piper TTS:",
            "pip install piper-tts",
            "# Download: https://huggingface.co/rhasspy/piper-voices/resolve/main/sk/sk_SK/lili/medium/sk_SK-lili-medium.onnx",
        ],
    },

    "performance": {
        "label": "Performance",
        "description": "32–64GB unified memory (M3 Max / M4 Max / Ultra)",
        "ram_gb_min": 24,
        "ram_gb_max": 72,
        "stt": {
            "recommended": "mlx-whisper-large-v3",
            "why": "Full large model on Neural Engine, ~300ms, highest accuracy",
            "alternatives": ["faster-whisper-large-v3 (CUDA if available)"],
        },
        "llm": {
            "recommended": "ollama:gemma3:27b via mlx-lm",
            "model": "gemma3:27b",
            "why": "Fits in 32GB, excellent multilingual + Slovak, ~3s via mlx-lm",
            "local_option": "mlx-lm + mlx-community/gemma-3-27b-it-4bit (~15GB)",
            "alternatives": [
                "ollama:llama3.3:70b-q4 (40GB, needs 64GB+)",
                "ollama:qwen2.5:32b (18GB, very good multilingual)",
            ],
        },
        "tts": {
            "recommended": "piper",
            "voice": "sk_SK-lili-medium",
            "why": "30ms local, fully offline, frees up pipeline",
            "upgrade": "XTTS v2 with voice cloning (~200ms, near-human quality)",
        },
        "install": [
            "pip install mlx-whisper mlx-lm",
            "brew install ollama && ollama serve",
            "ollama pull gemma3:27b  # 17GB",
            "# Or via mlx-lm (3-5x faster than Ollama on Apple Silicon):",
            "pip install mlx-lm",
            "mlx_lm.convert --hf-path google/gemma-3-27b-it --mlx-path ./models/gemma3-27b-mlx -q",
            "# Piper TTS:",
            "pip install piper-tts",
            "# XTTS v2 (better quality):",
            "pip install TTS",
        ],
    },

    "power": {
        "label": "Power",
        "description": "NVIDIA GPU 24GB+ VRAM (RTX 4090 / A10 / L40)",
        "ram_gb_min": 72,
        "ram_gb_max": 9999,
        "gpu_vram_min": 20,
        "stt": {
            "recommended": "faster-whisper-large-v3",
            "why": "CTranslate2 + CUDA — ~50ms, 10x faster than CPU, best accuracy",
            "alternatives": ["whisper.cpp with CUDA backend"],
        },
        "llm": {
            "recommended": "vLLM + Llama 3.3 70B Q4",
            "model": "llama3.3:70b-q4_K_M",
            "why": "vLLM continuous batching, ~500ms first token, best open-source quality",
            "alternatives": [
                "vLLM + Qwen2.5-72B-Instruct-Q4 (better multilingual)",
                "Ollama + llama3.3:70b (simpler setup, ~2x slower than vLLM)",
            ],
        },
        "tts": {
            "recommended": "StyleTTS2 or Kokoro-82M",
            "why": "~50ms on GPU, near-human quality, Apache 2.0",
            "upgrade": "F5-TTS (voice cloning in <1s, SOTA quality)",
        },
        "streaming_architecture": {
            "description": "Full streaming pipeline becomes viable at this tier",
            "stt_streaming": "faster-whisper streaming mode — transcribe while user speaks",
            "llm_streaming": "vLLM speculative decoding — faster first token",
            "tts_streaming": "Kokoro/StyleTTS2 chunked — audio starts before LLM finishes",
            "total_latency": "~300-600ms perceived (vs ~4.8s current)",
        },
        "install": [
            "pip install vllm  # requires CUDA 11.8+",
            "pip install faster-whisper",
            "vllm serve meta-llama/Llama-3.3-70B-Instruct --quantization awq --max-model-len 8192",
            "# Kokoro TTS:",
            "pip install kokoro-onnx",
            "# StyleTTS2:",
            "pip install styletts2",
        ],
    },

    "server": {
        "label": "Server",
        "description": "80GB+ VRAM (A100 / H100) or multi-GPU",
        "ram_gb_min": 0,
        "gpu_vram_min": 80,
        "stt": {
            "recommended": "faster-whisper-large-v3",
            "why": "CTranslate2 + CUDA — ~20ms on A100, best accuracy",
        },
        "llm": {
            "recommended": "vLLM + Llama 3.1 405B Q4 or Qwen2.5-72B full precision",
            "model": "Llama-3.1-405B-Instruct",
            "why": "Full precision 70B/405B, speculative decoding, <200ms first token",
            "alternatives": ["SGLang (faster than vLLM for structured output)"],
        },
        "tts": {
            "recommended": "F5-TTS or E2-TTS",
            "why": "State of the art, voice cloning, ~30ms on A100",
        },
        "streaming_architecture": {
            "description": "True real-time duplex — sub-500ms end to end",
            "stt_streaming": "Live ASR — transcribe every 200ms chunk",
            "llm_streaming": "vLLM + speculative decoding",
            "tts_streaming": "Token-level synthesis — audio starts on first LLM token",
            "total_latency": "<500ms — indistinguishable from human",
        },
        "install": [
            "pip install vllm flash-attn",
            "# Multi-GPU: vllm serve --tensor-parallel-size 4 ...",
            "pip install sglang  # alternative to vLLM",
        ],
    },
}


# ── Hardware detection ────────────────────────────────────────────────────────

def _get_ram_gb() -> float:
    try:
        import psutil
        return round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except ImportError:
        pass
    try:
        if platform.system() == "Darwin":
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True)
            return round(int(out.strip()) / (1024 ** 3), 1)
        elif platform.system() == "Linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        kb = int(line.split()[1])
                        return round(kb / (1024 ** 2), 1)
    except Exception:
        pass
    return 16.0  # safe default


def _get_cpu_info() -> dict:
    info = {"brand": platform.processor() or "unknown", "arch": platform.machine()}
    try:
        if platform.system() == "Darwin":
            out = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
            if not out:
                out = subprocess.check_output(["sysctl", "-n", "hw.model"], text=True).strip()
            info["brand"] = out
            info["is_apple_silicon"] = "Apple" in out or platform.machine() == "arm64"
        else:
            info["is_apple_silicon"] = False
    except Exception:
        info["is_apple_silicon"] = platform.machine() == "arm64"
    return info


def _get_gpu_info() -> dict:
    gpu = {"available": False, "backend": None, "vram_gb": None, "name": None}
    # NVIDIA
    try:
        import torch
        if torch.cuda.is_available():
            gpu["available"] = True
            gpu["backend"] = "cuda"
            gpu["name"] = torch.cuda.get_device_name(0)
            gpu["vram_gb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 1)
            return gpu
    except ImportError:
        pass
    # Apple MPS
    try:
        import torch
        if torch.backends.mps.is_available():
            gpu["available"] = True
            gpu["backend"] = "mps"
            gpu["name"] = "Apple Silicon GPU (unified memory)"
            return gpu
    except ImportError:
        pass
    # NVIDIA without torch
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            text=True, stderr=subprocess.DEVNULL, timeout=5,
        ).strip().split("\n")[0]
        name, vram_mb = out.split(", ")
        gpu["available"] = True
        gpu["backend"] = "cuda"
        gpu["name"] = name.strip()
        gpu["vram_gb"] = round(int(vram_mb.strip()) / 1024, 1)
    except Exception:
        pass
    return gpu


def _get_ollama_models() -> list:
    try:
        out = subprocess.check_output(["ollama", "list"], text=True, stderr=subprocess.DEVNULL, timeout=5)
        models = []
        for line in out.strip().split("\n")[1:]:
            if line.strip():
                models.append(line.split()[0])
        return models
    except Exception:
        return []


def _pick_profile(ram_gb: float, gpu: dict) -> str:
    vram = gpu.get("vram_gb") or 0
    if gpu.get("backend") == "cuda" and vram >= 80:
        return "server"
    if gpu.get("backend") == "cuda" and vram >= 20:
        return "power"
    if ram_gb >= 24:
        return "performance"
    if ram_gb >= 10:
        return "standard"
    return "minimal"


def _adjust_for_platform(profile: dict, cpu: dict, sys: str) -> dict:
    """
    Post-process a profile copy so recommendations match the actual platform.
    mlx-whisper → Apple Silicon only.
    brew → Mac only. Windows/Linux get their own install paths.
    """
    import copy
    p = copy.deepcopy(profile)
    is_apple = cpu.get("is_apple_silicon", False)
    is_windows = sys == "Windows"
    is_linux = sys == "Linux"

    # ── STT: mlx-whisper only makes sense on Apple Silicon ──────────────────
    if not is_apple:
        stt = p["stt"]
        if "mlx-whisper" in stt.get("recommended", ""):
            if "large" in stt["recommended"]:
                stt["recommended"] = "faster-whisper-large-v3"
                stt["why"] = "CTranslate2 — ~200ms on CPU, 50ms on CUDA, best accuracy"
            else:
                stt["recommended"] = "faster-whisper-sk-small"
                stt["why"] = "CTranslate2 — ~500ms on CPU, cross-platform, no GPU needed"
            stt["alternatives"] = ["mlx-whisper-turbo (Apple Silicon only)"]

    # ── LLM: remove Apple-specific local option if not Apple Silicon ─────────
    if not is_apple:
        llm = p.get("llm", {})
        if "mlx-lm" in llm.get("local_option", ""):
            llm["local_option"] = llm["local_option"].replace(" via mlx-lm", "").replace("via mlx-lm", "")

    # ── Install: swap brew for platform-appropriate commands ─────────────────
    new_install = []
    for line in p.get("install", []):
        if "brew install ollama" in line:
            if is_windows:
                new_install.append("# Ollama: download installer from https://ollama.com/download/windows")
            elif is_linux:
                new_install.append("curl -fsSL https://ollama.com/install.sh | sh")
            else:
                new_install.append(line)
        elif "pip install mlx" in line and not is_apple:
            new_install.append(f"# {line.strip()}  (Apple Silicon only — skip)")
        else:
            new_install.append(line)
    p["install"] = new_install

    # ── Description: drop Apple-specific wording on other platforms ──────────
    if not is_apple and "Apple Silicon" in p.get("description", ""):
        p["description"] = p["description"].split(" — ")[0] + f" — {sys}"

    return p


# ── API models ────────────────────────────────────────────────────────────────

class HardwareInfo(BaseModel):
    ram_gb: float
    cpu_brand: str
    is_apple_silicon: bool
    gpu_available: bool
    gpu_backend: Optional[str]
    gpu_name: Optional[str]
    gpu_vram_gb: Optional[float]
    platform: str
    ollama_models: list


class HardwareResponse(BaseModel):
    hardware: HardwareInfo
    profile: str
    profile_label: str
    profile_description: str
    recommended: dict


# ── Endpoint ─────────────────────────────────────────────────────────────────

def _detect_hardware_sync() -> dict:
    """Run every blocking probe in one shot — caller wraps in asyncio.to_thread."""
    return {
        "ram": _get_ram_gb(),
        "cpu": _get_cpu_info(),
        "gpu": _get_gpu_info(),
        "ollama_models": _get_ollama_models(),
    }


# Map client-supplied OS hints (sent by the browser via detectClientOS.ts)
# onto the Python `platform.system()` vocabulary so the profile adjuster
# downstream keeps working without changes.
_CLIENT_OS_TO_PYTHON_SYSTEM = {
    "macos": "Darwin",
    "windows": "Windows",
    "linux": "Linux",
}


@router.get("/system/hardware", response_model=HardwareResponse)
async def get_hardware(
    client_os: Optional[str] = None,
    client_apple_silicon: Optional[str] = None,
):
    """
    Detect hardware capabilities and return the recommended configuration profile.
    Used by the onboarding UI to suggest optimal STT / LLM / TTS settings.

    Server-side probes (psutil, torch.cuda, nvidia-smi, ollama list) discover
    RAM/CPU/GPU on the host running the backend. In a Docker deployment this
    host is always Linux regardless of the *user's* OS, so the frontend also
    sends `client_os` and `client_apple_silicon` query hints derived from
    navigator.userAgentData / navigator.userAgent. When present, those hints
    override the server-side OS so the install-command / mlx-whisper / brew
    logic in `_adjust_for_platform` recommends the right thing for the user.

    All probes are run in a thread so concurrent requests never block the
    FastAPI event loop, and the result is cached for 60s so the onboarding
    modal's repeat-polling is cheap.
    """
    async with _HW_CACHE_LOCK:
        now = time.monotonic()
        if _HW_CACHE["data"] is None or (now - _HW_CACHE["ts"]) > _HW_CACHE_TTL_S:
            _HW_CACHE["data"] = await asyncio.to_thread(_detect_hardware_sync)
            _HW_CACHE["ts"] = now
        detected = _HW_CACHE["data"]

    ram = detected["ram"]
    cpu = dict(detected["cpu"])
    gpu = detected["gpu"]
    ollama_models = detected["ollama_models"]

    sys_name = platform.system()
    if client_os:
        mapped = _CLIENT_OS_TO_PYTHON_SYSTEM.get(client_os.lower())
        if mapped:
            sys_name = mapped
    if client_apple_silicon is not None:
        cpu["is_apple_silicon"] = client_apple_silicon in ("1", "true", "yes")

    profile_key = _pick_profile(ram, gpu)
    profile = _adjust_for_platform(PROFILES[profile_key], cpu, sys_name)

    return HardwareResponse(
        hardware=HardwareInfo(
            ram_gb=ram,
            cpu_brand=cpu.get("brand", "unknown"),
            is_apple_silicon=cpu.get("is_apple_silicon", False),
            gpu_available=gpu["available"],
            gpu_backend=gpu.get("backend"),
            gpu_name=gpu.get("name"),
            gpu_vram_gb=gpu.get("vram_gb"),
            platform=sys_name,
            ollama_models=ollama_models,
        ),
        profile=profile_key,
        profile_label=profile["label"],
        profile_description=profile["description"],
        recommended=profile,
    )


@router.get("/system/profiles")
async def list_profiles():
    """Return all hardware profiles and their recommended configs."""
    return {
        "profiles": {
            key: {
                "label": p["label"],
                "description": p["description"],
                "stt": p["stt"]["recommended"],
                "llm": p["llm"]["recommended"],
                "tts": p["tts"]["recommended"],
            }
            for key, p in PROFILES.items()
        }
    }


# ── Provider combo registry ───────────────────────────────────────────────────
# Maps (profile, is_apple_silicon) → actual switchable provider IDs.
# These are the IDs the services accept at runtime.

def _combo_for(profile: str, is_apple: bool) -> dict:
    """Return the canonical {stt, llm, llm_model, tts, tts_voice} for a profile."""
    combos = {
        ("minimal",     False): dict(stt="faster-whisper-sk-small", llm="openai",     llm_model=None,              tts="edge",  tts_voice="sk-SK-LukasNeural"),
        ("minimal",     True):  dict(stt="faster-whisper-sk-small", llm="openai",     llm_model=None,              tts="edge",  tts_voice="sk-SK-LukasNeural"),
        ("standard",    False): dict(stt="faster-whisper-sk-small", llm="openai",     llm_model=None,              tts="edge",  tts_voice="sk-SK-LukasNeural"),
        ("standard",    True):  dict(stt="mlx-whisper-turbo",       llm="openai",     llm_model=None,              tts="edge",  tts_voice="sk-SK-LukasNeural"),
        ("performance", False): dict(stt="faster-whisper-large-v3", llm="ollama",     llm_model="gemma3:27b",      tts="edge",  tts_voice="sk-SK-LukasNeural"),
        ("performance", True):  dict(stt="mlx-whisper-large-v3",    llm="ollama",     llm_model="gemma3:27b",      tts="edge",  tts_voice="sk-SK-LukasNeural"),
        ("power",       False): dict(stt="faster-whisper-large-v3", llm="vllm",       llm_model="Qwen/Qwen2.5-32B-Instruct-AWQ", tts="edge", tts_voice="sk-SK-LukasNeural"),
        ("power",       True):  dict(stt="faster-whisper-large-v3", llm="vllm",       llm_model="Qwen/Qwen2.5-32B-Instruct-AWQ", tts="edge", tts_voice="sk-SK-LukasNeural"),
        ("server",      False): dict(stt="faster-whisper-large-v3", llm="vllm",       llm_model="meta-llama/Llama-3.3-70B-Instruct", tts="edge", tts_voice="sk-SK-LukasNeural"),
        ("server",      True):  dict(stt="faster-whisper-large-v3", llm="vllm",       llm_model="meta-llama/Llama-3.3-70B-Instruct", tts="edge", tts_voice="sk-SK-LukasNeural"),
    }
    return combos.get((profile, is_apple), combos[("standard", False)])


class ApplyRequest(BaseModel):
    profile: Optional[str] = None  # if None, auto-detect


class ApplyResult(BaseModel):
    profile: str
    applied: dict
    warnings: List[str]


@router.post("/system/apply", response_model=ApplyResult)
async def apply_profile(body: ApplyRequest = None):
    """
    Detect hardware (or accept explicit profile), then switch STT + LLM + TTS
    to the recommended combination for that tier.
    """
    warnings: List[str] = []

    # ── Detect hardware ──────────────────────────────────────────────────────
    ram    = _get_ram_gb()
    cpu    = _get_cpu_info()
    gpu    = _get_gpu_info()
    is_apple = cpu.get("is_apple_silicon", False)
    profile_key = (body.profile if body and body.profile else None) or _pick_profile(ram, gpu)

    combo = _combo_for(profile_key, is_apple)
    applied: dict = {}

    # ── Switch STT ───────────────────────────────────────────────────────────
    cached, dl_size = _stt_model_cached(combo["stt"])
    if not cached:
        warnings.append(f"STT model will download on first use ({dl_size}) — may take a few minutes")
    try:
        from app.services.stt_service import get_stt_service
        stt_svc = await get_stt_service()
        await stt_svc.switch_model(combo["stt"])
        applied["stt"] = combo["stt"]
    except Exception as e:
        warnings.append(f"STT switch failed: {e}")

    # ── Switch LLM ───────────────────────────────────────────────────────────
    try:
        from app.services.llm_service import get_llm_service
        llm_svc = await get_llm_service()
        llm_id = combo["llm"]
        llm_model = combo.get("llm_model")

        if llm_id.startswith("ollama") or llm_id == "ollama":
            if llm_model:
                llm_svc.set_ollama_model(llm_model)
            ok = llm_svc.set_provider("ollama")
            if not ok:
                warnings.append("Ollama not running — LLM kept at current provider")
                llm_id = llm_svc.provider
        elif llm_id == "vllm":
            if llm_model:
                llm_svc.set_vllm_model(llm_model)
            ok = llm_svc.set_provider("vllm")
            if not ok:
                # graceful fallback: openai → ollama → mock
                for fallback in ("openai", "ollama", "mock"):
                    if llm_svc.set_provider(fallback):
                        warnings.append(f"vLLM not configured (set VLLM_URL) — fell back to {fallback}")
                        llm_id = fallback
                        break
        else:
            ok = llm_svc.set_provider(llm_id)
            if not ok:
                warnings.append(f"LLM provider '{llm_id}' not available (missing API key?)")

        applied["llm"] = llm_svc.provider
        if llm_svc.provider == "ollama":
            applied["llm_model"] = llm_svc.ollama_model
        elif llm_svc.provider == "vllm":
            applied["llm_model"] = llm_svc.vllm_model
    except Exception as e:
        warnings.append(f"LLM switch failed: {e}")

    # ── Switch TTS ───────────────────────────────────────────────────────────
    try:
        from app.services.tts_service import get_tts_service
        tts_svc = await get_tts_service()
        ok = tts_svc.switch_provider(combo["tts"], combo.get("tts_voice"))
        if ok:
            applied["tts"] = combo["tts"]
            applied["tts_voice"] = combo.get("tts_voice", "")
        else:
            warnings.append(f"TTS provider '{combo['tts']}' not available — kept current")
            applied["tts"] = tts_svc.provider
    except Exception as e:
        warnings.append(f"TTS switch failed: {e}")

    return ApplyResult(profile=profile_key, applied=applied, warnings=warnings)


# ── STT model cache check ─────────────────────────────────────────────────────

# Maps STT model ID → (HuggingFace repo ID, human size string)
_STT_HF_REPOS: Dict[str, tuple] = {
    "faster-whisper-sk-small":  ("Systran/faster-whisper-small",          "~150 MB"),
    "faster-whisper-large-v3":  ("Systran/faster-whisper-large-v3",       "~1.5 GB"),
    "mlx-whisper-turbo":        ("mlx-community/whisper-large-v3-turbo",   "~800 MB"),
    "mlx-whisper-large-v3":     ("mlx-community/whisper-large-v3-mlx",    "~3 GB"),
}


def _stt_model_cached(model_id: str) -> tuple:
    """
    Returns (is_cached: bool, size_str: str).
    Defaults to (True, '') for unknown models so we never block unexpectedly.
    """
    info = _STT_HF_REPOS.get(model_id)
    if not info:
        return True, ""
    hf_repo, size = info
    cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
    if not os.path.isdir(cache_dir):
        return False, size
    dir_name = "models--" + hf_repo.replace("/", "--")
    model_dir = os.path.join(cache_dir, dir_name)
    snapshots = os.path.join(model_dir, "snapshots")
    if os.path.isdir(snapshots):
        try:
            return bool(next(os.scandir(snapshots), None)), size
        except OSError:
            pass
    return os.path.isdir(model_dir), size


# ── Current provider status ───────────────────────────────────────────────────

@router.get("/system/status")
async def get_status():
    """
    Return currently active provider IDs from the running service instances,
    plus an is_optimal flag comparing them to the recommended combo for this hardware.
    """
    result: Dict[str, Any] = {
        "stt": None, "llm": None, "llm_model": None, "tts": None, "lipsync": None, "is_optimal": False,
        "avatar_ws_clients": 0,
    }
    try:
        from app.services.avatar_broadcaster import get_avatar_broadcaster
        result["avatar_ws_clients"] = get_avatar_broadcaster().connection_count
    except Exception:
        pass

    try:
        from app.services.stt_service import get_stt_service
        stt = await get_stt_service()
        result["stt"] = stt.provider
    except Exception:
        pass

    try:
        from app.services.llm_service import get_llm_service
        llm = await get_llm_service()
        result["llm"] = llm.provider
        if llm.provider == "ollama":
            result["llm_model"] = llm.ollama_model
        elif llm.provider == "vllm":
            result["llm_model"] = llm.vllm_model
    except Exception:
        pass

    try:
        from app.services.tts_service import get_tts_service
        tts = await get_tts_service()
        result["tts"] = tts.provider
    except Exception:
        pass

    try:
        from app.services.audio2lipsync_client import get_lipsync_provider
        result["lipsync"] = get_lipsync_provider()
    except Exception:
        pass

    # Compare against optimal combo for this hardware
    try:
        ram     = _get_ram_gb()
        cpu     = _get_cpu_info()
        gpu     = _get_gpu_info()
        profile = _pick_profile(ram, gpu)
        combo   = _combo_for(profile, cpu.get("is_apple_silicon", False))
        result["is_optimal"] = (
            result["stt"] == combo["stt"]
            and result["llm"] == combo["llm"]
            and result["tts"] == combo["tts"]
        )
    except Exception:
        pass

    return result


# ── Availability check ────────────────────────────────────────────────────────

def _check_result(available: bool, reason: str, fix: Optional[str] = None) -> Dict[str, Any]:
    return {"available": available, "reason": reason, **({"fix": fix} if fix else {})}


@router.get("/system/check")
async def check_availability():
    """
    Live dependency and API-key availability check for all providers.
    Returns green/red status per service so the first-run UI can show exactly
    what is and isn't ready — and what to do about it.
    """
    results: Dict[str, Dict[str, Any]] = {"stt": {}, "llm": {}, "tts": {}}

    # ── STT ──────────────────────────────────────────────────────────────────
    try:
        import mlx_whisper  # noqa: F401
        results["stt"]["mlx-whisper-turbo"]     = _check_result(True,  "Ready — Apple Neural Engine")
        results["stt"]["mlx-whisper-large-v3"]  = _check_result(True,  "Ready — Apple Neural Engine")
    except ImportError:
        results["stt"]["mlx-whisper-turbo"]     = _check_result(False, "Not installed", "pip install mlx-whisper")
        results["stt"]["mlx-whisper-large-v3"]  = _check_result(False, "Not installed", "pip install mlx-whisper")

    try:
        import faster_whisper  # noqa: F401
        results["stt"]["faster-whisper-sk-small"]   = _check_result(True,  "Ready")
        results["stt"]["faster-whisper-large-v3"]   = _check_result(True,  "Ready")
    except ImportError:
        results["stt"]["faster-whisper-sk-small"]   = _check_result(False, "Not installed", "pip install faster-whisper")
        results["stt"]["faster-whisper-large-v3"]   = _check_result(False, "Not installed", "pip install faster-whisper")

    # ── LLM ──────────────────────────────────────────────────────────────────
    _raw_openai = os.getenv("OPENAI_API_KEY", "")
    if _raw_openai and _raw_openai.startswith("sk-") and len(_raw_openai) > 20 and _raw_openai != "sk-your-key-here":
        from app.services.provider_validator import validate_openai_key

        ok, msg = await validate_openai_key(_raw_openai, timeout=2.0)
        results["llm"]["openai"] = _check_result(ok, msg if ok else f"Key invalid: {msg}", None if ok else "Check your API key")
    else:
        results["llm"]["openai"] = _check_result(False, "API key not set", "Enter your OpenAI key below")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if anthropic_key:
        from app.services.provider_validator import validate_anthropic_key

        ok, msg = await validate_anthropic_key(anthropic_key, timeout=2.0)
        results["llm"]["anthropic"] = _check_result(ok, msg if ok else f"Key invalid: {msg}", None if ok else "Check your API key")
    else:
        results["llm"]["anthropic"] = _check_result(False, "API key not set", "Set ANTHROPIC_API_KEY in .env")

    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        from app.services.provider_validator import validate_groq_key

        ok, msg = await validate_groq_key(groq_key, timeout=2.0)
        results["llm"]["groq"] = _check_result(ok, msg if ok else f"Key invalid: {msg}", None if ok else "Check your API key")
    else:
        results["llm"]["groq"] = _check_result(False, "API key not set", "Free at console.groq.com")

    # DeepSeek — v0.5.4 fix. v0.5.2 added DeepSeek as a first-class provider
    # via /system/config but /system/check didn't list it, so the Providers
    # tab status icon never went green after save. Same shape as groq:
    # presence of DEEPSEEK_API_KEY env is sufficient signal (we don't have a
    # validate_deepseek_key helper yet; DeepSeek's API just rejects bad keys
    # at first /v1/chat/completions call).
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
    if deepseek_key and deepseek_key.startswith("sk-") and len(deepseek_key) > 20:
        results["llm"]["custom:deepseek"] = _check_result(True, "API key set", None)
    else:
        results["llm"]["custom:deepseek"] = _check_result(False, "API key not set", "Paste DeepSeek key in Providers tab")

    ollama_url = os.getenv("OLLAMA_URL", "")
    if ollama_url:
        try:
            host = ollama_url.replace("/v1", "").rstrip("/")
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get(f"{host}/api/tags")
            if resp.status_code == 200:
                models = [m["name"] for m in resp.json().get("models", [])]
                results["llm"]["ollama"] = {
                    **_check_result(True, f"{len(models)} model{'s' if len(models) != 1 else ''} available"),
                    "models": models,
                }
            else:
                results["llm"]["ollama"] = _check_result(False, "Ollama not responding", "ollama serve")
        except Exception:
            results["llm"]["ollama"] = _check_result(False, "Not running", "ollama serve")
    else:
        results["llm"]["ollama"] = _check_result(False, "OLLAMA_URL not set", "brew install ollama && ollama serve")

    vllm_url = os.getenv("VLLM_URL", "")
    if vllm_url:
        try:
            host = vllm_url.replace("/v1", "").rstrip("/")
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get(f"{host}/health")
            results["llm"]["vllm"] = _check_result(
                resp.status_code == 200,
                "Ready" if resp.status_code == 200 else "Not responding",
            )
        except Exception:
            results["llm"]["vllm"] = _check_result(False, "Not running", "vllm serve ...")
    else:
        results["llm"]["vllm"] = _check_result(False, "VLLM_URL not configured", "Set VLLM_URL=http://localhost:8001/v1 in .env")

    # ── TTS ──────────────────────────────────────────────────────────────────
    try:
        import edge_tts  # noqa: F401
        results["tts"]["edge"] = _check_result(True, "Ready — free cloud, no install needed")
    except ImportError:
        results["tts"]["edge"] = _check_result(False, "Not installed", "pip install edge-tts")

    piper_model = os.path.join(
        os.path.dirname(__file__), "..", "..", "models", "piper", "sk_SK-lili-medium.onnx"
    )
    try:
        import piper  # noqa: F401
        results["tts"]["piper"] = _check_result(
            os.path.exists(piper_model),
            "Ready" if os.path.exists(piper_model) else "Model file missing",
            None if os.path.exists(piper_model) else "Download sk_SK-lili-medium.onnx — see Install tab",
        )
    except ImportError:
        results["tts"]["piper"] = _check_result(False, "Not installed", "pip install piper-tts + download model")

    return results


@router.post("/system/download-piper")
async def download_piper_model():
    import httpx

    model_dir = os.path.join(os.path.dirname(__file__), "..", "..", "models", "piper")
    os.makedirs(model_dir, exist_ok=True)
    onnx_path = os.path.join(model_dir, "sk_SK-lili-medium.onnx")
    json_path = os.path.join(model_dir, "sk_SK-lili-medium.onnx.json")
    base_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/sk/sk_SK/lili/medium"

    if os.path.exists(onnx_path):
        return {"success": True, "message": "Model už existuje.", "size_mb": round(os.path.getsize(onnx_path) / 1048576, 1)}

    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            for filename, path in [("sk_SK-lili-medium.onnx", onnx_path), ("sk_SK-lili-medium.onnx.json", json_path)]:
                resp = await client.get(f"{base_url}/{filename}")
                resp.raise_for_status()
                with open(path, "wb") as f:
                    f.write(resp.content)

        size_mb = round(os.path.getsize(onnx_path) / 1048576, 1)
        return {"success": True, "message": f"Stiahnuté ({size_mb} MB). Piper TTS je pripravený.", "size_mb": size_mb}
    except Exception as e:
        return {"success": False, "message": f"Stiahnutie zlyhalo: {e}"}


class OllamaPullRequest(BaseModel):
    model: str


@router.post("/system/ollama-pull")
async def ollama_pull(body: OllamaPullRequest):
    """Pull an Ollama model in the background (one-click install from onboarding).

    Returns immediately. The client polls GET /system/ollama-pull/status?model=X
    for real-time progress (percent/speed/ETA) — added in v0.7.8. Legacy
    clients (FirstRunSetup) that poll /system/hardware for completion detection
    still work unchanged.

    When the Ollama binary itself is missing we return ``ollama_not_installed``
    so the UI can point the user at the download page instead of failing silently.
    """
    import shutil

    model = (body.model or "").strip()
    if not model:
        return {"success": False, "error": "no_model"}
    if shutil.which("ollama") is None:
        return {"success": False, "error": "ollama_not_installed", "install_url": "https://ollama.com/download"}

    # v0.7.8: dedupe concurrent pulls of the same model. Without this, the
    # legacy FirstRunSetup + the new onboarding choice could both POST and
    # spawn TWO `ollama pull` subprocesses (Ollama itself dedupes internally,
    # so they wouldn't corrupt anything, but we'd waste a slot in the dict
    # and double-write progress).
    async with _active_pulls_lock:
        existing = _active_pulls.get(model)
        if existing and existing["status"] == "running":
            logger.info(f"ollama pull for {model} already running — returning existing handle")
            return {"success": True, "started": False, "already_running": True, "model": model}

    try:
        # v0.7.8: switch from blocking subprocess.Popen(stdout=DEVNULL) to
        # asyncio subprocess with PIPE so the drain task can read progress.
        # MUST start the drain task immediately — without a reader, the pipe
        # buffer fills and the subprocess blocks. stderr merged to stdout
        # because ollama writes progress to stderr in some versions.
        proc = await asyncio.create_subprocess_exec(
            "ollama", "pull", model,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        async with _active_pulls_lock:
            _active_pulls[model] = {
                "model": model,
                "status": "running",
                "percent": 0,
                "bytes_done": 0,
                "bytes_total": 0,
                "speed": "",
                "eta": "",
                "current_layer": None,
                "started_at": time.time(),
                "last_line": "",
                "error": None,
                "_proc": proc,  # internal handle for DELETE
            }
        asyncio.create_task(_drain_pull(model, proc))
        logger.info(f"Started ollama pull (v0.7.8 tracked): {model} pid={proc.pid}")
        return {"success": True, "started": True, "model": model}
    except Exception as e:
        logger.warning(f"ollama pull failed to start: {e}")
        return {"success": False, "error": str(e)}


@router.get("/system/ollama-pull/status")
async def ollama_pull_status(model: str):
    """v0.7.8: poll for live Ollama pull progress.

    Returns 200 with state when a pull for this model has been started in the
    current backend process. Returns 404 when no pull is tracked (either never
    started, or finished + cleaned up 60 s ago, or a previous backend process
    started it and we restarted).

    The client should poll every ~800-1000 ms. Stop polling on status='done'
    or status='error'. On 404 the client should re-POST /system/ollama-pull
    if it wants progress (which is idempotent — Ollama dedupes by model).
    """
    async with _active_pulls_lock:
        st = _active_pulls.get(model.strip())
        if not st:
            return {"success": False, "error": "not_tracked", "model": model}
        # Don't leak the subprocess handle to JSON.
        return {
            "success": True,
            "model": st["model"],
            "status": st["status"],
            "percent": st["percent"],
            "bytes_done": st["bytes_done"],
            "bytes_total": st["bytes_total"],
            "speed": st["speed"],
            "eta": st["eta"],
            "current_layer": st["current_layer"],
            "started_at": st["started_at"],
            "last_line": st["last_line"],
            "error": st["error"],
        }


@router.delete("/system/ollama-pull")
async def ollama_pull_cancel(model: str):
    """v0.7.8: cancel an in-flight Ollama pull.

    Terminates the subprocess and marks status as 'error' with reason 'cancelled'.
    Idempotent — calling on a non-tracked or already-finished pull is a no-op
    with success=true so the UI doesn't have to special-case it.
    """
    async with _active_pulls_lock:
        st = _active_pulls.get(model.strip())
        if not st:
            return {"success": True, "cancelled": False, "reason": "not_tracked"}
        proc = st.get("_proc")
    if proc is not None and proc.returncode is None:
        try:
            proc.terminate()
        except ProcessLookupError:
            pass
        # Drain task will mark status=error when wait() returns.
    async with _active_pulls_lock:
        st = _active_pulls.get(model.strip())
        if st and st["status"] == "running":
            st["status"] = "error"
            st["error"] = "cancelled"
    return {"success": True, "cancelled": True, "model": model}


# ── Config (save API keys to .env + reinit services) ─────────────────────────

class ConfigRequest(BaseModel):
    openai_api_key:    Optional[str] = None
    anthropic_api_key: Optional[str] = None
    groq_api_key:      Optional[str] = None
    # DeepSeek — OpenAI-compatible API at https://api.deepseek.com/v1.
    # Added v0.5.2 for first-class provider parity instead of forcing
    # users through the custom-LLM URL/model boilerplate.
    deepseek_api_key:  Optional[str] = None
    # Custom OpenAI-compatible LLM provider (e.g. Together, OpenRouter, vLLM)
    custom_llm_name:   Optional[str] = None
    custom_llm_url:    Optional[str] = None
    custom_llm_key:    Optional[str] = None
    custom_llm_model:  Optional[str] = None
    # HLAS / TTS providers — saved from the HW Setup HLAS tab.
    # Azure Speech: subscription key + region (defaults to westeurope if region
    # omitted but key provided). ElevenLabs: single API key.
    azure_speech_key:    Optional[str] = None
    azure_speech_region: Optional[str] = None
    elevenlabs_api_key:  Optional[str] = None


def _write_env_key(key: str, value: str) -> None:
    """Update or append a key=value line in tutor-service/.env.

    Skips comment lines (starting with ``#``) so a commented-out key
    like ``# OPENAI_API_KEY=sk-old`` is never treated as the active value.
    Uses atomic write (write to temp file + os.replace) so concurrent
    API calls to /system/config cannot corrupt the file.
    """
    # EDU_ENV_FILE lets a packaged install redirect this to a writable location
    # (the app's per-user data dir); a read-only Program Files .env can't persist.
    env_path = os.getenv("EDU_ENV_FILE") or os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    try:
        lines: List[str] = []
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                lines = f.readlines()

        found = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" not in stripped:
                continue
            current_key = stripped.split("=", 1)[0].strip()
            if current_key == key:
                lines[i] = f"{key}={value}\n"
                found = True
                break

        if not found:
            lines.append(f"{key}={value}\n")

        tmp_path = env_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.writelines(lines)
        os.replace(tmp_path, env_path)

        logger.info(f"Wrote {key} to .env")
    except Exception as e:
        logger.warning(f"Could not write {key} to .env: {e}")


@router.post("/system/config")
async def save_config(body: ConfigRequest):
    """
    Save API keys to .env and reinitialize the relevant services live —
    no backend restart needed.
    """
    updated: List[str] = []
    warnings: List[str] = []

    if body.openai_api_key:
        key = body.openai_api_key.strip()
        if not (key.startswith("sk-") or key.startswith("sk-proj-")):
            return {"success": False, "error": "Invalid OpenAI key — must start with sk-"}
        from app.services.provider_validator import validate_openai_key

        ok, msg = await validate_openai_key(key)
        if not ok:
            return {"success": False, "error": f"OpenAI key rejected: {msg}"}
        os.environ["OPENAI_API_KEY"] = key
        _write_env_key("OPENAI_API_KEY", key)
        try:
            from app.services.llm_service import get_llm_service
            svc = await get_llm_service()
            await svc._init_openai(key)
            svc._available_providers["openai"] = True
            svc.set_provider("openai")
            updated.append("openai")
        except Exception as e:
            warnings.append(f"LLM reinit: {e}")

    if body.anthropic_api_key:
        key = body.anthropic_api_key.strip()
        from app.services.provider_validator import validate_anthropic_key

        ok, msg = await validate_anthropic_key(key)
        if not ok:
            return {"success": False, "error": f"Anthropic key rejected: {msg}"}
        os.environ["ANTHROPIC_API_KEY"] = key
        _write_env_key("ANTHROPIC_API_KEY", key)
        try:
            from app.services.llm_service import get_llm_service
            svc = await get_llm_service()
            await svc._init_anthropic(key)
            svc._available_providers["anthropic"] = True
            svc.set_provider("anthropic")
            updated.append("anthropic")
        except Exception as e:
            warnings.append(f"Anthropic reinit: {e}")

    if body.groq_api_key:
        key = body.groq_api_key.strip()
        from app.services.provider_validator import validate_groq_key

        ok, msg = await validate_groq_key(key)
        if not ok:
            return {"success": False, "error": f"Groq key rejected: {msg}"}
        os.environ["GROQ_API_KEY"] = key
        _write_env_key("GROQ_API_KEY", key)
        updated.append("groq")

    if body.deepseek_api_key:
        # DeepSeek uses OpenAI-compatible /v1/chat/completions, so we just
        # route through the existing _init_custom path with the right URL.
        # Models: deepseek-chat (general) + deepseek-coder (code).
        key = body.deepseek_api_key.strip()
        # v0.7.0 (W3): live validation via /v1/models, matching the OpenAI
        # path. Previously the only check was an `sk-` prefix — a typo'd
        # key showed green in the UI and crashed at first chat call.
        from app.services.provider_validator import validate_deepseek_key
        ds_ok, ds_msg = await validate_deepseek_key(key)
        if not ds_ok:
            return {"success": False, "error": f"DeepSeek: {ds_msg}"}
        os.environ["DEEPSEEK_API_KEY"] = key
        _write_env_key("DEEPSEEK_API_KEY", key)
        try:
            from app.services.llm_service import get_llm_service
            svc = await get_llm_service()
            await svc._init_custom("deepseek", "https://api.deepseek.com/v1", key, "deepseek-chat")
            svc.set_provider("custom:deepseek")
            updated.append("deepseek")
        except Exception as e:
            warnings.append(f"DeepSeek reinit: {e}")

    # Custom OpenAI-compatible LLM provider (e.g. Together, Groq, DeepInfra, OpenRouter, vLLM)
    if body.custom_llm_name and body.custom_llm_url:
        name = body.custom_llm_name.strip()
        url = body.custom_llm_url.strip().rstrip("/")
        key = (body.custom_llm_key or "").strip()
        model = (body.custom_llm_model or "default").strip()
        env_var = f"CUSTOM_LLM_{name.upper().replace(' ', '_')}_URL"
        os.environ[env_var] = url
        _write_env_key(env_var, url)
        if key:
            key_env = f"CUSTOM_LLM_{name.upper().replace(' ', '_')}_KEY"
            os.environ[key_env] = key
            _write_env_key(key_env, key)
        model_env = f"CUSTOM_LLM_{name.upper().replace(' ', '_')}_MODEL"
        os.environ[model_env] = model
        _write_env_key(model_env, model)
        try:
            from app.services.llm_service import get_llm_service
            svc = await get_llm_service()
            await svc._init_custom(name, url, key, model)
            svc.set_provider(f"custom:{name}")
        except Exception as e:
            warnings.append(f"Custom LLM reinit: {e}")
        updated.append(f"custom:{name}")

    # ── HLAS / TTS providers ────────────────────────────────────────────────
    # These are cloud-TTS BYOK keys saved from the HW Setup HLAS tab.
    # We deliberately do NOT make live validation calls here:
    #   - Azure Speech has no cheap idempotent probe (token endpoint costs).
    #   - ElevenLabs free tier is rate-limited; burning quota on every Save
    #     would be hostile to the user.
    # Instead we sanity-check the key format and rely on the next real TTS
    # call to surface any auth error.
    tts_touched = False

    if body.azure_speech_key:
        key = body.azure_speech_key.strip()
        # Azure Speech keys are 32-char hex/alphanumeric. Accept anything that
        # looks plausible (>=32 alphanumeric chars). No live call.
        if len(key) < 32 or not all(c.isalnum() for c in key):
            return {
                "success": False,
                "error": "Invalid Azure Speech key — expected 32+ alphanumeric characters",
            }
        # Region default: HLAS tab may submit the key without a region.
        # westeurope is the closest low-latency region for SK/CZ users and
        # matches the default in tts_service.initialize().
        region = (body.azure_speech_region or "").strip() or "westeurope"
        os.environ["AZURE_SPEECH_KEY"] = key
        os.environ["AZURE_SPEECH_REGION"] = region
        _write_env_key("AZURE_SPEECH_KEY", key)
        _write_env_key("AZURE_SPEECH_REGION", region)
        updated.append("azure-tts")
        tts_touched = True

    if body.elevenlabs_api_key:
        key = body.elevenlabs_api_key.strip()
        # ElevenLabs keys historically start with "sk_" but legacy keys are
        # 32+ alphanumeric. Accept either shape.
        if not (key.startswith("sk_") or (len(key) >= 32 and all(c.isalnum() or c in "_-" for c in key))):
            return {
                "success": False,
                "error": "Invalid ElevenLabs key — expected sk_… or 32+ char key",
            }
        os.environ["ELEVENLABS_API_KEY"] = key
        _write_env_key("ELEVENLABS_API_KEY", key)
        updated.append("elevenlabs")
        tts_touched = True

    if tts_touched:
        # tts_service.py (as of 2026-05-30) exposes no `reinitialize()` /
        # `reinitialize_from_env()` method — the singleton reads env vars
        # once in initialize(). We re-run initialize() on the existing
        # instance so the new AZURE_SPEECH_KEY / region propagate without a
        # backend restart. ElevenLabs has no wired provider in tts_service
        # yet, so for it we rely on the env var alone (any future provider
        # will read ELEVENLABS_API_KEY at construction time).
        try:
            from app.services.tts_service import get_tts_service
            svc = await get_tts_service()
            if hasattr(svc, "reinitialize_from_env"):
                await svc.reinitialize_from_env()
            elif hasattr(svc, "reinitialize"):
                await svc.reinitialize()
            else:
                # Fall back to re-running initialize() on the live singleton.
                # Safe: initialize() just re-reads env + rebuilds speech_config.
                await svc.initialize()
        except Exception as e:
            warnings.append(f"TTS reinit: {e}")

    if updated:
        from app.services.llm_service import get_llm_service
        svc = await get_llm_service()
        logger.info(f"Active LLM provider after config: {svc.provider}")

    return {"success": True, "updated": updated, "warnings": warnings}
