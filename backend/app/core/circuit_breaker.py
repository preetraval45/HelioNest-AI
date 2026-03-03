"""Redis-backed daily API call counter and circuit breaker.

Usage:
    from app.core.circuit_breaker import ApiCircuitBreaker
    cb = ApiCircuitBreaker("anthropic")
    if await cb.is_open():
        raise HTTPException(503, "Service temporarily unavailable (circuit open)")
    try:
        result = await call_external_api()
        await cb.record_success()
    except Exception:
        await cb.record_failure()
        raise
"""

from app.core.cache import cache_get, cache_set

_DAY_SECONDS = 86_400
_FAIL_RESET   = 300  # reset failure streak after 5 min of silence


class ApiCircuitBreaker:
    """Tracks per-service daily call count and consecutive failures.

    Opens the circuit (blocking calls) when 3+ consecutive failures occur.
    Automatically resets the failure streak after FAIL_RESET seconds.
    Daily call count resets at midnight UTC (key expires in 24h).
    """

    def __init__(self, service: str, daily_limit: int = 1000) -> None:
        self._svc          = service
        self._daily_limit  = daily_limit
        self._count_key    = f"cb:count:{service}"
        self._fail_key     = f"cb:fails:{service}"

    async def is_open(self) -> bool:
        """Return True if the circuit is open (calls should be blocked)."""
        # Check daily limit
        count = await cache_get(self._count_key)
        if count and int(count) >= self._daily_limit:
            return True
        # Check consecutive failures
        fails = await cache_get(self._fail_key)
        return fails is not None and int(fails) >= 3

    async def record_success(self) -> None:
        """Increment daily counter; reset failure streak."""
        count = await cache_get(self._count_key)
        new_count = (int(count) + 1) if count else 1
        await cache_set(self._count_key, new_count, _DAY_SECONDS)
        await cache_set(self._fail_key, 0, _FAIL_RESET)

    async def record_failure(self) -> None:
        """Increment consecutive failure counter."""
        fails = await cache_get(self._fail_key)
        new_fails = (int(fails) + 1) if fails else 1
        await cache_set(self._fail_key, new_fails, _FAIL_RESET)

    async def daily_count(self) -> int:
        """Return today's call count for this service."""
        count = await cache_get(self._count_key)
        return int(count) if count else 0
