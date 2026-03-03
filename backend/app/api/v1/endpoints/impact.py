"""Property Heat Impact endpoints — GET /api/v1/impact/"""

from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.logging import get_logger
from app.engines.impact_engine import (
    estimate_car_interior_temp,
    get_annual_impact_summary,
    get_facade_heat_scores,
    get_monthly_outdoor_comfort,
)

router = APIRouter()
logger = get_logger(__name__)

CACHE_TTL_FACADE = 86400      # 24h — changes only with lat/lon
CACHE_TTL_CAR = 300           # 5 min — depends on current weather
CACHE_TTL_ANNUAL = 86400      # 24h


@router.get("/facade-heat")
async def facade_heat(
    lat: float = Query(..., ge=-90, le=90),
) -> dict:
    """Monthly heat gain scores for all four facade directions (N/S/E/W).

    Returns 48 data points (12 months × 4 directions) with 0-100 scores
    and estimated daily peak sun hours.
    """
    cache_key = make_cache_key("impact:facade", lat=lat)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    scores = get_facade_heat_scores(lat)

    # Group by direction for easier frontend consumption
    by_direction: dict[str, list] = {}
    for s in scores:
        by_direction.setdefault(s.direction, []).append({
            "month": s.month,
            "heat_gain_score": s.heat_gain_score,
            "daily_peak_hours": s.daily_peak_hours,
            "risk_level": s.risk_level,
        })

    result = {
        "lat": lat,
        "facades": by_direction,
        "note": "Heat gain scores are 0-100. Higher = more solar heat load on that facade.",
    }

    await cache_set(cache_key, result, ttl=CACHE_TTL_FACADE)
    return result


@router.get("/car-heat")
async def car_heat(
    outdoor_temp_c: float = Query(..., ge=-30, le=60, description="Current outdoor temperature in Celsius"),
    irradiance_w_m2: float = Query(800.0, ge=0, le=1400, description="Solar irradiance (W/m²)"),
    hours_parked: float = Query(1.0, ge=0.1, le=12, description="Hours vehicle will be parked"),
) -> dict:
    """Estimate car interior temperature after being parked in the sun.

    Uses an empirical thermal model based on NHTSA/research data.
    Returns risk level: Safe / Warm / Hot / Dangerous / Deadly.
    """
    result_obj = estimate_car_interior_temp(outdoor_temp_c, irradiance_w_m2, hours_parked)

    return {
        "outdoor_temp_c": result_obj.outdoor_temp_c,
        "irradiance_w_m2": result_obj.irradiance_w_m2,
        "hours_parked": result_obj.hours_parked,
        "interior_temp_c": result_obj.interior_temp_c,
        "interior_temp_f": round(result_obj.interior_temp_c * 9 / 5 + 32, 1),
        "risk_level": result_obj.risk_level,
        "risk_color": result_obj.risk_color,
        "warning_message": result_obj.warning_message,
    }


@router.get("/comfort")
async def monthly_comfort(
    monthly_data: str = Query(
        ...,
        description=(
            "JSON array of monthly weather objects: "
            "[{month, avg_temp_c, avg_humidity, avg_uv_index}, ...]"
        ),
    ),
) -> dict:
    """Return monthly outdoor comfort scores (0-100) from historical weather averages.

    Pass monthly_data as a JSON-encoded array string.
    Each object: {month: 1-12, avg_temp_c, avg_humidity (optional), avg_uv_index (optional)}.
    """
    import json
    try:
        parsed = json.loads(monthly_data)
        if not isinstance(parsed, list) or len(parsed) == 0:
            raise ValueError("Expected a non-empty array")
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid monthly_data JSON: {e}")

    months_out = get_monthly_outdoor_comfort(parsed)

    return {
        "months": [
            {
                "month": m.month,
                "month_name": m.month_name,
                "comfort_score": m.comfort_score,
                "comfort_level": m.comfort_level,
                "avg_temp_c": m.avg_temp_c,
                "dominant_risk": m.dominant_risk,
            }
            for m in months_out
        ]
    }


