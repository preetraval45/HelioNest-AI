"""Historical climate data service using Open-Meteo archive API.

Fetches 10-year temperature, precipitation, and wind data and computes
linear trend slopes for climate risk forecasting.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Any

import httpx
import numpy as np

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.logging import get_logger

logger = get_logger(__name__)

_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


@dataclass
class YearlyTrend:
    year: int
    avg_temp_c: float
    total_precip_mm: float
    max_wind_kmh: float


@dataclass
class HistoricalClimate:
    lat: float
    lon: float
    years: int
    yearly: list[YearlyTrend]

    # Trend slopes (per decade)
    temp_trend_per_decade: float          # °C warming per 10 years (positive = warming)
    precip_trend_pct_per_decade: float    # % change in precipitation per 10 years
    wind_trend_per_decade: float          # km/h change per 10 years

    # Extremes
    hottest_year: int
    coldest_year: int
    wettest_year: int
    driest_year: int

    # Monthly averages across all years (1–12)
    monthly_avg_temp_c: list[float] = field(default_factory=list)


def _linear_trend(years: list[int], values: list[float]) -> float:
    """Return slope per year via numpy polyfit. Multiply by 10 for per-decade."""
    if len(years) < 2:
        return 0.0
    coeffs = np.polyfit(years, values, 1)
    return float(coeffs[0])


async def get_historical_climate(
    lat: float,
    lon: float,
    years: int = 10,
) -> HistoricalClimate:
    """Fetch and analyse last `years` years of climate data from Open-Meteo archive.

    Results are cached for 30 days (building data changes very slowly).
    """
    cache_key = make_cache_key("climate", lat=lat, lon=lon, years=years)
    cached = await cache_get(cache_key)
    if cached:
        return HistoricalClimate(**cached)

    today = datetime.date.today()
    end_year = today.year - 1  # last complete year
    start_year = end_year - years + 1
    start_date = f"{start_year}-01-01"
    end_date = f"{end_year}-12-31"

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(_ARCHIVE_URL, params=params)
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
    except Exception as exc:
        logger.warning("Open-Meteo archive API error: %s", exc)
        raise

    daily = data.get("daily", {})
    dates_raw: list[str] = daily.get("time", [])
    temp_max: list[float | None] = daily.get("temperature_2m_max", [])
    temp_min: list[float | None] = daily.get("temperature_2m_min", [])
    precip:   list[float | None] = daily.get("precipitation_sum", [])
    wind:     list[float | None] = daily.get("windspeed_10m_max", [])

    # Aggregate by year
    year_buckets: dict[int, dict[str, list[float]]] = {}
    month_temps: dict[int, list[float]] = {m: [] for m in range(1, 13)}

    for i, date_str in enumerate(dates_raw):
        try:
            dt = datetime.date.fromisoformat(date_str)
        except ValueError:
            continue
        y = dt.year
        m = dt.month

        if y not in year_buckets:
            year_buckets[y] = {"temp": [], "precip": [], "wind": []}

        t_max = temp_max[i] if i < len(temp_max) else None
        t_min = temp_min[i] if i < len(temp_min) else None
        p     = precip[i]   if i < len(precip)   else None
        w     = wind[i]     if i < len(wind)      else None

        if t_max is not None and t_min is not None:
            avg_t = (t_max + t_min) / 2
            year_buckets[y]["temp"].append(avg_t)
            month_temps[m].append(avg_t)
        if p is not None:
            year_buckets[y]["precip"].append(p)
        if w is not None:
            year_buckets[y]["wind"].append(w)

    yearly: list[YearlyTrend] = []
    for y in sorted(year_buckets.keys()):
        b = year_buckets[y]
        avg_temp = float(np.mean(b["temp"])) if b["temp"] else 0.0
        total_precip = float(np.sum(b["precip"])) if b["precip"] else 0.0
        max_wind = float(np.max(b["wind"])) if b["wind"] else 0.0
        yearly.append(YearlyTrend(
            year=y,
            avg_temp_c=round(avg_temp, 2),
            total_precip_mm=round(total_precip, 1),
            max_wind_kmh=round(max_wind, 1),
        ))

    yr_list  = [t.year for t in yearly]
    temp_list = [t.avg_temp_c for t in yearly]
    prec_list = [t.total_precip_mm for t in yearly]
    wind_list = [t.max_wind_kmh for t in yearly]

    temp_slope = _linear_trend(yr_list, temp_list) * 10  # per decade
    prec_slope_abs = _linear_trend(yr_list, prec_list) * 10
    avg_prec = float(np.mean(prec_list)) if prec_list else 1.0
    prec_slope_pct = (prec_slope_abs / avg_prec * 100) if avg_prec else 0.0
    wind_slope = _linear_trend(yr_list, wind_list) * 10

    hottest  = max(yearly, key=lambda t: t.avg_temp_c).year   if yearly else today.year
    coldest  = min(yearly, key=lambda t: t.avg_temp_c).year   if yearly else today.year
    wettest  = max(yearly, key=lambda t: t.total_precip_mm).year if yearly else today.year
    driest   = min(yearly, key=lambda t: t.total_precip_mm).year if yearly else today.year

    monthly_avg = [
        round(float(np.mean(month_temps[m])), 1) if month_temps[m] else 0.0
        for m in range(1, 13)
    ]

    result = HistoricalClimate(
        lat=lat,
        lon=lon,
        years=years,
        yearly=yearly,
        temp_trend_per_decade=round(temp_slope, 3),
        precip_trend_pct_per_decade=round(prec_slope_pct, 1),
        wind_trend_per_decade=round(wind_slope, 2),
        hottest_year=hottest,
        coldest_year=coldest,
        wettest_year=wettest,
        driest_year=driest,
        monthly_avg_temp_c=monthly_avg,
    )

    # Cache 30 days
    await cache_set(cache_key, {
        "lat": result.lat, "lon": result.lon, "years": result.years,
        "yearly": [{"year": t.year, "avg_temp_c": t.avg_temp_c,
                    "total_precip_mm": t.total_precip_mm, "max_wind_kmh": t.max_wind_kmh}
                   for t in result.yearly],
        "temp_trend_per_decade": result.temp_trend_per_decade,
        "precip_trend_pct_per_decade": result.precip_trend_pct_per_decade,
        "wind_trend_per_decade": result.wind_trend_per_decade,
        "hottest_year": result.hottest_year,
        "coldest_year": result.coldest_year,
        "wettest_year": result.wettest_year,
        "driest_year": result.driest_year,
        "monthly_avg_temp_c": result.monthly_avg_temp_c,
    }, ttl=86400 * 30)

    return result
