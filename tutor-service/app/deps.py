"""FastAPI dependency providers for application services.

These thin wrappers expose the existing get_*_service() singleton factories
as FastAPI Depends targets so route handlers can declare service usage in
their signature instead of reaching for module globals. This makes the
endpoints unit-testable without monkeypatching: a test can override the
dependency with app.dependency_overrides[llm_service_dep] = ...

The wrapped factories (get_llm_service, get_rag_service, get_tts_service,
get_avatar_broadcaster) remain callable directly — this module is additive,
not a migration. Endpoints can adopt Depends incrementally.
"""
from typing import TYPE_CHECKING

from app.services.avatar_broadcaster import (
    AvatarBroadcaster,
    get_avatar_broadcaster,
)
from app.services.llm_service import LLMService, get_llm_service
from app.services.rag_service import get_rag_service
from app.services.tts_service import TTSService, get_tts_service

if TYPE_CHECKING:
    from app.services.rag_service import RAGService


async def llm_service_dep() -> LLMService:
    return await get_llm_service()


async def rag_service_dep() -> "RAGService":
    return await get_rag_service()


async def tts_service_dep() -> TTSService:
    return await get_tts_service()


def avatar_broadcaster_dep() -> AvatarBroadcaster:
    return get_avatar_broadcaster()
