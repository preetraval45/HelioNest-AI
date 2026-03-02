"""Weather endpoints — current, forecast, and monthly averages."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.logging import get_logger
from app.engines.weather_engine import EnrichedWeather, enrich_weather, score_monthly_comfort
from app.services.weather_service import ForecastDay, MonthlyAverage, get_current_weather, get_forecast, get_monthly_averages

router = APIRouter()
logger = get_logger(__name__)


# ── Response models ────────────────────────────────────────────────────────────

class CurrentWeatherOut(BaseModel):
    timestamp: datetime
    temp_c: float
    feels_like_c: float
    humidity_pct: float
    wind_speed_kmh: float
    precipitation_mm: float
    uv_index: float
    conditions: str
    weather_code: int
    heat_index_c: float
    wind_chill_c: float
    comfort_score: float
    comfort_level: str
    apparent_vs_actual_delta: float
    risk_flags: list[str]
    comfort_summary: str


class ForecastDayOut(BaseModel):
    date: date
    temp_max_c: float
    temp_min_c: float
    precipitation_mm: float
    weather_code: int
    conditions: str
    uv_index_max: float
    wind_speed_max_kmh: float
    sunrise: datetime | None
    sunset: datetime | None


class MonthlyAverageOut(BaseModel):
    month: int
    avg_temp_max_c: float
    avg_temp_min_c: float
    avg_precipitation_mm: float
    avg_uv_index: float
    comfort_score: float
    comfort_level: str
    avg_temp_c: float


class ForecastOut(BaseModel):
    days: list[ForecastDayOut]
    count: int


class MonthlyAveragesOut(BaseModel):
    months: list[MonthlyAverageOut]
    source: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_coords(lat: float, lon: float) -> None:
    if not (-90 <= lat <= 90):
        raise HTTPException(status_code=422, detail="lat must be between -90 and 90")
    if not (-180 <= lon <= 180):
        raise HTTPException(status_code=422, detail="lon must be between -180 and 180")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/current", response_model=CurrentWeatherOut)
async def current_weather(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
) -> CurrentWeatherOut:
    """Get current weather conditions with comfort analysis."""
    _validate_coords(lat, lon)
    try:
        weather = await get_current_weather(lat, lon)
        enriched = enrich_weather(weather)
    except Exception as exc:
        logger.error("Weather fetch failed for (%.3f, %.3f): %s", lat, lon, exc)
        raise HTTPException(status_code=502, detail="Weather service unavailable")

    return CurrentWeatherOut(
        timestamp=enriched.current.timestamp,
        temp_c=enriched.current.temp_c,
        feels_like_c=enriched.current.feels_like_c,
        humidity_pct=enriched.current.humidity_pct,
        wind_speed_kmh=enriched.current.wind_speed_kmh,
        precipitation_mm=enriched.current.precipitation_mm,
        uv_index=enriched.current.uv_index,
        conditions=enriched.current.conditions,
        weather_code=enriched.current.weather_code,
        heat_index_c=enriched.current.heat_index_c,
        wind_chill_c=enriched.current.wind_chill_c,
        comfort_score=enriched.current.comfort_score,
        comfort_level=enriched.current.comfort_level,
        apparent_vs_actual_delta=enriched.apparent_vs_actual_delta,
        risk_flags=enriched.risk_flags,
        comfort_summary=enriched.comfort_summary,
    )


@router.get("/forecast", response_model=ForecastOut)
async def weather_forecast(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    days: int = Query(7, ge=1, le=7, description="Number of forecast days (1-7)"),
) -> ForecastOut:
    """Get weather forecast for up to 7 days."""
    _validate_coords(lat, lon)
    try:
        forecast = await get_forecast(lat, lon, days=days)
    except Exception as exc:
        logger.error("Forecast fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="Weather service unavailable")

    return ForecastOut(
        days=[
            ForecastDayOut(
                date=f.date,
                temp_max_c=f.temp_max_c,
                temp_min_c=f.temp_min_c,
                precipitation_mm=f.precipitation_mm,
                weather_code=f.weather_code,
                conditions=f.conditions,
                uv_index_max=f.uv_index_max,
                wind_speed_max_kmh=f.wind_speed_max_kmh,
                sunrise=f.sunrise,
                sunset=f.sunset,
            )
            for f in forecast
        ],
        count=len(forecast),
    )


@router.get("/monthly-averages", response_model=MonthlyAveragesOut)
async def monthly_averages(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
) -> MonthlyAveragesOut:
    """Get 12-month climate averages with comfort scores."""
    _validate_coords(lat, lon)
    try:
        averages = await get_monthly_averages(lat, lon)
        comfort_by_month = score_monthly_comfort(averages)
        comfort_map = {c["month"]: c for c in comfort_by_month}
    except Exception as exc:
        logger.error("Monthly averages fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="Weather service unavailable")

    months_out = [
        MonthlyAverageOut(
            month=a.month,
            avg_temp_max_c=a.avg_temp_max_c,
            avg_temp_min_c=a.avg_temp_min_c,
            avg_precipitation_mm=a.avg_precipitation_mm,
            avg_uv_index=a.avg_uv_index,
            comfort_score=comfort_map[a.month]["comfort_score"],
            comfort_level=comfort_map[a.month]["comfort_level"],
            avg_temp_c=comfort_map[a.month]["avg_temp_c"],
        )
        for a in averages
    ]

    return MonthlyAveragesOut(months=months_out, source="open-meteo-historical")
