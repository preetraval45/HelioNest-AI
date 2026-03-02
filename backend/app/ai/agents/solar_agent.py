"""Solar specialist AI agent — answers questions about sun, UV, and solar energy."""

from __future__ import annotations

from app.ai.client import call_claude
from app.ai.retriever import retrieve_context

SYSTEM_PROMPT = """You are a solar intelligence specialist for HelioNest AI.
You answer questions about sun position, sunrise/sunset, UV index, solar irradiance,
sun path arcs, peak solar hours, and solar energy potential for specific U.S. properties.

Guidelines:
- Be precise and data-driven. Reference specific numbers the user provides.
- Explain implications practically (e.g., "your south-facing windows receive X hours of direct sun").
- Keep answers under 200 words unless a detailed explanation is needed.
- Use the property data provided to personalize every response.
- If you retrieved knowledge base context, incorporate it naturally."""


async def solar_agent_respond(question: str, property_data: dict) -> str:
    """Generate a solar-specific response for the given question and property context."""
    context = await retrieve_context(f"solar sun UV irradiance {question}")

    solar_info = property_data.get("solar", {})
    location_info = property_data.get("location", {})

    user_prompt = f"""Property: {location_info.get('formatted_address', 'Unknown address')}
Latitude: {location_info.get('lat', 'N/A')} | Longitude: {location_info.get('lon', 'N/A')}

Solar Data:
- Current sun position: {solar_info.get('azimuth', 'N/A')}° azimuth, {solar_info.get('elevation', 'N/A')}° elevation
- Today's sunrise: {solar_info.get('sunrise', 'N/A')} | Sunset: {solar_info.get('sunset', 'N/A')}
- Annual solar irradiance: {solar_info.get('annual_kwh_m2', 'N/A')} kWh/m²
- Peak solar month: {solar_info.get('peak_month', 'N/A')}

{"Knowledge Base Context:" + chr(10) + context if context else ""}

User Question: {question}"""

    return await call_claude(system=SYSTEM_PROMPT, user=user_prompt, max_tokens=400)
