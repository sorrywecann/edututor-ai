"""v0.8.0 security — shared dev-mode gate for development-only endpoints.

The eval / preview / diagnostics endpoints expose internals (full system
prompts, RAG chunk traces, side-by-side prompt comparisons) that are
expensive to run AND useful for prompt-injection reconnaissance. They were
designed for offline QA, not for end users. Without a gate, any peer on the
LAN (we bind on 0.0.0.0 for UE5 compatibility — see docs/SECURITY.md) could
hit them and drain the configured OpenAI/Anthropic credits.

Gating pattern mirrors avatar_dev._is_dev_mode + avatar_debug._is_dev_mode
which have shipped since v0.7.0 (W2 / W6). Default OFF: end-user installs
return 404 from every gated route. Developers opt in via EDU_DEV_MODE=1.

NOTE — this gate is INTENTIONALLY NOT applied to:
  - chat / chat_stream     → core user-facing endpoint
  - knowledge_bases / kb   → core user-facing
  - system / hardware      → needed for HW Setup
  - tts / stt / llm        → needed for chat flow
  - lipsync.py             → avatar surface, locked by separate user mandate.
                              Security improvement of the lipsync routes is
                              deferred to a separate audit pass; they are NOT
                              part of this gate.
"""
import os

from fastapi import HTTPException, status


def _is_dev_mode() -> bool:
    """Default OFF. Opt-in via EDU_DEV_MODE=1 / true / yes / on."""
    raw = os.getenv("EDU_DEV_MODE", "0").strip().lower()
    return raw not in ("0", "false", "no", "off", "")


def require_dev_mode() -> None:
    """FastAPI dependency — raises 404 unless EDU_DEV_MODE is on.

    Use as ``dependencies=[Depends(require_dev_mode)]`` on the router include
    so EVERY route in the router is gated. 404 (not 401/403) is deliberate:
    leaks zero information about whether the endpoint exists.
    """
    if not _is_dev_mode():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not available.",
        )
