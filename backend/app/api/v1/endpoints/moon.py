"""Moon Intelligence endpoints — GET /api/v1/moon/"""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Query, HTTPException

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.logging import get_logger
from app.engines.moon_engine import get_daily_moon_data, get_moon_phase, get_moon_position

router = APIRouter()
logger = get_logger(__name__)

CACHE_TTL_DAILY = 3600       # 1 hour — moon data changes slowly
CACHE_TTL_POSITION = 60      # 1 minute — real-time position


def _serialize_dt(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


@router.get("/daily")
async def moon_daily(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
    date_str: str | None = Query(None, alias="date", description="ISO date YYYY-MM-DD (default: today UTC)"),
) -> dict:
    """Comprehensive moon data for a given location and date.

    Returns phase, illumination, rise/set times, sky position at noon,
    and a 0-100 night visibility score.
    """
    # Parse date
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")
    else:
        target_date = datetime.now(timezone.utc).date()

    cache_key = make_cache_key("moon:daily", lat=lat, lon=lon, date=target_date.isoformat())
    cached = await cache_get(cache_key)
    if cached:
        return cached

    data = get_daily_moon_data(lat, lon, target_date)

    result = {
        "date": data.date.isoformat(),
        "location": {"lat": lat, "lon": lon},
        "phase": {
            "phase_angle": data.phase.phase_angle,
            "illumination_pct": data.phase.illumination_pct,
            "phase_name": data.phase.phase_name,
            "emoji": data.phase.emoji,
        },
        "position_at_noon": {
            "azimuth_deg": data.position_now.azimuth_deg,
            "elevation_deg": data.position_now.elevation_deg,
            "distance_km": data.position_now.distance_km,
        },
        "rise_set": {
            "moonrise": _serialize_dt(data.rise_set.moonrise),
            "moonset": _serialize_dt(data.rise_set.moonset),
            "is_up_all_day": data.rise_set.is_up_all_day,
            "is_down_all_day": data.rise_set.is_down_all_day,
        },
        "night_visibility": {
            "score": data.night_visibility.score,
            "level": data.night_visibility.level,
            "moon_impact": data.night_visibility.moon_impact,
        },
    }

    await cache_set(cache_key, result, ttl=CACHE_TTL_DAILY)
    return result


@router.get("/position")
async def moon_position(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict:
    """Real-time moon azimuth, elevation, and Earth-Moon distance."""
    cache_key = make_cache_key("moon:position", lat=lat, lon=lon)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    pos = get_moon_position(lat, lon)
    result = {
        "timestamp": pos.timestamp.isoformat(),
        "azimuth_deg": pos.azimuth_deg,
        "elevation_deg": pos.elevation_deg,
        "distance_km": pos.distance_km,
        "is_above_horizon": pos.elevation_deg > 0,
    }

    await cache_set(cache_key, result, ttl=CACHE_TTL_POSITION)
    return result


@router.get("/phase")
async def moon_phase_now() -> dict:
    """Current moon phase and illumination percentage."""
    cache_key = make_cache_key("moon:phase")
    cached = await cache_get(cache_key)
    if cached:
        return cached

    phase = get_moon_phase()
    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "phase_angle": phase.phase_angle,
        "illumination_pct": phase.illumination_pct,
        "phase_name": phase.phase_name,
        "emoji": phase.emoji,
    }

    await cache_set(cache_key, result, ttl=CACHE_TTL_DAILY)
    return result
