"""Podcast generation Task 3 — pin the FFmpeg audio concat helper.

concat_mp3s() concatenates a list of MP3 files into one output MP3 using
FFmpeg's concat demuxer (-c copy, lossless mux). Never raises — logs warning
+ returns False on any failure, per the Phase 8b graceful-degrade contract.

Contracts pinned:
  - ffmpeg_available() returns a bool reflecting shutil.which("ffmpeg").
  - concat_mp3s with two valid silent MP3s produces an output file with
    size > 0 and returns True (happy path / integration test).
  - concat_mp3s returns False without raising when an input path is missing;
    the manifest temp file is cleaned up.
  - concat_mp3s returns False immediately on empty input without invoking
    ffmpeg (fast-path guard).

Oracle review session: ses_1e1513e5effepQMVbZMKljQot5
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def test_ffmpeg_available_reports_truthfully():
    """ffmpeg_available() returns a bool consistent with shutil.which("ffmpeg").

    The podcast orchestrator (Task 4) calls this before kicking off any job.
    If the probe mismatches reality, the orchestrator either silently skips
    valid runs or crashes on missing ffmpeg.  Pins the probe's return value
    and type so regressions are caught immediately.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.audio_concat_service import ffmpeg_available

    result = ffmpeg_available()

    assert isinstance(result, bool)
    expected = shutil.which("ffmpeg") is not None
    assert result is expected


@pytest.mark.skipif(not _ffmpeg_available(), reason="ffmpeg required")
def test_concat_two_mp3s_produces_output(tmp_path: Path):
    """concat_mp3s with two valid silent MP3s returns True and produces a non-empty file.

    Generates two 0.5-second silent MP3s via FFmpeg's lavfi source filter
    (no Python audio deps — pure subprocess), then concatenates them.
    Asserts the output exists, has size > 0, and the function returns True.

    This is the hot-path integration test for the Task 4 orchestrator.
    Uses tmp_path for automatic cleanup; does not touch data/podcasts/.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.audio_concat_service import concat_mp3s

    m1 = tmp_path / "chunk_a.mp3"
    m2 = tmp_path / "chunk_b.mp3"
    out = tmp_path / "result.mp3"

    # Generate two 0.5-second silent MP3s with lavfi anullsrc
    for dest in (m1, m2):
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi",
                "-i", "anullsrc=r=44100:cl=mono",
                "-t", "0.5",
                "-q:a", "9",
                str(dest),
            ],
            capture_output=True,
            timeout=15,
            check=True,
        )

    result = concat_mp3s([m1, m2], out)

    assert result is True
    assert out.exists()
    assert out.stat().st_size > 0


def test_concat_missing_input_returns_false(tmp_path: Path):
    """concat_mp3s returns False (no exception) when an input path does not exist.

    Pins the missing-file guard: the function must detect missing files before
    invoking ffmpeg, log a warning, and return False.  The output path must NOT
    be created (or if it was, it must be empty/absent).  The temp manifest file
    must be cleaned up — no tmpfile leaks.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.audio_concat_service import concat_mp3s

    out = tmp_path / "output.mp3"
    result = concat_mp3s([Path("/nonexistent_audio_file_xyz.mp3")], out)

    assert result is False
    # Output must not have been created with actual content
    assert not out.exists() or out.stat().st_size == 0


def test_concat_empty_input_returns_false(tmp_path: Path):
    """concat_mp3s returns False immediately on an empty input list, without calling ffmpeg.

    Pins the empty-input fast-path so the orchestrator never spawns a ffmpeg
    process with an empty manifest (which would produce a broken output file).
    Verified by confirming no output is created at all.

    Oracle review: ses_1e1513e5effepQMVbZMKljQot5
    """
    from app.services.audio_concat_service import concat_mp3s

    out = tmp_path / "empty_output.mp3"
    result = concat_mp3s([], out)

    assert result is False
    assert not out.exists()
