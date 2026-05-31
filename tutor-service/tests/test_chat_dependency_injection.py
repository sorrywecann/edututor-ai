"""Phase 5d — prove that the chat endpoint's Depends-based DI works.

Before 5d, testing the chat endpoint required monkeypatching the module-level
``get_llm_service`` factory (or the singleton it managed) — fragile because
test isolation depended on resetting the global afterwards. After 5d, tests
swap fakes via ``app.dependency_overrides[llm_service_dep] = ...`` which
FastAPI cleans up automatically per request.

This test pins the new injection point so a future change to the factory
chain (lib/config, .env loading, lazy init) cannot silently break the
testability contract.
"""
import pytest
from httpx import AsyncClient, ASGITransport

from app.deps import llm_service_dep
from app.services.llm_service import LLMService, ChatMessage


class _FakeLLMForChatTest(LLMService):
    """Minimal stand-in: deterministic Slovak greeting, no real provider needed.

    set_provider is delegated to the parent so the fake persists the value
    rather than just claiming success — tests that read fake._provider after
    a switch_llm call rely on this.
    """

    def __init__(self) -> None:
        super().__init__()
        self._provider = "mock"
        self._available_providers = {"mock": True}
        self._fake_response = "Ahoj, ja som testovací tutor."

    async def generate(self, messages, max_tokens=None, temperature=None, top_k=None, stream=False) -> str:
        return self._fake_response


@pytest.mark.asyncio
async def test_chat_endpoint_uses_injected_llm_service():
    from app.main import app

    fake = _FakeLLMForChatTest()

    async def fake_dep() -> LLMService:
        return fake

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/chat",
                json={"message": "Test injekciu", "language": "sk", "mode_id": "sk"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["response"] == "Ahoj, ja som testovací tutor.", (
            "chat endpoint did not call the injected LLM — Depends override "
            "is not wired correctly. Did llm_service_dep get bypassed?"
        )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)


@pytest.mark.asyncio
async def test_dependency_override_cleans_up_between_tests():
    """The override-and-pop pattern in test_chat_endpoint_uses_injected_llm_service
    must leave the app in a clean state. This test depends on a fresh handler
    state — if the previous test leaked the override, this one would still see
    the fake response."""
    from app.main import app

    assert llm_service_dep not in app.dependency_overrides, (
        "previous test leaked a dependency override; check finally cleanup"
    )


@pytest.mark.asyncio
async def test_chat_stream_endpoint_signature_takes_llm_via_depends():
    """The streaming chat endpoint must accept the LLM service via Depends so
    the same dependency-override pattern works for SSE-streamed chats. This
    test pins the parameter contract — a future 'tidy up unused param' edit
    that drops llm: LLMService = Depends(...) breaks streaming-chat tests
    that rely on dependency_overrides."""
    import inspect
    from fastapi import Depends
    from app.api.chat import chat_stream

    sig = inspect.signature(chat_stream)
    assert "llm" in sig.parameters, "chat_stream must accept llm via Depends"
    llm_param = sig.parameters["llm"]
    assert isinstance(llm_param.default, type(Depends(lambda: None))), (
        "llm parameter must use Depends() so app.dependency_overrides applies"
    )


@pytest.mark.asyncio
async def test_llm_models_endpoint_uses_injected_service():
    """Phase 5d Batch 1: /api/v1/llm/models must read from the injected LLM
    service, so app.dependency_overrides[llm_service_dep] swaps the source
    of truth. Pins the new injection point for the LLM routes."""
    from app.main import app

    fake = _FakeLLMForChatTest()
    fake._provider = "anthropic"

    async def fake_dep() -> LLMService:
        return fake

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/llm/models")
        assert resp.status_code == 200
        data = resp.json()
        assert data["current"] == "anthropic", (
            "models endpoint did not read provider from injected LLM service — "
            "dependency_overrides is not wired into /api/v1/llm/models"
        )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)


