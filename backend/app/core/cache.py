import json
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    value = await r.get(key)
    if value:
        return json.loads(value)
    return None


async def cache_set(key: str, value: Any, ttl: int) -> None:
    r = await get_redis()
    await r.setex(key, ttl, json.dumps(value))


async def cache_delete(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


def make_cache_key(*parts: str) -> str:
    return ":".join(str(p) for p in parts)
