"""Redis cache helpers with hit/miss logging and stampede protection."""

import asyncio
import json
from typing import Any, Callable, Coroutine

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_redis: aioredis.Redis | None = None

# Per-key locks for stampede protection
_locks: dict[str, asyncio.Lock] = {}


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    value = await r.get(key)
    if value:
        logger.debug("cache_hit key=%s", key)
        return json.loads(value)
    logger.debug("cache_miss key=%s", key)
    return None


async def cache_set(key: str, value: Any, ttl: int) -> None:
    r = await get_redis()
    await r.setex(key, ttl, json.dumps(value))


async def cache_delete(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


def make_cache_key(*parts: str, **kwargs: Any) -> str:
    """Build a deterministic cache key from positional parts and keyword args."""
    kw_segment = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items())) if kwargs else ""
    base = ":".join(str(p) for p in parts)
    return f"{base}:{kw_segment}" if kw_segment else base


async def cache_get_or_set(
    key: str,
    factory: Callable[[], Coroutine[Any, Any, Any]],
    ttl: int,
) -> Any:
    """Fetch from cache or call factory — with per-key lock to prevent stampede.

    Pattern:
        1. Check cache (fast path — no lock).
        2. On miss: acquire per-key lock.
        3. Re-check cache under lock (another coroutine may have populated it).
        4. Call factory, store result, release lock.
    """
    # Fast path
    cached = await cache_get(key)
    if cached is not None:
        return cached

    # Slow path — acquire lock
    if key not in _locks:
        _locks[key] = asyncio.Lock()
    async with _locks[key]:
        # Double-check after acquiring lock
        cached = await cache_get(key)
        if cached is not None:
            return cached

        result = await factory()
        await cache_set(key, result, ttl)
        return result
