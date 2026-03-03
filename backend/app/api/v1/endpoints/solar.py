"""Solar endpoints — sun position, daily path, monthly data, seasonal summary, shadow sweep, ROI."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.logging import get_logger
from app.engines.roi_engine import ROIResult, calculate_solar_roi
from app.engines.shadow_engine import (
    HourlyShadow,
    compute_shadow_vector,
    get_daily_shadow_sweep,
)
from app.engines.solar_engine import (
    SeasonalSolarSummary,
    SunPosition,
    SunriseSet,
    get_daily_sun_path,
    get_seasonal_summary,
    get_sunrise_sunset,
    get_sun_position,
)
from app.services.nrel_service import AnnualIrradianceResult, MonthlyIrradiance, get_irradiance

router = APIRouter()
logger = get_logger(__name__)


# ── Response models ────────────────────────────────────────────────────────────

class SunPositionOut(BaseModel):
    timestamp: datetime
    azimuth_deg: float
    elevation_deg: float
    is_daytime: bool


class SunriseSetOut(BaseModel):
    date: date
    sunrise: datetime
    solar_noon: datetime
    sunset: datetime
    day_length_hours: float
    max_elevation_deg: float
    solar_noon_azimuth_deg: float


class MonthlySolarOut(BaseModel):
    month: int
    avg_day_length_hours: float
    avg_max_elevation_deg: float
    avg_sunrise_hour: float
    avg_sunset_hour: float
    solstice_type: str | None
    # irradiance fields (added from NREL/pvlib)
    solrad_daily_avg: float | None = None
    peak_sun_hours: float | None = None
    ac_monthly_kwh: float | None = None


class SeasonalSolarOut(BaseModel):
    lat: float
    lon: float
    monthly: list[MonthlySolarOut]
    summer_solstice: SunriseSetOut
    winter_solstice: SunriseSetOut
    spring_equinox: SunriseSetOut
    autumn_equinox: SunriseSetOut
    annual_ac_kwh: float | None = None
    irradiance_source: str | None = None


class DailySolarOut(BaseModel):
    date: date
    sun_path: list[SunPositionOut]
    sunrise_set: SunriseSetOut
    irradiance: float | None = None   # kWh/m² for this date
    peak_sun_hours: float | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ss_to_out(ss: SunriseSet) -> SunriseSetOut:
    return SunriseSetOut(
        date=ss.date,
        sunrise=ss.sunrise,
        solar_noon=ss.solar_noon,
        sunset=ss.sunset,
        day_length_hours=ss.day_length_hours,
        max_elevation_deg=ss.max_elevation_deg,
        solar_noon_azimuth_deg=ss.solar_noon_azimuth_deg,
    )


def _validate_coords(lat: float, lon: float) -> None:
    if not (-90 <= lat <= 90):
        raise HTTPException(status_code=422, detail="lat must be between -90 and 90")
    if not (-180 <= lon <= 180):
        raise HTTPException(status_code=422, detail="lon must be between -180 and 180")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/position", response_model=SunPositionOut)
async def sun_position(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    dt: datetime | None = Query(None, description="ISO datetime (UTC). Defaults to now."),
) -> SunPositionOut:
    """Get the current (or specified) sun position — azimuth and elevation."""
    _validate_coords(lat, lon)
    target_dt = dt or datetime.now(tz=timezone.utc)
    pos = get_sun_position(lat, lon, target_dt)
    return SunPositionOut(
        timestamp=pos.timestamp,
        azimuth_deg=pos.azimuth_deg,
        elevation_deg=pos.elevation_deg,
        is_daytime=pos.is_daytime,
    )


@router.get("/daily", response_model=DailySolarOut)
async def solar_daily(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    target_date: date = Query(None, alias="date", description="Date (YYYY-MM-DD). Defaults to today."),
) -> DailySolarOut:
    """Get sun path (every 15 min) + sunrise/sunset for a specific date."""
    _validate_coords(lat, lon)
    if target_date is None:
        target_date = date.today()

    path = get_daily_sun_path(lat, lon, target_date)
    ss = get_sunrise_sunset(lat, lon, target_date)

    # Get monthly irradiance to find this month's daily average
    try:
        irr = await get_irradiance(lat, lon)
        month_irr = next((m for m in irr.monthly if m.month == target_date.month), None)
        daily_irradiance = month_irr.solrad_monthly if month_irr else None
        peak_sun = month_irr.peak_sun_hours if month_irr else None
    except Exception:
        daily_irradiance = None
        peak_sun = None

    return DailySolarOut(
        date=target_date,
        sun_path=[
            SunPositionOut(
                timestamp=p.timestamp,
                azimuth_deg=p.azimuth_deg,
                elevation_deg=p.elevation_deg,
                is_daytime=p.is_daytime,
            )
            for p in path
        ],
        sunrise_set=_ss_to_out(ss),
        irradiance=daily_irradiance,
        peak_sun_hours=peak_sun,
    )


@router.get("/monthly", response_model=MonthlySolarOut)
async def solar_monthly(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    month: int = Query(..., ge=1, le=12, description="Month number (1-12)"),
    year: int = Query(None, description="Year (defaults to current year)"),
) -> MonthlySolarOut:
    """Get solar averages (day length, elevation, sunrise/sunset) for a specific month."""
    _validate_coords(lat, lon)
    import datetime as _dt
    use_year = year or _dt.date.today().year

    seasonal = get_seasonal_summary(lat, lon, year=use_year)
    month_data = next((m for m in seasonal.monthly if m.month == month), None)
    if not month_data:
        raise HTTPException(status_code=500, detail="Could not compute monthly summary")

    # Attach irradiance
    try:
        irr = await get_irradiance(lat, lon)
        month_irr = next((m for m in irr.monthly if m.month == month), None)
    except Exception:
        month_irr = None

    return MonthlySolarOut(
        month=month_data.month,
        avg_day_length_hours=month_data.avg_day_length_hours,
        avg_max_elevation_deg=month_data.avg_max_elevation_deg,
        avg_sunrise_hour=month_data.avg_sunrise_hour,
        avg_sunset_hour=month_data.avg_sunset_hour,
        solstice_type=month_data.solstice_type,
        solrad_daily_avg=month_irr.solrad_monthly if month_irr else None,
        peak_sun_hours=month_irr.peak_sun_hours if month_irr else None,
        ac_monthly_kwh=month_irr.ac_monthly_kwh if month_irr else None,
    )


@router.get("/seasonal", response_model=SeasonalSolarOut)
async def solar_seasonal(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    year: int = Query(None, description="Year (defaults to current year)"),
) -> SeasonalSolarOut:
    """Full seasonal solar summary — all 12 months + solstice/equinox data + irradiance."""
    _validate_coords(lat, lon)
    import datetime as _dt
    use_year = year or _dt.date.today().year

    seasonal = get_seasonal_summary(lat, lon, year=use_year)

    # Fetch irradiance
    try:
        irr = await get_irradiance(lat, lon)
        irr_map = {m.month: m for m in irr.monthly}
        annual_ac = irr.annual_ac_kwh
        irr_source = irr.source
    except Exception:
        irr_map = {}
        annual_ac = None
        irr_source = None

    monthly_out = [
        MonthlySolarOut(
            month=m.month,
            avg_day_length_hours=m.avg_day_length_hours,
            avg_max_elevation_deg=m.avg_max_elevation_deg,
            avg_sunrise_hour=m.avg_sunrise_hour,
            avg_sunset_hour=m.avg_sunset_hour,
            solstice_type=m.solstice_type,
            solrad_daily_avg=irr_map[m.month].solrad_monthly if m.month in irr_map else None,
            peak_sun_hours=irr_map[m.month].peak_sun_hours if m.month in irr_map else None,
            ac_monthly_kwh=irr_map[m.month].ac_monthly_kwh if m.month in irr_map else None,
        )
        for m in seasonal.monthly
    ]

    return SeasonalSolarOut(
        lat=lat,
        lon=lon,
        monthly=monthly_out,
        summer_solstice=_ss_to_out(seasonal.summer_solstice),
        winter_solstice=_ss_to_out(seasonal.winter_solstice),
        spring_equinox=_ss_to_out(seasonal.spring_equinox),
        autumn_equinox=_ss_to_out(seasonal.autumn_equinox),
        annual_ac_kwh=annual_ac,
        irradiance_source=irr_source,
    )


# ── Shadow models ───────────────────────────────────────────────────────────────

class ShadowVectorOut(BaseModel):
    timestamp: datetime
    azimuth_deg: float
    elevation_deg: float
    shadow_azimuth_deg: float
    shadow_length_ratio: float
    is_daytime: bool


class HourlyShadowOut(BaseModel):
    hour: int
    shadow_azimuth_deg: float
    shadow_length_ratio: float
    elevation_deg: float
    is_daytime: bool


class ShadowSweepOut(BaseModel):
    date: date
    lat: float
    lon: float
    hourly: list[HourlyShadowOut]
    max_shadow_hour: int
    min_shadow_hour: int
    solar_noon_hour: float


# ── Shadow endpoints ────────────────────────────────────────────────────────────

@router.get("/shadow", response_model=ShadowVectorOut)
async def solar_shadow(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    dt: datetime | None = Query(None, description="ISO datetime (UTC). Defaults to now."),
) -> ShadowVectorOut:
    """Get the current shadow direction and length ratio based on sun position."""
    _validate_coords(lat, lon)
    target_dt = dt or datetime.now(tz=timezone.utc)
    pos = get_sun_position(lat, lon, target_dt)
    sv = compute_shadow_vector(pos.azimuth_deg, pos.elevation_deg)
    return ShadowVectorOut(
        timestamp=pos.timestamp,
        azimuth_deg=sv.azimuth_deg,
        elevation_deg=sv.elevation_deg,
        shadow_azimuth_deg=sv.shadow_azimuth_deg,
        shadow_length_ratio=sv.shadow_length_ratio,
        is_daytime=sv.is_daytime,
    )


@router.get("/shadow/sweep", response_model=ShadowSweepOut)
async def solar_shadow_sweep(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    target_date: date = Query(None, alias="date", description="Date (YYYY-MM-DD). Defaults to today."),
) -> ShadowSweepOut:
    """Get 24-hour shadow sweep — hourly shadow direction + length data for animation."""
    _validate_coords(lat, lon)
    if target_date is None:
        target_date = date.today()

    cache_key = make_cache_key("shadow_sweep", lat=lat, lon=lon, date=str(target_date))
    cached = await cache_get(cache_key)
    if cached:
        return ShadowSweepOut(**cached)

    sweep = get_daily_shadow_sweep(lat, lon, target_date)
    result = ShadowSweepOut(
        date=sweep.date,
        lat=sweep.lat,
        lon=sweep.lon,
        hourly=[
            HourlyShadowOut(
                hour=h.hour,
                shadow_azimuth_deg=h.shadow_azimuth_deg,
                shadow_length_ratio=h.shadow_length_ratio,
                elevation_deg=h.elevation_deg,
                is_daytime=h.is_daytime,
            )
            for h in sweep.hourly
        ],
        max_shadow_hour=sweep.max_shadow_hour,
        min_shadow_hour=sweep.min_shadow_hour,
        solar_noon_hour=sweep.solar_noon_hour,
    )

    await cache_set(cache_key, result.model_dump(), ttl=3600)
    return result


# ── ROI models ──────────────────────────────────────────────────────────────────

class SolarROIOut(BaseModel):
    system_kw: float
    roof_area_sqm: float
    rate_per_kwh: float
    annual_kwh: float
    system_cost_usd: float
    annual_savings_usd: float
    payback_years: float
    ten_year_savings_usd: float
    twenty_year_savings_usd: float
    co2_offset_kg: float
    co2_offset_trees: int
    monthly_production_kwh: list[float]
    irradiance_source: str | None = None


# ── ROI endpoint ────────────────────────────────────────────────────────────────

@router.get("/roi", response_model=SolarROIOut)
async def solar_roi(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    roof_area_sqm: float = Query(50.0, ge=10, le=500, description="Available roof area (m²)"),
    system_kw: float = Query(6.0, ge=1, le=100, description="Solar system size (kW)"),
    rate_per_kwh: float = Query(0.13, ge=0.01, le=1.0, description="Local electricity rate (USD/kWh)"),
) -> SolarROIOut:
    """Calculate solar panel ROI — payback period, savings, CO2 offset, monthly production."""
    _validate_coords(lat, lon)

    cache_key = make_cache_key(
        "solar_roi", lat=lat, lon=lon,
        roof=roof_area_sqm, kw=system_kw, rate=rate_per_kwh,
    )
    cached = await cache_get(cache_key)
    if cached:
        return SolarROIOut(**cached)

    # Get irradiance for peak sun hours
    try:
        irr = await get_irradiance(lat, lon)
        peak_sun = irr.annual_ac_kwh / (irr.monthly[0].peak_sun_hours * 365 * system_kw * 0.80) if irr.monthly else 4.5
        # Simpler: average peak sun hours from monthly data
        peak_sun_hours = sum(m.peak_sun_hours for m in irr.monthly) / len(irr.monthly) if irr.monthly else 4.5
        irr_source = irr.source
    except Exception:
        peak_sun_hours = 4.5  # US average fallback
        irr_source = None

    roi = calculate_solar_roi(
        peak_sun_hours=peak_sun_hours,
        roof_area_sqm=roof_area_sqm,
        system_kw=system_kw,
        rate_per_kwh=rate_per_kwh,
    )

    result = SolarROIOut(
        system_kw=roi.system_kw,
        roof_area_sqm=roi.roof_area_sqm,
        rate_per_kwh=roi.rate_per_kwh,
        annual_kwh=roi.annual_kwh,
        system_cost_usd=roi.system_cost_usd,
        annual_savings_usd=roi.annual_savings_usd,
        payback_years=roi.payback_years,
        ten_year_savings_usd=roi.ten_year_savings_usd,
        twenty_year_savings_usd=roi.twenty_year_savings_usd,
        co2_offset_kg=roi.co2_offset_kg,
        co2_offset_trees=roi.co2_offset_trees,
        monthly_production_kwh=roi.monthly_production_kwh,
        irradiance_source=irr_source,
    )

    await cache_set(cache_key, result.model_dump(), ttl=21600)
    return result
