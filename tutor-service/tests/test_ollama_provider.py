import pytest
import os
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_ollama_provider_initializes():
    """Ollama selected when no higher-priority provider is configured.

    Priority order in LLMService.initialize() is openai → anthropic →
    custom:* → azure → ollama → local. The dev .env may set
    CUSTOM_LLM_OPENROUTER_* / CUSTOM_LLM_DEEPSEEK_* etc., which would
    outrank Ollama in production resolution. The test isolates Ollama
    by clearing every higher-priority knob (cloud keys + every
    CUSTOM_LLM_*_URL the env happens to expose) before init.
    """
    base = {
        "OLLAMA_URL": "http://localhost:11434/v1",
        "USE_LOCAL_LLM": "false",
        "OPENAI_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "AZURE_LLM_ENDPOINT": "",
    }
    custom_url_keys = [k for k in os.environ if k.startswith("CUSTOM_LLM_") and k.endswith("_URL")]
    overrides = {**base, **{k: "" for k in custom_url_keys}}
    with patch.dict(os.environ, overrides, clear=False):
        from app.services.llm_service import LLMService
        svc = LLMService()
        await svc.initialize()
        assert "ollama" in svc.get_available_providers()
        assert svc.provider == "ollama", f"Ollama should be selected when no higher-priority provider is configured, got: {svc.provider}"


@pytest.mark.asyncio
async def test_ollama_generate_returns_string():
    """Ollama generate() should return non-empty string."""
    from app.services.llm_service import LLMService, ChatMessage

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Ahoj! Som EduTutor."

    with patch.dict(os.environ, {"OLLAMA_URL": "http://localhost:11434/v1", "OLLAMA_MODEL": "mistral:latest"}):
        svc = LLMService()
        svc._ollama_client = AsyncMock()
        svc._ollama_client.chat.completions.create = AsyncMock(return_value=mock_response)
        svc._provider = "ollama"
        svc._available_providers = {"ollama": True}

        msgs = [ChatMessage(role="user", content="Ahoj")]
        result = await svc.generate(msgs)
        assert isinstance(result, str)
        assert len(result) > 0


@pytest.mark.asyncio
async def test_ollama_stream_yields_chunks():
    """Ollama generate_stream() should yield string chunks."""
    from app.services.llm_service import LLMService, ChatMessage

    async def mock_stream():
        for word in ["Ahoj", " ", "svet"]:
            chunk = MagicMock()
            chunk.choices = [MagicMock()]
            chunk.choices[0].delta.content = word
            yield chunk

    with patch.dict(os.environ, {"OLLAMA_URL": "http://localhost:11434/v1", "OLLAMA_MODEL": "mistral:latest"}):
        svc = LLMService()
        svc._ollama_client = AsyncMock()
        svc._ollama_client.chat.completions.create = AsyncMock(return_value=mock_stream())
        svc._provider = "ollama"
        svc._available_providers = {"ollama": True}

        msgs = [ChatMessage(role="user", content="Ahoj")]
        chunks = []
        async for chunk in svc.generate_stream(msgs):
            chunks.append(chunk)
        assert len(chunks) == 3
        assert "".join(chunks) == "Ahoj svet"
