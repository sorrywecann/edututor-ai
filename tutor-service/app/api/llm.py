"""
LLM Provider API endpoints
"""

import os
import logging
import httpx
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import llm_service_dep
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)
router = APIRouter()


class LLMModelOption(BaseModel):
    id: str
    name: str
    description: str
    provider: str
    available: bool
    # v0.7.0 (W3): tier-based curation so the chat-bar dropdown can show a
    # small recommended list by default and collapse the rest behind a
    # "Zobraziť všetky modely" link. Defaults to 'extra' so older clients
    # don't suddenly hide every model.
    priority: str = "extra"  # 'recommended' | 'extra'


class LLMModelsResponse(BaseModel):
    models: List[LLMModelOption]
    current: str


class SwitchRequest(BaseModel):
    provider: str
    model: Optional[str] = None  # optional: switch Ollama model at same time


async def fetch_ollama_models(base_url: str) -> list[str]:
    """Fetch available models from Ollama API."""
    try:
        ollama_host = base_url.replace("/v1", "").rstrip("/")
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{ollama_host}/api/tags")
            if resp.status_code == 200:
                return [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass
    return []


@router.get("/llm/models", response_model=LLMModelsResponse)
async def get_llm_models(llm: LLMService = Depends(llm_service_dep)):
    """Get available LLM models — dynamically includes all pulled Ollama models.

    LLM service is injected via Depends(llm_service_dep) so tests can override
    it without monkeypatching the singleton. LLM is eager-safe (init falls
    back to mock if all real providers fail).
    """
    openai_key = bool(os.getenv("OPENAI_API_KEY"))
    azure_ok = bool(os.getenv("AZURE_LLM_ENDPOINT") and os.getenv("AZURE_LLM_API_KEY"))
    azure_configured = bool(os.getenv("AZURE_LLM_ENDPOINT"))  # v0.7.0 (W3): hide row entirely unless at least endpoint is set
    anthropic_key = bool(os.getenv("ANTHROPIC_API_KEY"))
    # DeepSeek registered as a first-class cloud provider (v0.5.2). Same shape
    # as OpenAI — key-gated, OpenAI-compatible API under the hood.
    deepseek_key = bool(os.getenv("DEEPSEEK_API_KEY"))
    groq_key = bool(os.getenv("GROQ_API_KEY"))

    # v0.7.0 (W3): curated recommended set per audit C4. These three are the
    # "first-run friendly" small-but-capable local models. Anything else
    # installed via Ollama is still listed but priority='extra' so the
    # frontend can collapse it under a "Show all" toggle.
    RECOMMENDED_LOCAL = {"gemma3:4b", "qwen2.5:7b", "mistral:7b", "llama3.2:3b"}
    # Default to the standard local Ollama port so installed models always show
    # up in the picker even when OLLAMA_URL isn't explicitly set in .env. The
    # fetch fails safe (returns []) if Ollama isn't running, so this is harmless.
    ollama_url = os.getenv("OLLAMA_URL", "") or "http://localhost:11434"
    current_ollama_model = os.getenv("OLLAMA_MODEL", "")

    models: List[LLMModelOption] = []

    # Dynamically list all pulled Ollama models
    if ollama_url:
        ollama_models = await fetch_ollama_models(ollama_url)
        if not ollama_models:
            # Only show the configured model if one is set — avoids a bogus
            # empty "ollama:" entry when Ollama isn't reachable.
            ollama_models = [current_ollama_model] if current_ollama_model else []

        friendly = {
            "gemma3:12b": "Gemma 3 12B",
            "gemma3:27b": "Gemma 3 27B",
            "mistral:latest": "Mistral 7B",
            "llama3:latest": "Llama 3 8B",
            "llama3.2:3b": "Llama 3.2 3B",
            "qwen2.5:7b": "Qwen 2.5 7B",
            "qwen2.5vl:3b": "Qwen 2.5 VL 3B",
            "deepseek-llm:latest": "DeepSeek LLM",
            "deepseek-coder:latest": "DeepSeek Coder",
        }

        for model_name in ollama_models:
            display = friendly.get(model_name, model_name)
            is_recommended = model_name in RECOMMENDED_LOCAL
            models.append(LLMModelOption(
                id=f"ollama:{model_name}",
                name=f"{display} [Local]",
                description=f"Runs locally via Ollama — no API key, no cost",
                provider="local",
                available=True,
                priority="recommended" if is_recommended else "extra",
            ))

    # Custom OpenAI-compatible providers from env vars
    for env_key, val in os.environ.items():
        if env_key.startswith("CUSTOM_LLM_") and env_key.endswith("_URL"):
            prefix = env_key.replace("_URL", "")
            name = prefix.replace("CUSTOM_LLM_", "").replace("_", " ").title()
            model = os.environ.get(f"{prefix}_MODEL", "default")
            models.append(LLMModelOption(
                id=f"custom:{name.lower().replace(' ', '_')}",
                name=f"{name} [Custom]",
                description=f"OpenAI-compatible via {val[:40]}…",
                provider="custom",
                available=True,
            ))

    # Cloud providers — v0.7.0 (W3): cloud providers that have a key set are
    # 'recommended' (the user explicitly opted in by saving the key). Cloud
    # rows without a key are 'extra' so they stay visible but greyed in the
    # collapsed section. Azure is hidden entirely unless AZURE_LLM_ENDPOINT
    # is configured — previously it sat in the dropdown as a permanent
    # unavailable row that just added visual noise.
    models.append(LLMModelOption(
        id="openai",
        name="GPT-4o-mini [OpenAI]",
        description="Fast cloud model",
        provider="cloud",
        available=openai_key,
        priority="recommended" if openai_key else "extra",
    ))
    if azure_configured:
        models.append(LLMModelOption(
            id="azure",
            name="GPT-4o-mini [Azure]",
            description="Azure-hosted OpenAI",
            provider="cloud",
            available=azure_ok,
            priority="recommended" if azure_ok else "extra",
        ))
    models.append(LLMModelOption(
        id="anthropic",
        name="Claude 3 Haiku [Anthropic]",
        description="Fast Anthropic model",
        provider="cloud",
        available=anthropic_key,
        priority="recommended" if anthropic_key else "extra",
    ))
    models.append(LLMModelOption(
        id="custom:deepseek",
        name="DeepSeek Chat [DeepSeek]",
        description="OpenAI-compatible cloud model",
        provider="cloud",
        available=deepseek_key,
        priority="recommended" if deepseek_key else "extra",
    ))
    if groq_key:
        models.append(LLMModelOption(
            id="groq",
            name="Groq Llama 3 [Groq]",
            description="Ultra-fast LPU cloud",
            provider="cloud",
            available=True,
            priority="recommended",
        ))

    # Determine current — active Ollama model takes priority
    if llm.provider == "ollama":
        current = f"ollama:{llm.ollama_model}"
    elif llm.provider.startswith("custom:"):
        current = llm.provider
    elif llm.provider:
        current = llm.provider
    elif ollama_url:
        current = f"ollama:{current_ollama_model}"
    elif openai_key:
        current = "openai"
    else:
        current = "mock"

    return LLMModelsResponse(models=models, current=current)


@router.post("/llm/switch")
async def switch_llm(
    request: SwitchRequest,
    svc: LLMService = Depends(llm_service_dep),
):
    """Switch LLM provider at runtime. For Ollama models use id like 'ollama:gemma3:12b'.

    LLM service injected via Depends so tests can override the singleton.
    """
    try:
        provider_id = request.provider

        # Handle ollama:model_name format
        if provider_id.startswith("ollama:"):
            model_name = provider_id[len("ollama:"):]
            svc.set_ollama_model(model_name)
            ok = svc.set_provider("ollama")
            if ok:
                logger.info(f"Switched to Ollama model: {model_name}")
                return {"success": True, "provider": "ollama", "model": model_name}
            return {"success": False, "error": "Ollama not available"}

        # Handle custom:provider_name format
        if provider_id.startswith("custom:"):
            name = provider_id[len("custom:"):]
            # If not yet initialized, try to init from env vars
            if not svc._available_providers.get(provider_id, False):
                env_prefix = f"CUSTOM_LLM_{name.upper().replace(' ', '_')}"
                url = os.getenv(f"{env_prefix}_URL", "")
                key = os.getenv(f"{env_prefix}_KEY", "")
                model = os.getenv(f"{env_prefix}_MODEL", "default")
                if url:
                    await svc._init_custom(name, url, key, model)
                # v0.8.0: DeepSeek is special — saved as DEEPSEEK_API_KEY (no
                # CUSTOM_LLM_DEEPSEEK_URL), so the generic CUSTOM_LLM_ branch
                # above doesn't find it. Mirror the boot rehydration logic
                # from llm_service.py:121 so live switch works even when the
                # save→switch happens after init.
                elif name == "deepseek" and os.getenv("DEEPSEEK_API_KEY"):
                    await svc._init_custom(
                        "deepseek", "https://api.deepseek.com/v1",
                        os.getenv("DEEPSEEK_API_KEY", ""), "deepseek-chat",
                    )
            ok = svc.set_provider(provider_id)
            if ok:
                logger.info(f"Switched to custom provider: {name}")
                return {"success": True, "provider": provider_id, "model": name}
            return {"success": False, "error": f"Custom provider '{name}' not available"}

        prev_provider = svc.provider
        ok = svc.set_provider(provider_id)
        if ok and provider_id in ("openai", "anthropic", "groq"):
            from app.services.provider_validator import (
                validate_anthropic_key,
                validate_groq_key,
                validate_openai_key,
            )

            validators = {
                "openai": lambda: validate_openai_key(os.getenv("OPENAI_API_KEY", "")),
                "anthropic": lambda: validate_anthropic_key(os.getenv("ANTHROPIC_API_KEY", "")),
                "groq": lambda: validate_groq_key(os.getenv("GROQ_API_KEY", "")),
            }
            valid, msg = await validators[provider_id]()
            if not valid:
                svc.set_provider(prev_provider)
                return {"success": False, "error": f"Provider rejected: {msg}"}
        return {"success": ok, "provider": svc.provider}
    except Exception as e:
        logger.error(f"LLM switch error: {e}")
        return {"success": False, "error": str(e)}
