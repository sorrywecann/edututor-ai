"""Regression tests for the LLM provider/model switching path.

The 2026-04-28 E2E review reported that POST /api/v1/llm/switch reported
success but subsequent /chat calls still used the old model. The bug has
been fixed in the live code; these tests lock that fix in so a future
refactor cannot silently break runtime model selection again.

Covers three contracts:
  1. set_provider() updates _provider and is observed by generate()'s dispatch.
  2. set_ollama_model() updates _ollama_model and is observed by _generate_ollama.
  3. The "ollama:<model>" wire format used by /llm/switch correctly updates
     BOTH provider and model in the singleton.
"""
import pytest

from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_set_provider_rejects_unavailable_provider():
    svc = LLMService()
    svc._available_providers = {"openai": False, "anthropic": False, "ollama": False}
    pre = svc._provider
    assert svc.set_provider("ollama") is False
    assert svc._provider == pre, "rejected switch must leave provider unchanged"


@pytest.mark.asyncio
async def test_set_provider_rejects_unknown_provider_name():
    svc = LLMService()
    svc._available_providers = {"openai": True}
    pre = svc._provider
    assert svc.set_provider("not-a-real-provider") is False
    assert svc._provider == pre


@pytest.mark.asyncio
async def test_set_provider_persists_choice():
    svc = LLMService()
    svc._available_providers = {"openai": True, "anthropic": True, "ollama": True}
    assert svc.set_provider("anthropic") is True
    assert svc._provider == "anthropic"
    assert svc.set_provider("ollama") is True
    assert svc._provider == "ollama"


@pytest.mark.asyncio
async def test_set_ollama_model_persists():
    svc = LLMService()
    svc.set_ollama_model("qwen2.5:7b")
    assert svc._ollama_model == "qwen2.5:7b"
    assert svc.ollama_model == "qwen2.5:7b"
    svc.set_ollama_model("gemma3:12b")
    assert svc.ollama_model == "gemma3:12b"


@pytest.mark.asyncio
async def test_ollama_dispatch_reads_current_model_not_initial():
    """Regression for the 2026-04-28 bug: chat must use the switched model.

    Simulates the /chat path: caller switches the Ollama model, then triggers
    generation. The model name passed into the OpenAI-compatible chat client
    must match the most recent set_ollama_model() call, not the initial config.
    """
    svc = LLMService()
    svc.set_ollama_model("mistral:latest")

    captured = {"model": None}

    class FakeChatCompletions:
        async def create(self, **kwargs):
            captured["model"] = kwargs["model"]
            class _Choice:
                class _Msg:
                    content = "ok"
                message = _Msg()
            class _Resp:
                choices = [_Choice()]
            return _Resp()

    class FakeClient:
        def __init__(self):
            self.chat = type("C", (), {"completions": FakeChatCompletions()})()

    svc._ollama_client = FakeClient()

    svc.set_ollama_model("hermes3:8b")

    from app.services.llm_service import ChatMessage
    out = await svc._generate_ollama(
        [ChatMessage(role="user", content="hi")],
        max_tokens=10,
        temperature=0.5,
    )
    assert out == "ok"
    assert captured["model"] == "hermes3:8b", (
        "regression: _generate_ollama used stale model. The 2026-04-28 E2E "
        "report flagged this exact path: switch reported success but chat "
        "kept using mistral:latest."
    )


@pytest.mark.asyncio
async def test_switch_endpoint_handles_ollama_colon_model_format():
    """The /llm/switch endpoint accepts 'ollama:<model>' wire format and must
    set both provider and model atomically. If a future refactor decouples
    these two updates, this test catches the regression.

    After Phase 5d migration, switch_llm takes the LLM service via Depends.
    This unit test passes the service directly (bypassing the dependency
    injection) — production callers go through FastAPI which resolves the
    Depends to the singleton; tests using the HTTP client get the override
    via app.dependency_overrides[llm_service_dep] (see
    test_chat_dependency_injection.py for that pattern)."""
    from app.api.llm import switch_llm, SwitchRequest

    svc = LLMService()
    svc._available_providers = {"ollama": True}

    resp = await switch_llm(SwitchRequest(provider="ollama:qwen2.5:7b"), svc=svc)
    assert resp["success"] is True
    assert resp["provider"] == "ollama"
    assert resp["model"] == "qwen2.5:7b"
    assert svc._provider == "ollama"
    assert svc._ollama_model == "qwen2.5:7b"


@pytest.mark.asyncio
async def test_switch_endpoint_rolls_back_provider_on_validator_rejection(monkeypatch):
    """Validator-rejection rollback contract (Oracle audit 2026-05-12).

    Before the fix, /llm/switch mutated svc._provider BEFORE running the
    cloud-key validator. On validator failure the endpoint returned
    success=False but the service was already switched — subsequent /chat
    calls hit the rejected provider, producing 401s or stale-model errors
    that looked like fresh bugs.

    Fix: snapshot prev_provider, restore on validator rejection. This test
    pins both halves of the contract: response says success=False AND
    svc.provider is unchanged."""
    from app.api.llm import switch_llm, SwitchRequest
    import app.services.provider_validator as pv

    svc = LLMService()
    svc._available_providers = {"openai": True, "anthropic": True}
    svc._provider = "openai"

    async def fake_validate_anthropic_key(_key):
        return False, "Invalid API key"

    monkeypatch.setattr(pv, "validate_anthropic_key", fake_validate_anthropic_key)

    resp = await switch_llm(SwitchRequest(provider="anthropic"), svc=svc)

    assert resp["success"] is False
    assert "Provider rejected" in resp["error"]
    assert svc.provider == "openai", (
        "regression: validator rejection left svc._provider switched to "
        "the rejected provider. Snapshot-and-restore rollback must run."
    )
