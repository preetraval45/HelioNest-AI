"""Ollama LLM client with retry/backoff (OpenAI-compatible API)."""

from __future__ import annotations

import asyncio
from typing import Any

import openai

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_client: openai.AsyncOpenAI | None = None

MAX_RETRIES = 3
RETRY_DELAYS = [1.0, 2.0, 4.0]  # seconds


def get_client() -> openai.AsyncOpenAI:
    global _client
    if _client is None:
        _client = openai.AsyncOpenAI(
            base_url=f"{settings.OLLAMA_BASE_URL}/v1",
            api_key="ollama",  # Ollama ignores this but the SDK requires it
        )
    return _client


async def call_llm(
    system: str,
    user: str,
    model: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.3,
) -> str:
    """Call Ollama LLM with retry/backoff. Returns the text response."""
    client = get_client()
    resolved_model = model or settings.OLLAMA_MODEL

    for attempt, delay in enumerate(RETRY_DELAYS, 1):
        try:
            response = await client.chat.completions.create(
                model=resolved_model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            text = response.choices[0].message.content or ""
            logger.debug(
                "LLM call OK (attempt %d, model=%s, tokens=%s)",
                attempt,
                resolved_model,
                response.usage.completion_tokens if response.usage else "?",
            )
            return text
        except openai.RateLimitError:
            if attempt == MAX_RETRIES:
                raise
            logger.warning("Rate limited by Ollama — retrying in %.1fs", delay)
            await asyncio.sleep(delay)
        except openai.APIError as exc:
            if attempt == MAX_RETRIES:
                raise
            logger.warning("Ollama API error (attempt %d): %s — retrying", attempt, exc)
            await asyncio.sleep(delay)

    raise RuntimeError("LLM call failed after all retries")


# Backward-compatible alias so existing agents don't need changes
call_claude = call_llm
