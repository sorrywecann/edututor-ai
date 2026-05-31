import httpx


async def validate_openai_key(key: str, timeout: float = 5.0) -> tuple[bool, str]:
    """Test OpenAI key with a minimal models endpoint call."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
        if resp.status_code == 200:
            return True, "API key valid"
        if resp.status_code == 401:
            return False, "Invalid API key"
        return False, f"OpenAI returned {resp.status_code}"
    except httpx.TimeoutException:
        return False, "OpenAI timeout — try again"
    except Exception as exc:
        return False, f"Connection error: {exc}"


async def validate_anthropic_key(key: str, timeout: float = 5.0) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
            )
        if resp.status_code == 200:
            return True, "API key valid"
        if resp.status_code == 401:
            return False, "Invalid API key"
        return False, f"Anthropic returned {resp.status_code}"
    except httpx.TimeoutException:
        return False, "Anthropic timeout — try again"
    except Exception as exc:
        return False, f"Connection error: {exc}"


async def validate_groq_key(key: str, timeout: float = 5.0) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
        if resp.status_code == 200:
            return True, "API key valid"
        if resp.status_code == 401:
            return False, "Invalid API key"
        return False, f"Groq returned {resp.status_code}"
    except httpx.TimeoutException:
        return False, "Groq timeout — try again"
    except Exception as exc:
        return False, f"Connection error: {exc}"


async def validate_deepseek_key(key: str, timeout: float = 5.0) -> tuple[bool, str]:
    """v0.7.0 (W3): live DeepSeek validation. Per audit C4 the previous
    DeepSeek 'validation' was just an `sk-` prefix check — a typo'd key
    showed green in the UI and crashed on the first /chat/stream call.
    This single GET against /v1/models is the same shape as OpenAI's
    validator (DeepSeek is OpenAI-compatible)."""
    if not key or not isinstance(key, str):
        return False, "Empty key"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                "https://api.deepseek.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
        if resp.status_code == 200:
            return True, "API key valid"
        if resp.status_code == 401:
            return False, "Invalid API key"
        return False, f"DeepSeek returned {resp.status_code}"
    except httpx.TimeoutException:
        return False, "DeepSeek timeout — try again"
    except Exception as exc:
        return False, f"Connection error: {exc}"


async def validate_ollama(url: str, timeout: float = 2.0) -> tuple[bool, str]:
    try:
        host = url.replace("/v1", "").rstrip("/")
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(f"{host}/api/tags")
        if resp.status_code == 200:
            models = [m["name"] for m in resp.json().get("models", [])]
            return True, f"{len(models)} models available"
        return False, "Ollama not responding"
    except Exception:
        return False, "Ollama not running"


def _is_private_url(url: str) -> bool:
    from urllib.parse import urlparse
    import ipaddress
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "[::]", "[::1]"):
        return True
    try:
        return ipaddress.ip_address(hostname).is_private
    except ValueError:
        return False


async def validate_custom_provider(
    url: str,
    key: str,
    model: str,
    timeout: float = 5.0,
) -> tuple[bool, str]:
    if _is_private_url(url):
        return False, "Private/internal URLs are not allowed"
    try:
        headers = {}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(f"{url}/models", headers=headers)
        if resp.status_code == 200:
            return True, "Provider available"
        if resp.status_code == 401:
            return False, "Invalid API key for custom provider"
        return False, f"Provider returned {resp.status_code}"
    except httpx.TimeoutException:
        return False, "Provider timeout"
    except Exception as exc:
        return False, f"Cannot reach provider: {exc}"