@router.get("/annual-summary")
async def annual_summary(
    lat: float = Query(..., ge=-90, le=90),
    monthly_data: str = Query(
        ...,
        description="JSON array: [{month, avg_temp_c, avg_humidity, avg_uv_index}, ...]",
    ),
) -> dict:
    """Annual impact summary — best/worst months, hottest facade, car risk, and comfort score."""
    import json
    try:
        parsed = json.loads(monthly_data)
        if not isinstance(parsed, list) or len(parsed) == 0:
            raise ValueError("Expected a non-empty array")
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid monthly_data JSON: {e}")

    cache_key = make_cache_key("impact:annual", lat=lat)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    monthly_comfort = get_monthly_outdoor_comfort(parsed)
    summary = get_annual_impact_summary(lat, monthly_comfort, parsed)

    result = {
        "lat": lat,
        "best_outdoor_month": summary.best_outdoor_month,
        "worst_outdoor_month": summary.worst_outdoor_month,
        "hottest_facade": summary.hottest_facade,
        "coolest_facade": summary.coolest_facade,
        "max_car_interior_temp_c": summary.max_car_interior_temp_c,
        "max_car_interior_temp_f": round(summary.max_car_interior_temp_c * 9 / 5 + 32, 1),
        "annual_comfort_score": summary.annual_comfort_score,
        "key_insight": summary.key_insight,
    }

    await cache_set(cache_key, result, ttl=CACHE_TTL_ANNUAL)
    return result


# ── Mold & Air Quality ──────────────────────────────────────────────────────────

from pydantic import BaseModel
from app.engines.mold_engine import MoldRisk, calculate_mold_risk
from app.services.openaq_service import AirQualityResult, PollutantReading, get_air_quality
from app.services.weather_service import get_current_weather


class MoldRiskOut(BaseModel):
    mold_index: float
    risk_level: str
    risk_color: str
    contributing_factors: list[str]
    recommendations: list[str]


class PollutantOut(BaseModel):
    parameter: str
    value: float
    unit: str
    last_updated: str | None = None


class AirQualityOut(BaseModel):
    station_name: str | None = None
    distance_km: float | None = None
    aqi: int | None = None
    aqi_category: str | None = None
    aqi_color: str | None = None
    pollutants: list[PollutantOut]
    source: str


@router.get("/mold-risk")
async def mold_risk(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
) -> MoldRiskOut:
    """Compute mold growth risk index from current weather conditions."""
    try:
        weather = await get_current_weather(lat, lon)
        risk = calculate_mold_risk(
            temp_c=weather.temp_c,
            humidity_pct=weather.humidity_pct,
            dew_point_c=getattr(weather, "dew_point_c", None),
        )
    except Exception as exc:
        logger.error("Mold risk calculation error: %s", exc)
        raise HTTPException(status_code=502, detail="Weather data unavailable for mold risk") from exc

    return MoldRiskOut(
        mold_index=risk.mold_index,
        risk_level=risk.risk_level,
        risk_color=risk.risk_color,
        contributing_factors=risk.contributing_factors,
        recommendations=risk.recommendations,
    )


@router.get("/air-quality")
async def air_quality(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
) -> AirQualityOut:
    """Fetch nearest OpenAQ air quality data — PM2.5 AQI and pollutant breakdown."""
    try:
        result = await get_air_quality(lat, lon)
    except Exception as exc:
        logger.error("Air quality fetch error: %s", exc)
        raise HTTPException(status_code=502, detail="Air quality data unavailable") from exc

    return AirQualityOut(
        station_name=result.station_name,
        distance_km=result.distance_km,
        aqi=result.aqi,
        aqi_category=result.aqi_category,
        aqi_color=result.aqi_color,
        pollutants=[
            PollutantOut(
                parameter=p.parameter,
                value=p.value,
                unit=p.unit,
                last_updated=p.last_updated,
            )
            for p in result.pollutants
        ],
        source=result.source,
    )
