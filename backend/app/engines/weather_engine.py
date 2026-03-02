"""Weather enrichment engine — enriches raw weather data with derived metrics."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.weather_service import (
    CurrentWeather,
    MonthlyAverage,
    calc_comfort_score,
    calc_heat_index,
    calc_wind_chill,
)


@dataclass
class EnrichedWeather:
    """CurrentWeather with extra derived fields."""
    current: CurrentWeather
    apparent_vs_actual_delta: float   # feels_like - temp (positive = hotter, negative = colder)
    risk_flags: list[str]             # e.g. ["Heat Advisory", "High UV"]
    comfort_summary: str              # 1-2 sentence plain English summary


def enrich_weather(weather: CurrentWeather) -> EnrichedWeather:
    """Add derived fields and risk flags to a CurrentWeather record."""
    delta = round(weather.feels_like_c - weather.temp_c, 1)
    flags: list[str] = []

    # Heat / cold advisories
    if weather.heat_index_c >= 41:
        flags.append("Extreme Heat Danger")
    elif weather.heat_index_c >= 35:
        flags.append("Heat Danger")
    elif weather.heat_index_c >= 32:
        flags.append("Heat Caution")

    if weather.wind_chill_c <= -30:
        flags.append("Extreme Cold Warning")
    elif weather.wind_chill_c <= -20:
        flags.append("Wind Chill Warning")
    elif weather.wind_chill_c <= -15:
        flags.append("Wind Chill Advisory")

    # UV
    if weather.uv_index >= 11:
        flags.append("Extreme UV")
    elif weather.uv_index >= 8:
        flags.append("Very High UV")
    elif weather.uv_index >= 6:
        flags.append("High UV")

    # Wind
    if weather.wind_speed_kmh >= 60:
        flags.append("High Wind Warning")
    elif weather.wind_speed_kmh >= 40:
        flags.append("Wind Advisory")

    # Precipitation
    if weather.precipitation_mm > 10:
        flags.append("Heavy Precipitation")

    # Build summary
    summary_parts = [
        f"{weather.conditions} at {round(weather.temp_c)}°C",
        f"feels like {round(weather.feels_like_c)}°C",
        f"{weather.comfort_level} outdoor comfort ({round(weather.comfort_score)}/100)",
    ]
    if flags:
        summary_parts.append(f"Alerts: {', '.join(flags[:2])}")

    comfort_summary = ". ".join(summary_parts) + "."

    return EnrichedWeather(
        current=weather,
        apparent_vs_actual_delta=delta,
        risk_flags=flags,
        comfort_summary=comfort_summary,
    )


def score_monthly_comfort(averages: list[MonthlyAverage]) -> list[dict]:
    """Compute comfort scores for each month based on historical averages.

    Returns list of {month, comfort_score, comfort_level, avg_temp_c}.
    """
    results = []
    for avg in averages:
        mid_temp = (avg.avg_temp_max_c + avg.avg_temp_min_c) / 2
        # Estimate humidity as moderate (50%) for scoring — actual humidity not in monthly data
        score, level = calc_comfort_score(mid_temp, humidity_pct=50, wind_kmh=15, uv_index=avg.avg_uv_index)
        results.append({
            "month": avg.month,
            "comfort_score": score,
            "comfort_level": level,
            "avg_temp_c": round(mid_temp, 1),
        })
    return results