@pytest.mark.asyncio
async def test_chat_emits_single_speaking_broadcast_no_idle_race():
    """Pin the no-double-broadcast rule for the non-streaming /chat path.

    Before this fix, /chat broadcasted isSpeaking=True followed IMMEDIATELY
    (sub-millisecond apart) by isSpeaking=False. UE5 client received both
    in rapid succession with no time to animate the speaking transition,
    sometimes snapping straight to idle. The audit (oracle session
    ses_1fa9d93c1ffe7OBt02tRy5D3N4) flagged this as a snap-to-idle race
    affecting 100% of non-streaming turns.

    The fix: send only the speaking-state broadcast. UE5 self-times the
    idle transition using total_duration_ms in the payload (already there
    pre-fix). Heartbeat task will resume blinks once is_speaking flag
    flips back to False (which the chat handler still does via
    broadcaster.set_speaking, just without the second broadcast).
    """
    from app.main import app
    from app.services.avatar_broadcaster import AvatarBroadcaster
    from app.deps import avatar_broadcaster_dep
    import app.services.avatar_broadcaster as _ab_mod

    captured_payloads: list = []

    class _CaptureWS:
        async def send_text(self, data: str) -> None:
            import json as _json
            captured_payloads.append(_json.loads(data))

    fake_broadcaster = AvatarBroadcaster()
    fake_broadcaster.connect(_CaptureWS())

    fake_llm = _FakeLLMForChatTest()

    async def llm_dep() -> LLMService:
        return fake_llm

    def br_dep() -> AvatarBroadcaster:
        return fake_broadcaster

    original_factory = _ab_mod._broadcaster
    _ab_mod._broadcaster = fake_broadcaster

    app.dependency_overrides[llm_service_dep] = llm_dep
    app.dependency_overrides[avatar_broadcaster_dep] = br_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/chat",
                json={"message": "Test", "language": "sk", "mode_id": "sk"},
            )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)
        app.dependency_overrides.pop(avatar_broadcaster_dep, None)
        _ab_mod._broadcaster = original_factory

    speaking_payloads = [p for p in captured_payloads if p.get("isSpeaking") is True]
    idle_payloads_following_speech = [p for p in captured_payloads if p.get("isSpeaking") is False]

    assert len(speaking_payloads) == 1, (
        f"chat must emit EXACTLY ONE isSpeaking=True broadcast, got {len(speaking_payloads)}"
    )
    assert len(idle_payloads_following_speech) == 0, (
        f"chat must NOT emit a follow-up isSpeaking=False broadcast — UE5 self-times "
        f"idle transition from total_duration_ms. Got {len(idle_payloads_following_speech)} idle payloads."
    )
    assert speaking_payloads[0].get("total_duration_ms", 0) > 0, (
        "speaking broadcast must include total_duration_ms so UE5 knows when to idle"
    )


@pytest.mark.asyncio
async def test_avatar_status_endpoint_uses_injected_broadcaster():
    """Phase 5d Batch 2: /api/v1/avatar/status reads from the injected
    AvatarBroadcaster, so app.dependency_overrides[avatar_broadcaster_dep]
    can substitute a fake with arbitrary connection counts."""
    from app.deps import avatar_broadcaster_dep
    from app.services.avatar_broadcaster import AvatarBroadcaster
    from app.main import app

    fake = AvatarBroadcaster()

    class _FakeWS:
        async def send_text(self, _data: str) -> None:
            return None

    fake.connect(_FakeWS())
    fake.connect(_FakeWS())
    fake.connect(_FakeWS())

    def fake_dep() -> AvatarBroadcaster:
        return fake

    app.dependency_overrides[avatar_broadcaster_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/avatar/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["clients"] == 3, (
            "avatar/status did not read from injected broadcaster — "
            "dependency_overrides is not wired into /api/v1/avatar/status"
        )
        assert data["connected"] is True
    finally:
        app.dependency_overrides.pop(avatar_broadcaster_dep, None)


@pytest.mark.asyncio
async def test_llm_switch_endpoint_uses_injected_service():
    """Phase 5d Batch 1: /api/v1/llm/switch must mutate the injected LLM
    service. After override, set_provider/set_ollama_model on the fake
    must reflect the wire-format request the same way they would on the
    production singleton."""
    from app.main import app

    fake = _FakeLLMForChatTest()
    fake._available_providers = {"ollama": True}

    async def fake_dep() -> LLMService:
        return fake

    app.dependency_overrides[llm_service_dep] = fake_dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/llm/switch", json={"provider": "ollama:gemma3:12b"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["provider"] == "ollama"
        assert data["model"] == "gemma3:12b"
        assert fake._provider == "ollama"
        assert fake._ollama_model == "gemma3:12b", (
            "switch endpoint did not mutate the injected service — "
            "dependency_overrides is not wired into /api/v1/llm/switch"
        )
    finally:
        app.dependency_overrides.pop(llm_service_dep, None)
