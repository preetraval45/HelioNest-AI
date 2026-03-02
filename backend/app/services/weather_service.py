"""Weather service — fetches current conditions, forecasts, and monthly averages.

Uses Open-Meteo API (free, no API key required).
Docs: https://open-meteo.com/en/docs
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

import httpx

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_HISTORICAL_URL = "https://archive-api.open-meteo.com/v1/archive"
REQUEST_TIMEOUT = 15.0

WMO_DESCRIPTIONS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle",
    55: "Heavy drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 80: "Rain showers",
    81: "Moderate showers", 82: "Violent showers", 95: "Thunderstorm",
    96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class CurrentWeather:
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
    comfort_score: float     # 0-100
    comfort_level: str       # Excellent / Good / Fair / Poor / Very Poor


@dataclass
class ForecastDay:
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


@dataclass
class MonthlyAverage:
    month: int
    avg_temp_max_c: float
    avg_temp_min_c: float
    avg_precipitation_mm: float
    avg_uv_index: float


# ── Comfort calculations ───────────────────────────────────────────────────────

def calc_heat_index(temp_c: float, humidity_pct: float) -> float:
    """Rothfusz heat index equation (valid when temp >= 27°C and humidity >= 40%)."""
    if temp_c < 27 or humidity_pct < 40:
        return temp_c
    t = temp_c * 9 / 5 + 32  # to Fahrenheit
    h = humidity_pct
    hi_f = (
        -42.379
        + 2.04901523 * t
        + 10.14333127 * h
        - 0.22475541 * t * h
        - 0.00683783 * t ** 2
        - 0.05481717 * h ** 2
        + 0.00122874 * t ** 2 * h
        + 0.00085282 * t * h ** 2
        - 0.00000199 * t ** 2 * h ** 2
    )
    return round((hi_f - 32) * 5 / 9, 1)


def calc_wind_chill(temp_c: float, wind_kmh: float) -> float:
    """Environment Canada wind chill formula (valid when temp <= 10°C and wind >= 4.8 km/h)."""
    if temp_c > 10 or wind_kmh < 4.8:
        return temp_c
    v = wind_kmh ** 0.16
    wc = 13.12 + 0.6215 * temp_c - 11.37 * v + 0.3965 * temp_c * v
    return round(wc, 1)


def calc_comfort_score(temp_c: float, humidity_pct: float, wind_kmh: float, uv_index: float) -> tuple[float, str]:
    """Return (score 0-100, level string) for outdoor comfort."""
    score = 100.0

    # Temperature penalty
    if temp_c < 0:
        score -= min(40, abs(temp_c) * 2)
    elif temp_c < 10:
        score -= (10 - temp_c) * 1.5
    elif temp_c > 35:
        score -= (temp_c - 35) * 3
    elif temp_c > 28:
        score -= (temp_c - 28) * 1.5

    # Humidity penalty (most comfortable 30-60%)
    if humidity_pct > 70:
        score -= (humidity_pct - 70) * 0.5
    elif humidity_pct < 20:
        score -= (20 - humidity_pct) * 0.3

    # Wind penalty (some wind is nice, too much is not)
    if wind_kmh > 30:
        score -= (wind_kmh - 30) * 0.5
    elif wind_kmh > 50:
        score -= 10

    # UV penalty
    if uv_index > 7:
        score -= (uv_index - 7) * 3
    elif uv_index > 5:
        score -= (uv_index - 5) * 1.5

    score = max(0, min(100, round(score)))

    if score >= 80:
        level = "Excellent"
    elif score >= 65:
        level = "Good"
    elif score >= 45:
        level = "Fair"
    elif score >= 25:
        level = "Poor"
    else:
        level = "Very Poor"

    return score, level


# ── Open-Meteo fetchers ────────────────────────────────────────────────────────

async def _fetch_current_and_forecast(lat: float, lon: float) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": [
            "temperature_2m", "apparent_temperature", "relative_humidity_2m",
            "wind_speed_10m", "precipitation", "uv_index", "weather_code",
            "surface_pressure",
        ],
        "daily": [
            "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
            "uv_index_max", "weather_code", "wind_speed_10m_max",
            "sunrise", "sunset",
        ],
        "forecast_days": 7,
        "timezone": "UTC",
    }
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        return resp.json()


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_current_weather(lat: float, lon: float) -> CurrentWeather:
    """Fetch current weather conditions for a location."""
    cache_key = make_cache_key("weather_current", f"{lat:.3f}_{lon:.3f}")
    cached = await cache_get(cache_key)
    if cached:
        cached["timestamp"] = datetime.fromisoformat(cached["timestamp"])
        return CurrentWeather(**cached)

    data = await _fetch_current_and_forecast(lat, lon)
    current = data["current"]

    temp_c = float(current.get("temperature_2m", 20))
    feels_like_c = float(current.get("apparent_temperature", temp_c))
    humidity = float(current.get("relative_humidity_2m", 50))
    wind_kmh = float(current.get("wind_speed_10m", 0))
    precip = float(current.get("precipitation", 0))
    uv = float(current.get("uv_index", 0))
    weather_code = int(current.get("weather_code", 0))
    conditions = WMO_DESCRIPTIONS.get(weather_code, "Unknown")

    heat_index = calc_heat_index(temp_c, humidity)
    wind_chill = calc_wind_chill(temp_c, wind_kmh)
    comfort_score, comfort_level = calc_comfort_score(temp_c, humidity, wind_kmh, uv)

    now = datetime.now(tz=timezone.utc)
    result = CurrentWeather(
        timestamp=now,
        temp_c=round(temp_c, 1),
        feels_like_c=round(feels_like_c, 1),
        humidity_pct=round(humidity, 1),
        wind_speed_kmh=round(wind_kmh, 1),
        precipitation_mm=round(precip, 1),
        uv_index=round(uv, 1),
        conditions=conditions,
        weather_code=weather_code,
        heat_index_c=heat_index,
        wind_chill_c=wind_chill,
        comfort_score=comfort_score,
        comfort_level=comfort_level,
    )

    await cache_set(
        cache_key,
        {**result.__dict__, "timestamp": result.timestamp.isoformat()},
        settings.CACHE_TTL_WEATHER_CURRENT,
    )
    logger.info("Fetched current weather for (%.3f, %.3f): %.1f°C %s", lat, lon, temp_c, conditions)
    return result


async def get_forecast(lat: float, lon: float, days: int = 7) -> list[ForecastDay]:
    """Fetch 1-7 day weather forecast."""
    cache_key = make_cache_key("weather_forecast", f"{lat:.3f}_{lon:.3f}_{days}")
    cached = await cache_get(cache_key)
    if cached:
        return [
            ForecastDay(
                **{**d, "date": date.fromisoformat(d["date"]),
                   "sunrise": datetime.fromisoformat(d["sunrise"]) if d.get("sunrise") else None,
                   "sunset": datetime.fromisoformat(d["sunset"]) if d.get("sunset") else None}
            )
            for d in cached
        ]

    data = await _fetch_current_and_forecast(lat, lon)
    daily = data.get("daily", {})

    dates = daily.get("time", [])
    temp_max = daily.get("temperature_2m_max", [])
    temp_min = daily.get("temperature_2m_min", [])
    precip = daily.get("precipitation_sum", [])
    uv_max = daily.get("uv_index_max", [])
    codes = daily.get("weather_code", [])
    wind_max = daily.get("wind_speed_10m_max", [])
    sunrises = daily.get("sunrise", [])
    sunsets = daily.get("sunset", [])

    forecast: list[ForecastDay] = []
    for i in range(min(days, len(dates))):
        code = int(codes[i]) if codes else 0
        sr = datetime.fromisoformat(sunrises[i]) if sunrises and i < len(sunrises) else None
        ss_dt = datetime.fromisoformat(sunsets[i]) if sunsets and i < len(sunsets) else None
        forecast.append(
            ForecastDay(
                date=date.fromisoformat(dates[i]),
                temp_max_c=round(float(temp_max[i]), 1) if temp_max else 0,
                temp_min_c=round(float(temp_min[i]), 1) if temp_min else 0,
                precipitation_mm=round(float(precip[i]), 1) if precip else 0,
                weather_code=code,
                conditions=WMO_DESCRIPTIONS.get(code, "Unknown"),
                uv_index_max=round(float(uv_max[i]), 1) if uv_max else 0,
                wind_speed_max_kmh=round(float(wind_max[i]), 1) if wind_max else 0,
                sunrise=sr,
                sunset=ss_dt,
            )
        )

    await cache_set(
        cache_key,
        [
            {**f.__dict__, "date": f.date.isoformat(),
             "sunrise": f.sunrise.isoformat() if f.sunrise else None,
             "sunset": f.sunset.isoformat() if f.sunset else None}
            for f in forecast
        ],
        settings.CACHE_TTL_WEATHER_FORECAST,
    )
    return forecast


async def get_monthly_averages(lat: float, lon: float) -> list[MonthlyAverage]:
    """Compute 12-month climate averages using Open-Meteo historical archive."""
    cache_key = make_cache_key("weather_monthly", f"{lat:.3f}_{lon:.3f}")
    cached = await cache_get(cache_key)
    if cached:
        return [MonthlyAverage(**m) for m in cached]

    import datetime as _dt
    today = _dt.date.today()
    # Use last full year of data
    end_date = _dt.date(today.year - 1, 12, 31)
    start_date = _dt.date(today.year - 1, 1, 1)

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": [
            "temperature_2m_max", "temperature_2m_min",
            "precipitation_sum", "uv_index_max",
        ],
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(OPEN_METEO_HISTORICAL_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Historical weather fetch failed: %s", exc)
        # Return rough estimates
        return [MonthlyAverage(month=m, avg_temp_max_c=20, avg_temp_min_c=10, avg_precipitation_mm=60, avg_uv_index=5) for m in range(1, 13)]

    daily = data.get("daily", {})
    dates = daily.get("time", [])
    temp_max_list = daily.get("temperature_2m_max", [])
    temp_min_list = daily.get("temperature_2m_min", [])
    precip_list = daily.get("precipitation_sum", [])
    uv_list = daily.get("uv_index_max", [])

    # Group by month
    monthly_data: dict[int, dict[str, list]] = {m: {"temp_max": [], "temp_min": [], "precip": [], "uv": []} for m in range(1, 13)}
    for i, d_str in enumerate(dates):
        month = int(d_str[5:7])
        if temp_max_list and i < len(temp_max_list) and temp_max_list[i] is not None:
            monthly_data[month]["temp_max"].append(float(temp_max_list[i]))
        if temp_min_list and i < len(temp_min_list) and temp_min_list[i] is not None:
            monthly_data[month]["temp_min"].append(float(temp_min_list[i]))
        if precip_list and i < len(precip_list) and precip_list[i] is not None:
            monthly_data[month]["precip"].append(float(precip_list[i]))
        if uv_list and i < len(uv_list) and uv_list[i] is not None:
            monthly_data[month]["uv"].append(float(uv_list[i]))

    def avg(vals: list) -> float:
        return round(sum(vals) / len(vals), 1) if vals else 0.0

    averages = [
        MonthlyAverage(
            month=m,
            avg_temp_max_c=avg(monthly_data[m]["temp_max"]),
            avg_temp_min_c=avg(monthly_data[m]["temp_min"]),
            avg_precipitation_mm=round(sum(monthly_data[m]["precip"]), 1),
            avg_uv_index=avg(monthly_data[m]["uv"]),
        )
        for m in range(1, 13)
    ]

    await cache_set(
        cache_key,
        [a.__dict__ for a in averages],
        settings.CACHE_TTL_WEATHER_MONTHLY,
    )
    logger.info("Computed monthly averages for (%.3f, %.3f)", lat, lon)
    return averages
