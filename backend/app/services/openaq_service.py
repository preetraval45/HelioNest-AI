"""Air quality data service using OpenAQ v3 API.

Fetches real-time PM2.5, PM10, O3, NO2, CO measurements from the nearest
monitoring station within a 25km radius. Computes US AQI from PM2.5.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_BASE_URL = "https://api.openaq.org/v3"


@dataclass
class PollutantReading:
    parameter: str   # pm25, pm10, o3, no2, co
    value: float
    unit: str
    last_updated: str | None = None


@dataclass
class AirQualityResult:
    station_name: str | None = None
    distance_km: float | None = None
    aqi: int | None = None             # US AQI (0–500+)
    aqi_category: str | None = None   # Good / Moderate / Unhealthy / etc.
    aqi_color: str | None = None      # CSS color class
    pollutants: list[PollutantReading] = field(default_factory=list)
    source: str = "openaq"


# ── US AQI from PM2.5 (EPA breakpoints) ──────────────────────────────────────

_PM25_BREAKPOINTS = [
    (0.0,   12.0,  0,   50),
    (12.1,  35.4,  51,  100),
    (35.5,  55.4,  101, 150),
    (55.5,  150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500),
]


def _pm25_to_aqi(pm25: float) -> tuple[int, str, str]:
    """Convert PM2.5 (µg/m³) to US AQI value, category, color class."""
    for c_lo, c_hi, i_lo, i_hi in _PM25_BREAKPOINTS:
        if c_lo <= pm25 <= c_hi:
            aqi = round(((i_hi - i_lo) / (c_hi - c_lo)) * (pm25 - c_lo) + i_lo)
            if aqi <= 50:
                return aqi, "Good", "text-emerald-500"
            if aqi <= 100:
                return aqi, "Moderate", "text-yellow-500"
            if aqi <= 150:
                return aqi, "Unhealthy for Sensitive Groups", "text-orange-400"
            if aqi <= 200:
                return aqi, "Unhealthy", "text-red-500"
            if aqi <= 300:
                return aqi, "Very Unhealthy", "text-purple-500"
            return aqi, "Hazardous", "text-rose-700"
    return 500, "Hazardous", "text-rose-700"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def get_air_quality(lat: float, lon: float) -> AirQualityResult:
    """Fetch nearest OpenAQ station measurements within 25km.

    Returns AirQualityResult with AQI and pollutant breakdowns.
    Falls back to an empty result if no station found or API is unavailable.
    """
    cache_key = make_cache_key("air_quality", lat=lat, lon=lon)
    cached = await cache_get(cache_key)
    if cached:
        result = AirQualityResult(**{k: v for k, v in cached.items() if k != "pollutants"})
        result.pollutants = [PollutantReading(**p) for p in cached.get("pollutants", [])]
        return result

    headers: dict[str, str] = {}
    api_key = getattr(settings, "OPENAQ_API_KEY", None)
    if api_key:
        headers["X-API-Key"] = api_key

    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            # Find nearest locations
            resp = await client.get(
                f"{_BASE_URL}/locations",
                params={
                    "coordinates": f"{lat},{lon}",
                    "radius": 25000,
                    "limit": 5,
                    "order_by": "distance",
                },
            )
            resp.raise_for_status()
            locs_data: dict[str, Any] = resp.json()
            locations = locs_data.get("results", [])

            if not locations:
                logger.info("No OpenAQ stations within 25km of %s,%s", lat, lon)
                return AirQualityResult(source="openaq-no-station")

            nearest = locations[0]
            station_id = nearest.get("id")
            station_name = nearest.get("name", "Unknown station")
            slat = nearest.get("coordinates", {}).get("latitude", lat)
            slon = nearest.get("coordinates", {}).get("longitude", lon)
            dist_km = _haversine_km(lat, lon, slat, slon)

            # Fetch latest measurements
            meas_resp = await client.get(
                f"{_BASE_URL}/locations/{station_id}/latest",
            )
            meas_resp.raise_for_status()
            meas_data: dict[str, Any] = meas_resp.json()
            measurements = meas_data.get("results", [])

    except httpx.TimeoutException:
        logger.warning("OpenAQ API timeout")
        return AirQualityResult(source="openaq-timeout")
    except Exception as exc:
        logger.warning("OpenAQ API error: %s", exc)
        return AirQualityResult(source="openaq-error")

    pollutants: list[PollutantReading] = []
    pm25_val: float | None = None

    for m in measurements:
        param = m.get("parameter", "")
        value = m.get("value")
        unit = m.get("unit", "µg/m³")
        last_updated = m.get("lastUpdated")
        if value is None:
            continue
        pollutants.append(PollutantReading(
            parameter=param,
            value=round(float(value), 2),
            unit=unit,
            last_updated=last_updated,
        ))
        if param == "pm25":
            pm25_val = float(value)

    aqi, cat, color = _pm25_to_aqi(pm25_val) if pm25_val is not None else (None, None, None)

    result = AirQualityResult(
        station_name=station_name,
        distance_km=round(dist_km, 1),
        aqi=aqi,
        aqi_category=cat,
        aqi_color=color,
        pollutants=pollutants,
        source="openaq",
    )

    # Cache 1 hour
    await cache_set(cache_key, {
        "station_name": result.station_name,
        "distance_km": result.distance_km,
        "aqi": result.aqi,
        "aqi_category": result.aqi_category,
        "aqi_color": result.aqi_color,
        "pollutants": [{"parameter": p.parameter, "value": p.value, "unit": p.unit, "last_updated": p.last_updated} for p in result.pollutants],
        "source": result.source,
    }, ttl=3600)

    return result
