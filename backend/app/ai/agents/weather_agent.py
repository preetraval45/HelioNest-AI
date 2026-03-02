"""Weather specialist AI agent — climate, comfort, storms, and seasonal patterns."""

from __future__ import annotations

from app.ai.client import call_claude
from app.ai.retriever import retrieve_context

SYSTEM_PROMPT = """You are a climate and weather intelligence specialist for HelioNest AI.
You answer questions about current conditions, weather patterns, comfort scores, heat index,
wind chill, precipitation, seasonal climate, and how weather affects outdoor living.

Guidelines:
- Connect weather data to practical homeowner decisions (outdoor events, garden planning, HVAC use).
- Use the comfort score and risk flags to frame your answer.
- Be concise but insightful. Under 200 words.
- Personalize based on the property's specific climate data."""


async def weather_agent_respond(question: str, property_data: dict) -> str:
    """Generate a weather-specific response."""
    context = await retrieve_context(f"weather climate comfort temperature humidity {question}")

    weather_info = property_data.get("weather", {})
    location_info = property_data.get("location", {})

    user_prompt = f"""Property: {location_info.get('formatted_address', 'Unknown address')}

Current Weather:
- Temperature: {weather_info.get('temp_c', 'N/A')}°C (feels like {weather_info.get('feels_like_c', 'N/A')}°C)
- Humidity: {weather_info.get('humidity_pct', 'N/A')}%
- Wind: {weather_info.get('wind_speed_kmh', 'N/A')} km/h
- Conditions: {weather_info.get('conditions', 'N/A')}
- UV Index: {weather_info.get('uv_index', 'N/A')}
- Comfort Score: {weather_info.get('comfort_score', 'N/A')}/100 ({weather_info.get('comfort_level', 'N/A')})
- Active Alerts: {', '.join(weather_info.get('risk_flags', [])) or 'None'}

{"Knowledge Base Context:" + chr(10) + context if context else ""}

User Question: {question}"""

    return await call_claude(system=SYSTEM_PROMPT, user=user_prompt, max_tokens=400)
