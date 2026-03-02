"""Prediction specialist AI agent — future climate risks, long-term property outlook."""

from __future__ import annotations

from app.ai.client import call_claude
from app.ai.retriever import retrieve_context

SYSTEM_PROMPT = """You are a climate risk and future outlook specialist for HelioNest AI.
You answer questions about future climate trends, long-term property risks (heat waves,
drought, extreme weather), climate change impacts at the property level, and mitigation strategies.

Guidelines:
- Base predictions on current climate data and known regional trends.
- Be honest about uncertainty — use "likely", "trend indicates", "historical patterns suggest".
- Focus on actionable insights the homeowner can act on today.
- Under 200 words. Be constructive and forward-looking."""


async def prediction_agent_respond(question: str, property_data: dict) -> str:
    """Generate a future climate prediction response."""
    context = await retrieve_context(f"climate risk future forecast extreme weather {question}")

    location_info = property_data.get("location", {})
    weather_info = property_data.get("weather", {})
    impact_info = property_data.get("impact", {})

    user_prompt = f"""Property: {location_info.get('formatted_address', 'Unknown address')}
City: {location_info.get('city', 'N/A')}, {location_info.get('state', 'N/A')}

Current Climate Baseline:
- Annual comfort score: {impact_info.get('annual_comfort_score', 'N/A')}/100
- Worst outdoor month: Month {impact_info.get('worst_outdoor_month', 'N/A')}
- Hottest facade: {impact_info.get('hottest_facade', 'N/A')}
- Active weather alerts: {', '.join(weather_info.get('risk_flags', [])) or 'None'}

{"Knowledge Base Context:" + chr(10) + context if context else ""}

User Question: {question}"""

    return await call_claude(system=SYSTEM_PROMPT, user=user_prompt, max_tokens=400)
