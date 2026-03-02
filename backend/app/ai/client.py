"""Anthropic Claude client with retry/backoff."""

from __future__ import annotations

import asyncio
from typing import Any

import anthropic

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_client: anthropic.AsyncAnthropic | None = None

DEFAULT_MODEL = "claude-sonnet-4-6"
MAX_RETRIES = 3
RETRY_DELAYS = [1.0, 2.0, 4.0]  # seconds


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def call_claude(
    system: str,
    user: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
    temperature: float = 0.3,
) -> str:
    """Call Claude with retry/backoff. Returns the text response."""
    client = get_client()

    for attempt, delay in enumerate(RETRY_DELAYS, 1):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            text = response.content[0].text if response.content else ""
            logger.debug("Claude call OK (attempt %d, tokens=%d)", attempt, response.usage.output_tokens)
            return text
        except anthropic.RateLimitError:
            if attempt == MAX_RETRIES:
                raise
            logger.warning("Rate limited by Claude — retrying in %.1fs", delay)
            await asyncio.sleep(delay)
        except anthropic.APIError as exc:
            if attempt == MAX_RETRIES:
                raise
            logger.warning("Claude API error (attempt %d): %s — retrying", attempt, exc)
            await asyncio.sleep(delay)

    raise RuntimeError("Claude call failed after all retries")
