"""FFmpeg audio concat helper for podcast generation.

Pure subprocess wrapper around system FFmpeg (no new Python deps).
Concatenates a list of MP3 files into one output MP3.

Used by podcast_service.run_podcast_job. Graceful-degrade contract:
log warning + return False on any failure; never raise.
"""
from __future__ import annotations
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT_SECONDS = 120


def ffmpeg_available() -> bool:
    """Cheap probe so the orchestrator can short-circuit if ffmpeg is missing."""
    return shutil.which("ffmpeg") is not None


def concat_mp3s(
    input_paths: Iterable[Path | str],
    output_path: Path | str,
    *,
    timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS,
) -> bool:
    """Concatenate MP3 files using FFmpeg's `concat` demuxer.

    Returns True on success, False on any failure (missing ffmpeg, bad
    input path, non-zero exit, timeout). Never raises.

    Uses the concat demuxer with a temp manifest file:
        ffmpeg -y -f concat -safe 0 -i manifest.txt -c copy out.mp3
    This re-muxes without re-encoding (lossless, fast, ~1ms per MB).
    """
    paths = [Path(p) for p in input_paths]
    output = Path(output_path)

    if not paths:
        logger.warning("audio_concat: no input paths provided")
        return False

    if not ffmpeg_available():
        logger.warning("audio_concat: ffmpeg not on PATH")
        return False

    missing = [p for p in paths if not p.exists()]
    if missing:
        logger.warning(f"audio_concat: missing input(s): {missing[:3]}...")
        return False

    output.parent.mkdir(parents=True, exist_ok=True)

    # Write manifest in a temp file; FFmpeg's concat demuxer reads
    # "file '<absolute_path>'" per line.
    # See: https://ffmpeg.org/ffmpeg-formats.html#concat-1
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        manifest_path = Path(f.name)
        for p in paths:
            f.write(f"file '{p.absolute()}'\n")

    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", str(manifest_path), "-c", "copy", str(output)],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        if result.returncode != 0:
            logger.warning(
                f"audio_concat: ffmpeg exit={result.returncode}, "
                f"stderr={result.stderr[-300:]}"
            )
            return False
        return output.exists() and output.stat().st_size > 0
    except subprocess.TimeoutExpired:
        logger.warning(f"audio_concat: ffmpeg timed out after {timeout_seconds}s")
        return False
    except Exception as e:
        logger.warning(f"audio_concat: ffmpeg failed: {e}")
        return False
    finally:
        manifest_path.unlink(missing_ok=True)
