import pytest
from unittest.mock import AsyncMock


@pytest.mark.asyncio
async def test_cache_set_and_get():
    from app.services.context_cache import ContextCache

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=b'[{"role": "user", "text": "hello"}]')

    cache = ContextCache(mock_redis)
    await cache.set("session-1", [{"role": "user", "text": "hello"}])
    result = await cache.get("session-1")

    mock_redis.set.assert_called_once()
    assert result == [{"role": "user", "text": "hello"}]


@pytest.mark.asyncio
async def test_cache_miss_returns_none():
    from app.services.context_cache import ContextCache

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    cache = ContextCache(mock_redis)
    result = await cache.get("nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_cache_uses_correct_key_prefix():
    from app.services.context_cache import ContextCache

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    cache = ContextCache(mock_redis)
    await cache.set("abc123", [])
    await cache.get("abc123")

    set_key = mock_redis.set.call_args[0][0]
    get_key = mock_redis.get.call_args[0][0]
    assert set_key == "conv:abc123:history"
    assert get_key == "conv:abc123:history"
