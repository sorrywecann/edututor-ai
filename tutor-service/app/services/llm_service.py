"""
EduTutor.AI - LLM Service
Language model integration with local Mistral and OpenAI fallback
"""

import os
import logging
from typing import List, Optional, Dict, Any, AsyncGenerator
from dataclasses import dataclass
import asyncio

from app.config.llm_config import LLM_CONFIG, llm_config

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    """Chat message structure"""

    role: str  # "system", "user", "assistant"
    content: str


class LLMService:
    """Service for LLM operations with multiple backend support"""

    def __init__(self):
        self._model = None
        self._tokenizer = None
        self._provider: str = "openai"
        self._openai_client = None
        self._anthropic_client = None
        self._azure_client = None
        self._ollama_client = None
        self._ollama_model: str = ""
        self._vllm_client = None
        self._vllm_model: str = "Qwen/Qwen2.5-32B-Instruct-AWQ"
        self._custom_clients: Dict[str, Any] = {}
        self._available_providers: Dict[str, bool] = {}

    async def _probe_ollama(self) -> Optional[str]:
        try:
            import httpx
        except ImportError:
            return None
        candidates = [
            "http://localhost:11434",
            "http://host.docker.internal:11434",
        ]
        for base in candidates:
            try:
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.get(f"{base}/api/tags")
                if resp.status_code == 200:
                    models = [m["name"] for m in resp.json().get("models", [])]
                    if models:
                        preferred = [
                            "gemma3:27b", "gemma3:12b",
                            "qwen2.5:14b", "qwen2.5:7b", "mistral-nemo",
                            "mistral:7b", "mistral:latest", "mistral",
                            "gemma3:4b",
                            "phi4-mini", "phi4", "phi3",
                            "llama3.2:3b", "llama3.1:8b",
                        ]
                        chosen = next((m for p in preferred for m in models if p in m), models[0])
                        self._ollama_model = chosen
                    logger.info(f"Auto-detected Ollama at {base}, model={self._ollama_model}")
                    return f"{base}/v1"
            except Exception:
                continue
        return None

    async def initialize(self) -> None:
        _raw_openai = os.getenv("OPENAI_API_KEY", "")
        _placeholder_keys = {"sk-your-key-here", "sk-your-openai-api-key", "sk-...", "sk-xxx"}
        openai_key = _raw_openai if (_raw_openai.startswith("sk-") and len(_raw_openai) > 30 and _raw_openai not in _placeholder_keys) else None
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        azure_endpoint = os.getenv("AZURE_LLM_ENDPOINT")
        azure_key = os.getenv("AZURE_LLM_API_KEY")
        use_local = os.getenv("USE_LOCAL_LLM", "false").lower() == "true"
        ollama_url = os.getenv("OLLAMA_URL", "")
        vllm_url = os.getenv("VLLM_URL", "")

        if not ollama_url:
            ollama_url = await self._probe_ollama() or ""

        self._available_providers = {
            "openai": bool(openai_key),
            "azure": bool(azure_endpoint and azure_key),
            "anthropic": bool(anthropic_key),
            "local": use_local,
            "ollama": bool(ollama_url),
            "vllm": bool(vllm_url),
        }

        if openai_key:
            await self._init_openai(openai_key)
        if azure_endpoint and azure_key:
            await self._init_azure(azure_endpoint, azure_key)
        if ollama_url:
            await self._init_ollama(ollama_url)
        if vllm_url:
            await self._init_vllm(vllm_url)
        if anthropic_key:
            await self._init_anthropic(anthropic_key)
        if use_local:
            await self._init_local_model()

        # Discover custom OpenAI-compatible providers. Empty URL disables a
        # provider without removing it from .env — same convention as the
        # main API keys above (which only register if non-empty).
        for env_key, url in os.environ.items():
            if env_key.startswith("CUSTOM_LLM_") and env_key.endswith("_URL") and url:
                prefix = env_key.replace("_URL", "")
                name = prefix.replace("CUSTOM_LLM_", "").lower()
                key = os.environ.get(f"{prefix}_KEY", "")
                model = os.environ.get(f"{prefix}_MODEL", "default")
                await self._init_custom(name, url, key, model)

        # v0.8.0: DeepSeek is registered as "custom:deepseek" to share the
        # OpenAI-compatible plumbing, but unlike other custom providers it has
        # a CANONICAL URL (api.deepseek.com/v1) — so we don't ask users to set
        # CUSTOM_LLM_DEEPSEEK_URL. The save flow in system.py only writes
        # DEEPSEEK_API_KEY (system.py:1263-1269), and previously this loop
        # missed DeepSeek entirely on every restart. Result: HW Setup pill
        # showed "Pripojené" (because /system/check looks at the key), but
        # selecting DeepSeek in the chat dropdown silently failed because
        # _custom_clients["deepseek"] was empty. Rehydrate from the key.
        deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")
        if deepseek_key and not self._available_providers.get("custom:deepseek"):
            await self._init_custom(
                "deepseek", "https://api.deepseek.com/v1",
                deepseek_key, "deepseek-chat",
            )

        custom_providers = [k for k, v in self._available_providers.items() if k.startswith("custom:") and v]

        if self._available_providers.get("openai"):
            self._provider = "openai"
        elif self._available_providers.get("anthropic"):
            self._provider = "anthropic"
        elif custom_providers:
            self._provider = custom_providers[0]
        elif self._available_providers.get("azure"):
            self._provider = "azure"
        elif self._available_providers.get("ollama"):
            self._provider = "ollama"
        elif self._available_providers.get("local"):
            self._provider = "local"
        else:
            logger.warning("No LLM configured. Install Ollama (ollama.com) and run: ollama pull gemma3:4b")
            self._provider = "mock"

    def set_provider(self, provider: str) -> bool:
        """Switch to a different provider at runtime. Returns True if successful."""
        known = ["openai", "azure", "anthropic", "local", "ollama", "vllm", "mock"]
        if provider not in known and not provider.startswith("custom:"):
            return False
        if provider != "mock" and not self._available_providers.get(provider, False):
            return False
        self._provider = provider
        logger.info(f"Switched LLM provider to: {provider}")
        return True

    def set_ollama_model(self, model_name: str) -> None:
        """Switch the active Ollama model name."""
        self._ollama_model = model_name
        logger.info(f"Ollama model set to: {model_name}")

    @property
    def ollama_model(self) -> str:
        """Get current Ollama model name."""
        return self._ollama_model

    def get_available_providers(self) -> Dict[str, bool]:
        """Get dict of available providers"""
        return self._available_providers.copy()

    async def _init_local_model(self) -> None:
        """Initialize local Mistral model with 4-bit quantization"""
        try:
            import torch
            from transformers import (
                AutoModelForCausalLM,
                AutoTokenizer,
                BitsAndBytesConfig,
            )

            logger.info(f"Loading local model: {llm_config.model_name}")

            # 4-bit quantization config
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
            )

            self._tokenizer = AutoTokenizer.from_pretrained(llm_config.model_name)
            self._model = AutoModelForCausalLM.from_pretrained(
                llm_config.model_name,
                quantization_config=bnb_config,
                device_map=llm_config.device_map,
                trust_remote_code=True,
            )

            self._provider = "local"
            logger.info("Local model loaded successfully")

        except Exception as e:
            logger.error(f"Failed to load local model: {e}")
            raise

    async def _init_ollama(self, base_url: str) -> None:
        """Initialize Ollama via OpenAI-compatible client."""
        try:
            from openai import AsyncOpenAI
            self._ollama_client = AsyncOpenAI(
                api_key="ollama",
                base_url=base_url,
            )
            env_model = os.getenv("OLLAMA_MODEL", "").strip()
            if env_model:
                self._ollama_model = env_model
            logger.info(f"Ollama client initialized (base_url={base_url}, model={self._ollama_model})")
        except ImportError:
            logger.error("openai package not installed.")
            raise

    async def _init_vllm(self, base_url: str) -> None:
        """Initialize vLLM via its OpenAI-compatible API."""
        try:
            from openai import AsyncOpenAI
            self._vllm_client = AsyncOpenAI(api_key="vllm", base_url=base_url)
            self._vllm_model = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-32B-Instruct-AWQ")
            logger.info(f"vLLM client initialized (base_url={base_url}, model={self._vllm_model})")
        except ImportError:
            logger.error("openai package not installed.")
            raise

    async def _generate_vllm(self, messages, max_tokens, temperature) -> str:
        if not self._vllm_client:
            raise RuntimeError("vLLM client not initialized")
        formatted = [{"role": m.role, "content": m.content} for m in messages]
        response = await self._vllm_client.chat.completions.create(
            model=self._vllm_model,
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""

    async def _stream_vllm(self, messages, max_tokens, temperature) -> AsyncGenerator[str, None]:
        if not self._vllm_client:
            raise RuntimeError("vLLM client not initialized")
        formatted = [{"role": m.role, "content": m.content} for m in messages]
        stream = await self._vllm_client.chat.completions.create(
            model=self._vllm_model,
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def set_vllm_model(self, model_name: str) -> None:
        self._vllm_model = model_name
        logger.info(f"vLLM model set to: {model_name}")

    @property
    def vllm_model(self) -> str:
        return self._vllm_model

    async def _init_openai(self, api_key: str) -> None:
        try:
            from openai import AsyncOpenAI

            base_url = os.getenv("OPENAI_BASE_URL")
            self._openai_client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
            self._provider = "openai"
            logger.info(f"OpenAI client initialized (base_url={base_url or 'default'})")
        except ImportError:
            logger.error("openai package not installed. Run: pip install openai")
            raise

    async def _init_anthropic(self, api_key: str) -> None:
        """Initialize Anthropic client"""
        try:
            from anthropic import AsyncAnthropic

            self._anthropic_client = AsyncAnthropic(api_key=api_key)
            self._provider = "anthropic"
            logger.info("Anthropic client initialized")
        except ImportError:
            logger.error("anthropic package not installed. Run: pip install anthropic")
            raise

    async def _init_azure(self, endpoint: str, api_key: str) -> None:
        """Initialize Azure OpenAI-compatible client"""
        try:
            from openai import AsyncOpenAI

            self._azure_client = AsyncOpenAI(
                api_key=api_key,
                base_url=endpoint,
            )
            self._provider = "azure"
            logger.info(f"Azure LLM client initialized (endpoint: {endpoint})")
        except ImportError:
            logger.error("openai package not installed. Run: pip install openai")
            raise

    async def _init_custom(self, name: str, url: str, key: str, model: str) -> None:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=key or "dummy", base_url=url)
            self._custom_clients[name] = {"client": client, "model": model}
            self._available_providers[f"custom:{name}"] = True
            logger.info(f"Custom LLM provider registered: {name} ({url})")
        except ImportError:
            logger.error("openai package not installed")

    async def _generate_ollama(self, messages, max_tokens, temperature) -> str:
        """Generate with Ollama via OpenAI-compatible API.

        If the Ollama server has restarted since the client was initialised
        (new process, new port binding), the cached httpx connection pool
        may hold stale connections. On the first connection error the
        method re-initialises the client once and retries — this covers
        the common Docker/host restart case without a full backend restart.
        """
        if not self._ollama_client:
            raise RuntimeError("Ollama client not initialized")
        model = self._ollama_model
        formatted = [{"role": m.role, "content": m.content} for m in messages]
        try:
            response = await self._ollama_client.chat.completions.create(
                model=model,
                messages=formatted,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except Exception as exc:  # noqa: BLE001 — one retry on connection errors
            logger.warning("Ollama request failed (%s) — reinitialising client and retrying", exc)
            ollama_url = os.getenv("OLLAMA_URL", "") or await self._probe_ollama() or ""
            if not ollama_url:
                raise RuntimeError("Ollama not reachable after retry") from exc
            await self._init_ollama(ollama_url)
            formatted = [{"role": m.role, "content": m.content} for m in messages]
            response = await self._ollama_client.chat.completions.create(
                model=model,
                messages=formatted,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        return response.choices[0].message.content or ""

    async def _generate_custom(self, provider_id: str, messages, max_tokens, temperature) -> str:
        name = provider_id.replace("custom:", "")
        info = self._custom_clients.get(name)
        if not info:
            raise RuntimeError(f"Custom provider '{name}' not initialized")
        formatted = [{"role": m.role, "content": m.content} for m in messages]
        response = await info["client"].chat.completions.create(
            model=info["model"],
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""

    async def _stream_custom(self, provider_id: str, messages, max_tokens, temperature) -> AsyncGenerator[str, None]:
        name = provider_id.replace("custom:", "")
        info = self._custom_clients.get(name)
        if not info:
            return
        formatted = [{"role": m.role, "content": m.content} for m in messages]
        stream = await info["client"].chat.completions.create(
            model=info["model"],
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_ollama(self, messages, max_tokens, temperature) -> AsyncGenerator[str, None]:
        """Stream with Ollama via OpenAI-compatible API"""
        if not self._ollama_client:
            raise RuntimeError("Ollama client not initialized")
        model = self._ollama_model
        formatted = [{"role": m.role, "content": m.content} for m in messages]
        stream = await self._ollama_client.chat.completions.create(
            model=model,
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def generate(
        self,
        messages: List[ChatMessage],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        top_k: Optional[int] = None,
        stream: bool = False,
    ) -> str:
        """Dispatch generation to the active provider's handler.

        Adding a new provider means appending one entry to the dispatch
        table below, not editing this control flow.
        """
        max_tokens = max_tokens or llm_config.max_new_tokens
        temperature = temperature if temperature is not None else llm_config.temperature
        top_k = top_k if top_k is not None else llm_config.top_k

        provider = self._provider
        if provider.startswith("custom:"):
            return await self._generate_custom(provider, messages, max_tokens, temperature)

        dispatch = {
            "openai":    lambda: self._generate_openai(messages, max_tokens, temperature, stream),
            "azure":     lambda: self._generate_azure(messages, max_tokens, temperature, stream),
            "anthropic": lambda: self._generate_anthropic(messages, max_tokens, temperature, stream),
            "ollama":    lambda: self._generate_ollama(messages, max_tokens, temperature),
            "vllm":      lambda: self._generate_vllm(messages, max_tokens, temperature),
            "local":     lambda: self._generate_local(messages, max_tokens, temperature, top_k),
        }
        handler = dispatch.get(provider)
        if handler is None:
            return await self._generate_mock(messages)
        return await handler()

    async def generate_stream(
        self,
        messages: List[ChatMessage],
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream generation from the active provider.

        Streaming is async-iterator-shaped, so each provider exposes its
        own _stream_X. Non-streaming providers fall back to single-chunk
        emission of the full generate() result. Custom providers go
        through their dynamic registry.
        """
        max_tokens = max_tokens or llm_config.max_new_tokens
        temperature = temperature or llm_config.temperature

        provider = self._provider
        if provider.startswith("custom:"):
            async for chunk in self._stream_custom(provider, messages, max_tokens, temperature):
                yield chunk
            return

        streamers = {
            "openai":    lambda: self._stream_openai(messages, max_tokens, temperature),
            "azure":     lambda: self._stream_azure(messages, max_tokens, temperature),
            "anthropic": lambda: self._stream_anthropic(messages, max_tokens, temperature),
            "ollama":    lambda: self._stream_ollama(messages, max_tokens, temperature),
            "vllm":      lambda: self._stream_vllm(messages, max_tokens, temperature),
        }
        streamer = streamers.get(provider)
        if streamer is None:
            yield await self.generate(messages, max_tokens, temperature)
            return
        async for chunk in streamer():
            yield chunk

    async def _generate_openai(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        temperature: float,
        stream: bool,
    ) -> str:
        """Generate with OpenAI"""
        if not self._openai_client:
            raise RuntimeError("OpenAI client not initialized")

        formatted = [{"role": m.role, "content": m.content} for m in messages]

        response = await self._openai_client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        return response.choices[0].message.content or ""

    async def _stream_openai(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        temperature: float,
    ) -> AsyncGenerator[str, None]:
        """Stream with OpenAI"""
        if not self._openai_client:
            raise RuntimeError("OpenAI client not initialized")

        formatted = [{"role": m.role, "content": m.content} for m in messages]

        stream = await self._openai_client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _generate_azure(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        temperature: float,
        stream: bool,
    ) -> str:
        if not self._azure_client:
            raise RuntimeError("Azure client not initialized")

        formatted = [{"role": m.role, "content": m.content} for m in messages]

        response = await self._azure_client.chat.completions.create(
            model=os.getenv("AZURE_LLM_MODEL", "gpt-4o-mini"),
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        return response.choices[0].message.content or ""

    async def _stream_azure(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        temperature: float,
    ) -> AsyncGenerator[str, None]:
        if not self._azure_client:
            raise RuntimeError("Azure client not initialized")

        formatted = [{"role": m.role, "content": m.content} for m in messages]

        stream = await self._azure_client.chat.completions.create(
            model=os.getenv("AZURE_LLM_MODEL", "gpt-4o-mini"),
            messages=formatted,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _generate_anthropic(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        temperature: float,
        stream: bool,
    ) -> str:
        """Generate with Anthropic"""
        if not self._anthropic_client:
            raise RuntimeError("Anthropic client not initialized")

        # Extract system message
        system = ""
        chat_messages = []
        for m in messages:
            if m.role == "system":
                system = m.content
            else:
                chat_messages.append({"role": m.role, "content": m.content})

        response = await self._anthropic_client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
            max_tokens=max_tokens,
            system=system or llm_config.system_prompt,
            messages=chat_messages,
        )

        return response.content[0].text

    async def _stream_anthropic(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        temperature: float,
    ) -> AsyncGenerator[str, None]:
        """Stream with Anthropic"""
        if not self._anthropic_client:
            raise RuntimeError("Anthropic client not initialized")

        system = ""
        chat_messages = []
        for m in messages:
            if m.role == "system":
                system = m.content
            else:
                chat_messages.append({"role": m.role, "content": m.content})

        async with self._anthropic_client.messages.stream(
            model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
            max_tokens=max_tokens,
            system=system or llm_config.system_prompt,
            messages=chat_messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def _generate_local(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        temperature: float,
        top_k: int,
    ) -> str:
        if not self._model or not self._tokenizer:
            raise RuntimeError("Local model not loaded")

        import torch

        prompt = self._format_mistral_prompt(messages)

        inputs = self._tokenizer(prompt, return_tensors="pt").to(self._model.device)

        with torch.no_grad():
            outputs = self._model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_k=top_k,
                top_p=llm_config.top_p,
                repetition_penalty=llm_config.repetition_penalty,
                do_sample=llm_config.do_sample,
                pad_token_id=self._tokenizer.eos_token_id,
            )

        response = self._tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Extract only the assistant response
        if "[/INST]" in response:
            response = response.split("[/INST]")[-1].strip()

        return response

    def _format_mistral_prompt(self, messages: List[ChatMessage]) -> str:
        """Format messages for Mistral Instruct"""
        prompt = ""
        system_msg = ""

        for msg in messages:
            if msg.role == "system":
                system_msg = msg.content
            elif msg.role == "user":
                if system_msg:
                    prompt += f"<s>[INST] {system_msg}\n\n{msg.content} [/INST]"
                    system_msg = ""
                else:
                    prompt += f"<s>[INST] {msg.content} [/INST]"
            elif msg.role == "assistant":
                prompt += f" {msg.content}</s>"

        return prompt

    async def _generate_mock(self, messages: List[ChatMessage]) -> str:
        """Generate mock response for development"""
        await asyncio.sleep(0.5)  # Simulate latency

        user_msg = next((m.content for m in reversed(messages) if m.role == "user"), "")

        return f"""Ahoj! Som EduTutor, tvoj vzdelávací asistent.

Dostal som tvoju otázku: "{user_msg[:100]}..."

Systém beží bez LLM — pre plnú funkčnosť nainštaluj Ollama (bezplatné, lokálne, bez API kľúča):

  1. Stiahni: https://ollama.com/download
  2. Spusti: ollama pull gemma3:4b
  3. Reštartuj aplikáciu

Alebo nastav cloudový kľúč: OPENAI_API_KEY / ANTHROPIC_API_KEY v súbore .env"""

    _OLLAMA_SYSTEM_PROMPT = (
        "Si EduTutor, priateľský slovenský vzdelávací asistent. Tykaj študentom.\n\n"
        "JAZYK: Vždy odpovedaj po slovensky, správnou gramatikou s diakritikou. "
        "Píš VÝHRADNE v spisovnej slovenčine. NIKDY nepoužívaj české znaky (ě, ř, ů) "
        "ani české slová. Náhrady: není→nie je, můžu→môžem, děkuji→ďakujem, pouze→iba, "
        "jsem/jsi→som/si, nyní→teraz, říkat→hovoriť, také→tiež/aj.\n\n"
        "ŠTÝL: Krátko a jasne — maximálne 2-3 vety. Hovor plynulo, bez markdown, "
        "bez emoji, bez odrážok. Text je určený na hlasné čítanie.\n\n"
        "ÚLOHA: Pomáhaj so vzdelávacími témami. Ak sa pýtajú mimo vzdelávania, "
        "láskavo presmeruj na učenie.\n\n"
        "PRÍSTUP: Po odpovedi sa opýtaj 'Dáva ti to zmysel?' alebo ponúkni ďalší krok."
    )

    def get_system_prompt(self) -> str:
        if self._provider == "ollama":
            return self._OLLAMA_SYSTEM_PROMPT
        return llm_config.system_prompt

    @property
    def provider(self) -> str:
        """Get current provider"""
        return self._provider


# Singleton instance
_llm_service: Optional[LLMService] = None
_llm_service_init_lock = asyncio.Lock()


async def get_llm_service() -> LLMService:
    """Get or create LLM service instance (concurrency-safe via double-checked locking)."""
    global _llm_service
    if _llm_service is not None:
        return _llm_service
    async with _llm_service_init_lock:
        if _llm_service is None:
            svc = LLMService()
            await svc.initialize()
            _llm_service = svc
    return _llm_service
