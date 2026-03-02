"""AI endpoints — property summary and multi-agent chat with streaming."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai.orchestrator import get_suggested_questions, orchestrate
from app.ai.summary_agent import generate_property_summary
from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.config import settings
from app.core.logging import get_logger
from app.main import limiter

router = APIRouter()
logger = get_logger(__name__)


# ── Request / Response models ──────────────────────────────────────────────────

class SolarDataInput(BaseModel):
    sunrise: str | None = None
    solar_noon: str | None = None
    sunset: str | None = None
    day_length_hours: float | None = None
    max_elevation_deg: float | None = None
    peak_sun_hours: float | None = None
    annual_ac_kwh: float | None = None


class WeatherDataInput(BaseModel):
    temp_c: float | None = None
    feels_like_c: float | None = None
    humidity_pct: float | None = None
    uv_index: float | None = None
    conditions: str | None = None
    comfort_level: str | None = None
    comfort_score: float | None = None
    risk_flags: list[str] = Field(default_factory=list)


class MonthlyWeatherInput(BaseModel):
    month: int
    avg_temp_max_c: float
    avg_temp_min_c: float
    avg_precipitation_mm: float


class AISummaryRequest(BaseModel):
    address: str = Field(..., min_length=5)
    solar: SolarDataInput | None = None
    weather: WeatherDataInput | None = None
    monthly_weather: list[MonthlyWeatherInput] = Field(default_factory=list)


class AISummaryOut(BaseModel):
    address: str
    summary: str
    cached: bool = False


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)
    property_data: dict = Field(default_factory=dict)
    conversation_history: list[ChatMessage] = Field(default_factory=list)
    stream: bool = False


class ChatResponse(BaseModel):
    answer: str
    agent_used: str
    intent: str


class SuggestedQuestionsRequest(BaseModel):
    property_data: dict = Field(default_factory=dict)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/summary", response_model=AISummaryOut)
async def ai_summary(body: AISummaryRequest) -> AISummaryOut:
    """Generate a plain-English climate summary for a property using Claude AI.

    Cached for 6 hours. Requires ANTHROPIC_API_KEY.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "ai_not_configured",
                "message": "ANTHROPIC_API_KEY not configured. Set it in your .env file.",
            },
        )

    cache_key = make_cache_key("ai_summary", body.address.lower().replace(" ", "_")[:100])
    cached = await cache_get(cache_key)
    if cached:
        return AISummaryOut(address=body.address, summary=cached["summary"], cached=True)

    data = {
        "address": body.address,
        "solar": body.solar.model_dump() if body.solar else {},
        "weather": body.weather.model_dump() if body.weather else {},
        "monthly_weather": [m.model_dump() for m in body.monthly_weather],
    }

    try:
        summary = await generate_property_summary(data)
    except Exception as exc:
        logger.error("AI summary failed for %s: %s", body.address, exc)
        raise HTTPException(
            status_code=502,
            detail={"error": "ai_error", "message": "AI generation failed. Please try again."},
        )

    await cache_set(cache_key, {"summary": summary}, settings.CACHE_TTL_AI_SUMMARY)
    return AISummaryOut(address=body.address, summary=summary, cached=False)


@router.post("/chat")
async def ai_chat(body: ChatRequest):
    """Multi-agent AI chat for property climate questions.

    Automatically routes to the best specialist agent (solar, weather, impact, prediction).
    Supports both standard JSON and SSE streaming responses.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "ai_not_configured",
                "message": "ANTHROPIC_API_KEY not configured.",
            },
        )

    history = [msg.model_dump() for msg in body.conversation_history]

    if body.stream:
        # Server-Sent Events streaming response
        async def event_stream():
            try:
                result = await orchestrate(
                    question=body.question,
                    property_data=body.property_data,
                    conversation_history=history,
                )
                # Stream word by word for smooth UX
                words = result["answer"].split(" ")
                for i, word in enumerate(words):
                    chunk = word + (" " if i < len(words) - 1 else "")
                    yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"

                # Final event with metadata
                yield f"data: {json.dumps({'done': True, 'agent_used': result['agent_used'], 'intent': result['intent']})}\n\n"
            except Exception as exc:
                logger.error("Streaming chat error: %s", exc)
                yield f"data: {json.dumps({'error': 'AI response failed', 'done': True})}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Standard JSON response
    result = await orchestrate(
        question=body.question,
        property_data=body.property_data,
        conversation_history=history,
    )
    return ChatResponse(**result)


@router.post("/suggested-questions")
async def suggested_questions(body: SuggestedQuestionsRequest) -> dict:
    """Return 4-6 dynamic suggested questions based on the property's climate data."""
    questions = await get_suggested_questions(body.property_data)
    return {"questions": questions}
