"""Property snapshot endpoint — fetches solar + weather + moon in parallel via asyncio.gather."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Query

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.logging import get_logger
from app.engines.moon_engine import get_daily_moon_data
from app.engines.solar_engine import get_sunrise_sunset
from app.engines.weather_engine import enrich_weather
from app.services.nrel_service import get_irradiance
from app.services.weather_service import get_current_weather

router = APIRouter()
logger = get_logger(__name__)

CACHE_TTL = 300  # 5 minutes


async def _fetch_solar(lat: float, lon: float) -> dict[str, Any]:
    """Return condensed daily solar data."""
    try:
        today = date.today()
        ss = get_sunrise_sunset(lat, lon, today)
        irr = await get_irradiance(lat, lon)
        month_irr = next(
            (m for m in irr.monthly if m.month == today.month), None
        )
        return {
            "sunrise": ss.sunrise.isoformat(),
            "solar_noon": ss.solar_noon.isoformat(),
            "sunset": ss.sunset.isoformat(),
            "day_length_hours": round(ss.day_length_hours, 2),
            "max_elevation_deg": round(ss.max_elevation_deg, 1),
            "peak_sun_hours": round(month_irr.peak_sun_hours, 2) if month_irr else None,
            "annual_ac_kwh": round(irr.annual_ac_kwh, 0) if irr.annual_ac_kwh else None,
        }
    except Exception as exc:
        logger.warning("Snapshot solar fetch failed: %s", exc)
        return {}


async def _fetch_weather(lat: float, lon: float) -> dict[str, Any]:
    """Return current weather with comfort analysis."""
    try:
        weather = await get_current_weather(lat, lon)
        enriched = enrich_weather(weather)
        c = enriched.current
        return {
            "temp_c": c.temp_c,
            "feels_like_c": c.feels_like_c,
            "humidity_pct": c.humidity_pct,
            "wind_speed_kmh": c.wind_speed_kmh,
            "uv_index": c.uv_index,
            "conditions": c.conditions,
            "comfort_score": c.comfort_score,
            "comfort_level": c.comfort_level,
            "risk_flags": enriched.risk_flags,
        }
    except Exception as exc:
        logger.warning("Snapshot weather fetch failed: %s", exc)
        return {}


def _fetch_moon(lat: float, lon: float) -> dict[str, Any]:
    """Return condensed moon data (sync, CPU-only)."""
    try:
        today = datetime.now(timezone.utc).date()
        data = get_daily_moon_data(lat, lon, today)
        return {
            "phase_name": data.phase.phase_name,
            "illumination_pct": data.phase.illumination_pct,
            "emoji": data.phase.emoji,
            "moonrise": data.rise_set.moonrise.isoformat() if data.rise_set.moonrise else None,
            "moonset": data.rise_set.moonset.isoformat() if data.rise_set.moonset else None,
            "night_visibility_score": data.night_visibility.score,
            "night_visibility_level": data.night_visibility.level,
        }
    except Exception as exc:
        logger.warning("Snapshot moon fetch failed: %s", exc)
        return {}


@router.get("/snapshot")
async def property_snapshot(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
) -> dict[str, Any]:
    """Return solar + weather + moon data for a property in a single parallel fetch.

    All three data sources are fetched concurrently via asyncio.gather,
    cutting wall-clock latency roughly 3×.  Cached 5 minutes.
    """
    cache_key = make_cache_key("snapshot", lat=lat, lon=lon)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    solar_task = _fetch_solar(lat, lon)
    weather_task = _fetch_weather(lat, lon)
    # Moon is synchronous — run in thread pool to avoid blocking the event loop
    moon_task = asyncio.get_event_loop().run_in_executor(None, _fetch_moon, lat, lon)

    solar, weather, moon = await asyncio.gather(
        solar_task, weather_task, moon_task, return_exceptions=False
    )

    result: dict[str, Any] = {
        "lat": lat,
        "lon": lon,
        "solar": solar,
        "weather": weather,
        "moon": moon,
    }

    await cache_set(cache_key, result, CACHE_TTL)
    return result
