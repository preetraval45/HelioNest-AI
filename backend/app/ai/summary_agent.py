"""Summary agent — generates plain-English climate summaries for a property."""

from __future__ import annotations

import json
import os
from pathlib import Path

from app.ai.client import call_claude
from app.core.logging import get_logger

logger = get_logger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent.parent / "ai" / "prompts" / "summary_prompt.txt"
_SYSTEM_PROMPT: str | None = None


def _load_system_prompt() -> str:
    global _SYSTEM_PROMPT
    if _SYSTEM_PROMPT is None:
        if _PROMPT_PATH.exists():
            _SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")
        else:
            _SYSTEM_PROMPT = (
                "You are HelioNest AI, an expert in property climate intelligence. "
                "Analyze the provided data and give a clear, practical summary in plain English. "
                "Under 350 words. Be specific and actionable."
            )
    return _SYSTEM_PROMPT


def _build_user_prompt(data: dict) -> str:
    """Format the property data into a structured prompt for Claude."""
    address = data.get("address", "Unknown address")
    solar = data.get("solar", {})
    weather = data.get("weather", {})
    monthly = data.get("monthly_weather", [])

    lines = [
        f"Property Address: {address}",
        "",
        "## Current Weather",
        f"- Temperature: {weather.get('temp_c', 'N/A')}°C (feels like {weather.get('feels_like_c', 'N/A')}°C)",
        f"- Humidity: {weather.get('humidity_pct', 'N/A')}%",
        f"- UV Index: {weather.get('uv_index', 'N/A')}",
        f"- Conditions: {weather.get('conditions', 'N/A')}",
        f"- Comfort: {weather.get('comfort_level', 'N/A')} ({weather.get('comfort_score', 'N/A')}/100)",
        f"- Risk Alerts: {', '.join(weather.get('risk_flags', [])) or 'None'}",
        "",
        "## Solar Data",
        f"- Today's Sunrise: {solar.get('sunrise', 'N/A')}",
        f"- Solar Noon: {solar.get('solar_noon', 'N/A')}",
        f"- Sunset: {solar.get('sunset', 'N/A')}",
        f"- Day Length: {solar.get('day_length_hours', 'N/A')} hours",
        f"- Max Sun Elevation: {solar.get('max_elevation_deg', 'N/A')}°",
        f"- Peak Sun Hours: {solar.get('peak_sun_hours', 'N/A')} hrs/day",
        f"- Annual Solar Potential (1kW system): {solar.get('annual_ac_kwh', 'N/A')} kWh/yr",
    ]

    if monthly:
        hottest = max(monthly, key=lambda m: m.get("avg_temp_max_c", 0))
        coolest = min(monthly, key=lambda m: m.get("avg_temp_min_c", 100))
        wettest = max(monthly, key=lambda m: m.get("avg_precipitation_mm", 0))
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        lines += [
            "",
            "## Climate Averages",
            f"- Hottest month: {month_names[hottest['month'] - 1]} (avg high {hottest['avg_temp_max_c']}°C)",
            f"- Coolest month: {month_names[coolest['month'] - 1]} (avg low {coolest['avg_temp_min_c']}°C)",
            f"- Wettest month: {month_names[wettest['month'] - 1]} ({wettest['avg_precipitation_mm']} mm total)",
        ]

    lines += ["", "Please provide a property climate summary based on this data."]
    return "\n".join(lines)


async def generate_property_summary(data: dict) -> str:
    """Generate a plain-English climate summary for a property.

    Args:
        data: Dict with keys: address, solar (dict), weather (dict), monthly_weather (list)

    Returns:
        Plain-English summary string from Claude.
    """
    if not data.get("address"):
        raise ValueError("address is required in data")

    system = _load_system_prompt()
    user = _build_user_prompt(data)

    logger.info("Generating AI summary for: %s", data.get("address"))
    summary = await call_claude(system=system, user=user, max_tokens=600, temperature=0.4)
    return summary.strip()
