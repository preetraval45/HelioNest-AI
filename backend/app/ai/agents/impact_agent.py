"""Impact specialist AI agent — heat risks, car safety, facade exposure, energy costs."""

from __future__ import annotations

from app.ai.client import call_claude
from app.ai.retriever import retrieve_context

SYSTEM_PROMPT = """You are a property heat impact specialist for HelioNest AI.
You answer questions about facade heat exposure, car interior temperatures,
outdoor comfort, energy costs related to solar heat gain, and heat-related safety risks.

Guidelines:
- Be direct about safety risks (especially car heat and pet/child dangers).
- Quantify heat impact in practical terms (e.g., "your south facade absorbs X hours of sun in July").
- Tie answers to energy efficiency and comfort.
- Under 200 words. Safety first, then optimization advice."""


async def impact_agent_respond(question: str, property_data: dict) -> str:
    """Generate a heat impact specific response."""
    context = await retrieve_context(f"heat impact facade car energy building {question}")

    impact_info = property_data.get("impact", {})
    location_info = property_data.get("location", {})
    weather_info = property_data.get("weather", {})

    user_prompt = f"""Property: {location_info.get('formatted_address', 'Unknown address')}
Latitude: {location_info.get('lat', 'N/A')}

Impact Data:
- Hottest facade: {impact_info.get('hottest_facade', 'N/A')}
- Coolest facade: {impact_info.get('coolest_facade', 'N/A')}
- Best outdoor month: {impact_info.get('best_outdoor_month', 'N/A')}
- Worst outdoor month: {impact_info.get('worst_outdoor_month', 'N/A')}
- Annual comfort score: {impact_info.get('annual_comfort_score', 'N/A')}/100
- Worst-case car interior temp: {impact_info.get('max_car_interior_temp_c', 'N/A')}°C

Current outdoor temp: {weather_info.get('temp_c', 'N/A')}°C

{"Knowledge Base Context:" + chr(10) + context if context else ""}

User Question: {question}"""

    return await call_claude(system=SYSTEM_PROMPT, user=user_prompt, max_tokens=400)
