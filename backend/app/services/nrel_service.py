"""NREL PVWatts service — monthly solar irradiance and peak sun hours.

API docs: https://developer.nrel.gov/docs/solar/pvwatts/v6/
Free API key: https://developer.nrel.gov/signup/
Falls back to pvlib-computed estimates when no API key is set.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

PVWATTS_URL = "https://developer.nrel.gov/api/pvwatts/v6.json"
CACHE_TTL_IRRADIANCE = 60 * 60 * 24 * 30  # 30 days
REQUEST_TIMEOUT = 15.0


@dataclass
class MonthlyIrradiance:
    month: int           # 1-12
    ac_monthly_kwh: float  # AC energy (kWh) for a 1kW system
    solrad_monthly: float  # Monthly solar radiation (kWh/m²/day)
    peak_sun_hours: float  # Effective peak sun hours per day


@dataclass
class AnnualIrradianceResult:
    lat: float
    lon: float
    annual_ac_kwh: float
    monthly: list[MonthlyIrradiance]
    source: str  # "nrel" | "pvlib_estimate"


# ── NREL PVWatts API ───────────────────────────────────────────────────────────

async def _fetch_pvwatts(lat: float, lon: float) -> AnnualIrradianceResult | None:
    """Fetch annual/monthly irradiance from NREL PVWatts v6."""
    if not settings.NREL_API_KEY:
        return None

    params = {
        "api_key": settings.NREL_API_KEY,
        "lat": lat,
        "lon": lon,
        "system_capacity": 1,   # 1 kW system for normalized output
        "module_type": 0,        # Standard
        "losses": 14,            # Default losses (%)
        "array_type": 1,         # Fixed — open rack
        "tilt": max(0.0, abs(lat) * 0.76),  # Rule of thumb: tilt ≈ 0.76 * |lat|
        "azimuth": 180 if lat >= 0 else 0,  # South-facing in northern hemisphere
        "timeframe": "monthly",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(PVWATTS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("NREL PVWatts request failed: %s", exc)
        return None

    outputs = data.get("outputs", {})
    ac_monthly = outputs.get("ac_monthly", [])
    solrad_monthly = outputs.get("solrad_monthly", [])
    annual_ac = float(outputs.get("ac_annual", 0))

    if not ac_monthly or len(ac_monthly) != 12:
        return None

    monthly = [
        MonthlyIrradiance(
            month=i + 1,
            ac_monthly_kwh=round(float(ac_monthly[i]), 2),
            solrad_monthly=round(float(solrad_monthly[i]) if solrad_monthly else 0, 2),
            peak_sun_hours=round(float(solrad_monthly[i]) if solrad_monthly else 0, 2),
        )
        for i in range(12)
    ]

    return AnnualIrradianceResult(
        lat=lat,
        lon=lon,
        annual_ac_kwh=round(annual_ac, 2),
        monthly=monthly,
        source="nrel",
    )


# ── pvlib fallback estimate ────────────────────────────────────────────────────

def _estimate_via_pvlib(lat: float, lon: float) -> AnnualIrradianceResult:
    """Estimate monthly irradiance using pvlib clear-sky model (no API key needed)."""
    import datetime as _dt

    import numpy as np
    import pandas as pd
    import pvlib

    year = _dt.date.today().year
    loc = pvlib.location.Location(latitude=lat, longitude=lon)

    monthly: list[MonthlyIrradiance] = []
    for month in range(1, 13):
        # Full month of times at 1-hour resolution
        start = pd.Timestamp(year=year, month=month, day=1, tz="UTC")
        end = start + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=23)
        times = pd.date_range(start=start, end=end, freq="1h")

        solpos = loc.get_solarposition(times)
        cs = loc.get_clearsky(times, model="ineichen")

        # GHI in W/m² — integrate to kWh/m²
        above = solpos["elevation"] > 0
        ghi = cs["ghi"].where(above, 0)
        daily_ghi = ghi.resample("D").sum() / 1000  # Wh → kWh/m²

        avg_daily_ghi = float(daily_ghi.mean())
        days_in_month = int(daily_ghi.count())
        monthly_ghi = avg_daily_ghi * days_in_month

        # Estimate AC output: 1 kW system, ~17% efficiency, PR ~0.75
        ac_monthly = monthly_ghi * 0.75

        monthly.append(
            MonthlyIrradiance(
                month=month,
                ac_monthly_kwh=round(ac_monthly, 2),
                solrad_monthly=round(avg_daily_ghi, 2),
                peak_sun_hours=round(avg_daily_ghi, 2),
            )
        )

    annual_ac = sum(m.ac_monthly_kwh for m in monthly)
    return AnnualIrradianceResult(
        lat=lat,
        lon=lon,
        annual_ac_kwh=round(annual_ac, 2),
        monthly=monthly,
        source="pvlib_estimate",
    )


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_irradiance(lat: float, lon: float) -> AnnualIrradianceResult:
    """Get monthly solar irradiance for a location.

    1. Check Redis cache (TTL: 30 days)
    2. Try NREL PVWatts API (if NREL_API_KEY set)
    3. Fall back to pvlib clear-sky estimate
    """
    cache_key = make_cache_key("nrel_irradiance", f"{lat:.3f}_{lon:.3f}")

    cached = await cache_get(cache_key)
    if cached:
        logger.debug("Irradiance cache hit for (%.3f, %.3f)", lat, lon)
        monthly = [MonthlyIrradiance(**m) for m in cached["monthly"]]
        return AnnualIrradianceResult(
            lat=cached["lat"],
            lon=cached["lon"],
            annual_ac_kwh=cached["annual_ac_kwh"],
            monthly=monthly,
            source=cached["source"],
        )

    # Try NREL first, fall back to pvlib
    result = await _fetch_pvwatts(lat, lon)
    if result is None:
        logger.info("NREL key not set or request failed — using pvlib estimate for (%.3f, %.3f)", lat, lon)
        result = _estimate_via_pvlib(lat, lon)

    # Cache the result
    await cache_set(
        cache_key,
        {
            "lat": result.lat,
            "lon": result.lon,
            "annual_ac_kwh": result.annual_ac_kwh,
            "monthly": [
                {
                    "month": m.month,
                    "ac_monthly_kwh": m.ac_monthly_kwh,
                    "solrad_monthly": m.solrad_monthly,
                    "peak_sun_hours": m.peak_sun_hours,
                }
                for m in result.monthly
            ],
            "source": result.source,
        },
        CACHE_TTL_IRRADIANCE,
    )

    logger.info(
        "Fetched irradiance for (%.3f, %.3f) via %s — annual=%.1f kWh",
        lat, lon, result.source, result.annual_ac_kwh,
    )
    return result
