"""Climate risk AI agent — 10-year trends, future risk narrative, drought/flood forecasting."""

from __future__ import annotations

from app.ai.client import call_claude
from app.ai.retriever import retrieve_context

SYSTEM_PROMPT = """You are a climate risk analyst for HelioNest AI.
You interpret 10-year historical climate trends and explain what they mean for homeowners.

Guidelines:
- Lead with the most significant trend (warming, drying, wetter, stormier).
- Quantify trends clearly: "X°C warmer per decade" or "Y% more precipitation".
- Explain practical implications: HVAC cost, flood risk, drought risk, wildfire risk.
- Recommend 1-2 specific property adaptations.
- Stay factual — avoid speculation beyond the data.
- Under 250 words. Professional but accessible tone."""


async def climate_agent_respond(question: str, property_data: dict) -> str:
    """Generate a climate-risk-focused response using historical trend data."""
    context = await retrieve_context(f"climate risk trends temperature warming drought flood {question}")

    climate_info = property_data.get("climate", {})
    location_info = property_data.get("location", {})
    yearly = climate_info.get("yearly", [])

    # Format last 3 years of data for context
    recent_years = yearly[-3:] if yearly else []
    years_text = "\n".join(
        f"  {y['year']}: avg {y['avg_temp_c']}°C, precip {y['total_precip_mm']} mm"
        for y in recent_years
    )

    user_prompt = f"""Property: {location_info.get('formatted_address', 'Unknown')}

10-Year Climate Trends:
- Temperature trend: {climate_info.get('temp_trend_per_decade', 'N/A')}°C per decade
- Precipitation trend: {climate_info.get('precip_trend_pct_per_decade', 'N/A')}% per decade
- Wind trend: {climate_info.get('wind_trend_per_decade', 'N/A')} km/h per decade
- Hottest year on record: {climate_info.get('hottest_year', 'N/A')}
- Wettest year: {climate_info.get('wettest_year', 'N/A')}
- Driest year: {climate_info.get('driest_year', 'N/A')}

Recent Years:
{years_text or '  No data'}

{"Knowledge Base Context:" + chr(10) + context if context else ""}

User Question: {question}"""

    return await call_claude(system=SYSTEM_PROMPT, user=user_prompt, max_tokens=500)
