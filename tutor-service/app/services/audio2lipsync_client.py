# tutor-service/app/services/audio2lipsync_client.py
#
# Audio2Lipsync integration — local inference, no external sidecar.
# Model code from github.com/aaryansachdeva/unreal-audio2lipsync (MIT license).
# Pre-trained weights from huggingface.co/fotonlabs/unreal-audio2lipsync (MIT).
#
# Architecture: a single Audio2LipsyncRuntime class encapsulates the model,
# normalisation stats, and provider selection. The module-level functions are
# thin wrappers around a singleton instance — preserves the historical public
# API while making the state inspectable, mockable, and ready for FastAPI
# Depends-based injection.
import io
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

_MODEL_DIR = Path(__file__).parent / "audio2lipsync"
_STATS_DIR = _MODEL_DIR / "stats"
_CHECKPOINT_PATH = Path(os.getenv(
    "AUDIO2LIPSYNC_CHECKPOINT",
    str(Path(__file__).parent.parent.parent / "models" / "audio2lipsync" / "best.pt"),
))

_VALID_PROVIDERS = ("text", "audio2lipsync", "hybrid")


class Audio2LipsyncRuntime:
    """Local Audio2Lipsync inference runtime.

    Holds the loaded model, normalisation stats, and active-provider state.
    Instantiated lazily; ``ensure_model()`` returns False if the checkpoint
    cannot be downloaded or the model fails to load — callers fall back to
    text-based viseme generation.
    """

    def __init__(self, default_provider: Optional[str] = None) -> None:
        self.active_provider: str = default_provider or os.getenv("LIPSYNC_PROVIDER", "hybrid")
        self._model = None
        self._mean: Optional[np.ndarray] = None
        self._std: Optional[np.ndarray] = None
        self._device: Optional[str] = None
        self._arkit_channels: Optional[List[str]] = None
        self._face_fps: int = 60
        self._audio_sr: int = 16000

    def set_provider(self, provider: str) -> bool:
        if provider not in _VALID_PROVIDERS:
            return False
        self.active_provider = provider
        return True

    def _download_checkpoint(self) -> bool:
        if _CHECKPOINT_PATH.exists():
            return True
        try:
            from huggingface_hub import hf_hub_download
            _CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
            hf_hub_download(
                "fotonlabs/unreal-audio2lipsync",
                "best.pt",
                local_dir=str(_CHECKPOINT_PATH.parent),
            )
            logger.info(f"Downloaded Audio2Lipsync checkpoint to {_CHECKPOINT_PATH}")
            return True
        except Exception as e:
            logger.error(f"Failed to download Audio2Lipsync checkpoint: {e}")
            return False

    def ensure_model(self) -> bool:
        if self._model is not None:
            return True
        if not self._download_checkpoint():
            return False
        try:
            import sys
            if str(_MODEL_DIR) not in sys.path:
                sys.path.insert(0, str(_MODEL_DIR))

            import torch
            from model import LipSyncModel
            from constants import ARKIT_CHANNELS, N_BLENDSHAPES, FACE_FPS, AUDIO_SR

            if torch.backends.mps.is_available():
                self._device = "mps"
            elif torch.cuda.is_available():
                self._device = "cuda"
            else:
                self._device = "cpu"

            model = LipSyncModel()
            ckpt = torch.load(str(_CHECKPOINT_PATH), map_location="cpu", weights_only=False)
            state = ckpt.get("ema_state_dict") or ckpt.get("model_state_dict") or ckpt
            model.load_state_dict(state, strict=False)
            model = model.to(self._device).eval()

            self._model = model
            self._mean = np.load(str(_STATS_DIR / "mean.npy"))
            self._std = np.load(str(_STATS_DIR / "std.npy"))
            self._arkit_channels = ARKIT_CHANNELS[:N_BLENDSHAPES]
            self._face_fps = FACE_FPS
            self._audio_sr = AUDIO_SR

            param_count = sum(p.numel() for p in model.parameters()) / 1e6
            logger.info(f"Audio2Lipsync loaded: {param_count:.1f}M params on {self._device}")
            return True
        except Exception as e:
            logger.error(f"Audio2Lipsync model load failed: {e}")
            return False

    async def generate_from_audio(
        self,
        audio_bytes: bytes,
        fps: int = 60,
        gain: float = 1.5,
        smooth_window: int = 3,
    ) -> Optional[Dict[str, Any]]:
        if not self.ensure_model():
            return None
        try:
            import torch
            import soundfile as sf

            tmp_f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp = tmp_f.name
            tmp_f.close()
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", "pipe:0", "-ar", str(self._audio_sr), "-ac", "1", tmp],
                    input=audio_bytes, capture_output=True, timeout=10,
                )
                data, sr = sf.read(tmp)
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)

            wav = torch.tensor(data, dtype=torch.float32).unsqueeze(0)
            duration_s = wav.shape[1] / self._audio_sr
            n_frames = int(duration_s * fps)

            with torch.no_grad():
                pred = self._model(wav.to(self._device), n_face_frames=n_frames)
                pred = pred.cpu().numpy()[0]

            pred = pred * self._std + self._mean
            pred = np.clip(pred, 0.0, 1.0)

            if gain != 1.0:
                pred = np.clip(pred * gain, 0.0, 1.0)

            if smooth_window > 1:
                from scipy.ndimage import uniform_filter1d
                pred = uniform_filter1d(pred, size=smooth_window, axis=0)

            arkit_raw: Dict[str, List[float]] = {}
            for ch_idx, ch_name in enumerate(self._arkit_channels or []):
                arkit_raw[ch_name] = pred[:, ch_idx].tolist()

            return {
                "fps": fps,
                "n_frames": pred.shape[0],
                "duration": duration_s,
                "arkit_raw": arkit_raw,
            }
        except Exception as e:
            logger.error(f"Audio2Lipsync inference failed: {e}")
            return None


# Module-level singleton — keeps the historical public API working.
_runtime: Optional[Audio2LipsyncRuntime] = None


def _get_runtime() -> Audio2LipsyncRuntime:
    global _runtime
    if _runtime is None:
        _runtime = Audio2LipsyncRuntime()
    return _runtime


def get_lipsync_provider() -> str:
    return _get_runtime().active_provider


def set_lipsync_provider(provider: str) -> bool:
    return _get_runtime().set_provider(provider)


async def check_health() -> bool:
    return _get_runtime().ensure_model()


async def generate_from_audio(
    audio_bytes: bytes,
    fps: int = 60,
    gain: float = 1.5,
    smooth_window: int = 3,
) -> Optional[Dict[str, Any]]:
    return await _get_runtime().generate_from_audio(audio_bytes, fps=fps, gain=gain, smooth_window=smooth_window)


def arkit_to_frames(
    arkit_raw: Dict[str, List[float]],
    fps: int = 60,
) -> Tuple[List[Dict[str, Any]], int]:
    if not arkit_raw:
        return [], 0

    first_key = next(iter(arkit_raw))
    n_frames = len(arkit_raw[first_key])
    duration_ms = int(n_frames / fps * 1000)

    frames: List[Dict[str, Any]] = []
    for i in range(n_frames):
        channels: Dict[str, float] = {}
        for ch_name, values in arkit_raw.items():
            if i < len(values):
                v = values[i]
                if v > 0.005:
                    channels[ch_name] = round(v, 4)
        frames.append({
            "start_ms": int(i / fps * 1000),
            "duration_ms": int(1000 / fps),
            "arkit": channels,
        })

    return frames, duration_ms
