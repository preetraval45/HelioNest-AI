"""Property Heat Impact Engine — facade heat gain, car heat risk, outdoor comfort.

Models heat impact on a property based on solar irradiance, orientation, and weather.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import NamedTuple


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class FacadeHeatScore:
    """Monthly heat gain score for one facade direction."""
    direction: str           # "North", "South", "East", "West"
    month: int
    heat_gain_score: int     # 0-100 (0=minimal, 100=extreme solar load)
    daily_peak_hours: float  # estimated hours of direct sun
    risk_level: str          # "Low" / "Moderate" / "High" / "Extreme"


@dataclass
class CarHeatResult:
    """Estimated car interior temperature after being parked."""
    outdoor_temp_c: float
    irradiance_w_m2: float
    hours_parked: float
    interior_temp_c: float
    risk_level: str          # "Safe" / "Warm" / "Hot" / "Dangerous" / "Deadly"
    risk_color: str          # CSS color for UI
    warning_message: str


@dataclass
class OutdoorComfortMonth:
    """Outdoor comfort score for a given month."""
    month: int
    month_name: str
    comfort_score: int       # 0-100
    comfort_level: str
    avg_temp_c: float
    dominant_risk: str | None


@dataclass
class AnnualImpactSummary:
    """Annual heat impact summary for a property."""
    best_outdoor_month: int
    worst_outdoor_month: int
    hottest_facade: str
    coolest_facade: str
    max_car_interior_temp_c: float     # worst-case summer scenario
    annual_comfort_score: float        # mean of monthly scores
    key_insight: str


# ── Constants ──────────────────────────────────────────────────────────────────

MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Approximate declination angle (degrees) per month (mid-month)
_DECLINATION = {
    1: -21, 2: -13, 3: -2, 4: 10, 5: 18, 6: 23,
    7: 21,  8: 13,  9: 2, 10: -9, 11: -19, 12: -23,
}


# ── Facade heat gain ───────────────────────────────────────────────────────────

def _solar_declination(month: int) -> float:
    return _DECLINATION.get(month, 0)


def _facade_peak_hours(direction: str, lat: float, month: int) -> float:
    """Estimate direct-sun hours per day for a facade given lat, month, orientation."""
    decl = _solar_declination(month)
    # Solar altitude at noon
    solar_noon_alt = 90 - abs(lat - decl)
    solar_noon_alt = max(0, min(90, solar_noon_alt))

    # Day length approximation (hours above horizon)
    # Using simplified formula: H = (2/15) * arccos(-tan(lat)*tan(decl))
    try:
        lat_r = math.radians(lat)
        decl_r = math.radians(decl)
        val = -math.tan(lat_r) * math.tan(decl_r)
        val = max(-1, min(1, val))
        day_length = (2 / 15) * math.degrees(math.acos(val))
    except Exception:
        day_length = 12.0

    # Distribute peak hours by facade direction
    # South (northern hemisphere) gets most midday sun
    # North gets almost none
    # East/West get morning/afternoon respectively
    if lat >= 0:  # Northern Hemisphere
        direction_fraction = {
            "South": 0.55 if decl > 0 else 0.70,
            "North": 0.05 if decl < 0 else 0.15,
            "East": 0.35,
            "West": 0.35,
        }
    else:  # Southern Hemisphere — flip N/S
        direction_fraction = {
            "North": 0.55 if decl < 0 else 0.70,
            "South": 0.05 if decl > 0 else 0.15,
            "East": 0.35,
            "West": 0.35,
        }

    frac = direction_fraction.get(direction, 0.25)
    return round(day_length * frac, 1)


def get_facade_heat_scores(lat: float) -> list[FacadeHeatScore]:
    """Return monthly heat gain scores for all four facade directions."""
    results: list[FacadeHeatScore] = []
    directions = ["North", "South", "East", "West"]

    for direction in directions:
        for month in range(1, 13):
            peak_hours = _facade_peak_hours(direction, lat, month)

            # Heat gain score: peak_hours × solar intensity factor
            # Summer months have higher solar intensity
            decl = _solar_declination(month)
            intensity = 0.5 + 0.5 * math.sin(math.radians(max(0, decl + 23)))
            score = min(100, round(peak_hours * 10 * intensity))

            if score >= 70:
                risk = "Extreme"
            elif score >= 50:
                risk = "High"
            elif score >= 25:
                risk = "Moderate"
            else:
                risk = "Low"

            results.append(FacadeHeatScore(
                direction=direction,
                month=month,
                heat_gain_score=score,
                daily_peak_hours=peak_hours,
                risk_level=risk,
            ))

    return results


# ── Car heat risk model ────────────────────────────────────────────────────────

_CAR_RISK_THRESHOLDS = [
    (38, "Safe",      "#22c55e", "Interior is within safe temperature range."),
    (45, "Warm",      "#eab308", "Interior is warm — avoid leaving pets or children."),
    (52, "Hot",       "#f97316", "Dangerous for pets and children. Do not leave items that can melt."),
    (60, "Dangerous", "#ef4444", "Extreme risk to life. Never leave living beings inside."),
    (999, "Deadly",   "#7c3aed", "Potentially fatal interior temperature. Immediate danger to life."),
]


def estimate_car_interior_temp(
    outdoor_temp_c: float,
    irradiance_w_m2: float = 800.0,
    hours_parked: float = 1.0,
) -> CarHeatResult:
    """Estimate car interior temperature using an empirical thermal model.

    Based on research: car interior rises ~10°C above ambient in 10 minutes,
    and continues rising as a function of irradiance and time.

    Reference: Jan/Null (2018) study + NHTSA thermal model.
    """
    # Base heat rise from sunlight exposure (W/m² effect over time)
    # Roughly: ΔT = (irradiance / 200) * log(hours + 1) * 30
    solar_rise = (irradiance_w_m2 / 200.0) * math.log(hours_parked + 1) * 18

    # Clamp to realistic max (car doesn't rise indefinitely)
    solar_rise = min(solar_rise, 45.0)

    # Greenhouse effect base: even in shade car heats ~5-8°C over ambient
    greenhouse_base = 6.0

    interior_temp = outdoor_temp_c + greenhouse_base + solar_rise
    interior_temp = round(interior_temp, 1)

    # Classify risk
    risk_level, risk_color, warning = "Safe", "#22c55e", "Interior is within safe temperature range."
    for threshold, level, color, message in _CAR_RISK_THRESHOLDS:
        if interior_temp <= threshold:
            risk_level, risk_color, warning = level, color, message
            break

    return CarHeatResult(
        outdoor_temp_c=outdoor_temp_c,
        irradiance_w_m2=irradiance_w_m2,
        hours_parked=hours_parked,
        interior_temp_c=interior_temp,
        risk_level=risk_level,
        risk_color=risk_color,
        warning_message=warning,
    )


# ── Outdoor comfort calendar ───────────────────────────────────────────────────

def get_monthly_outdoor_comfort(
    monthly_temps: list[dict],  # [{month, avg_temp_c, avg_humidity, avg_uv_index}, ...]
) -> list[OutdoorComfortMonth]:
    """Score outdoor comfort for each month from historical averages."""
    results: list[OutdoorComfortMonth] = []

    for entry in monthly_temps:
        month = entry["month"]
        temp = entry.get("avg_temp_c", 20.0)
        humidity = entry.get("avg_humidity", 50.0)
        uv = entry.get("avg_uv_index", 4.0)

        # Comfort scoring (same logic as weather engine)
        score = 100.0
        if temp < 0:
            score -= min(40, abs(temp) * 2)
        elif temp < 10:
            score -= (10 - temp) * 1.5
        elif temp > 35:
            score -= (temp - 35) * 3
        elif temp > 28:
            score -= (temp - 28) * 1.5

        if humidity > 70:
            score -= (humidity - 70) * 0.5
        elif humidity < 20:
            score -= (20 - humidity) * 0.3

        if uv > 7:
            score -= (uv - 7) * 3
        elif uv > 5:
            score -= (uv - 5) * 1.5

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

        dominant_risk = None
        if temp > 35:
            dominant_risk = "Heat"
        elif temp < 0:
            dominant_risk = "Freeze"
        elif uv > 8:
            dominant_risk = "High UV"
        elif humidity > 80:
            dominant_risk = "High Humidity"

        results.append(OutdoorComfortMonth(
            month=month,
            month_name=MONTH_NAMES[month],
            comfort_score=score,
            comfort_level=level,
            avg_temp_c=round(temp, 1),
            dominant_risk=dominant_risk,
        ))

    return results


# ── Annual impact summary ──────────────────────────────────────────────────────

def get_annual_impact_summary(
    lat: float,
    monthly_comfort: list[OutdoorComfortMonth],
    monthly_temps: list[dict],
) -> AnnualImpactSummary:
    """Synthesize facade, car risk, and comfort data into an annual summary."""
    facade_scores = get_facade_heat_scores(lat)

    # Best/worst outdoor months
    best = max(monthly_comfort, key=lambda m: m.comfort_score)
    worst = min(monthly_comfort, key=lambda m: m.comfort_score)

    # Hottest/coolest facade (by average annual score)
    facade_avgs: dict[str, float] = {}
    for fs in facade_scores:
        facade_avgs.setdefault(fs.direction, []).append(fs.heat_gain_score)  # type: ignore[arg-type]
    facade_means = {k: sum(v) / len(v) for k, v in facade_avgs.items()}  # type: ignore[arg-type]
    hottest = max(facade_means, key=facade_means.get)  # type: ignore[arg-type]
    coolest = min(facade_means, key=facade_means.get)  # type: ignore[arg-type]

    # Worst-case car temp (hottest summer month, peak irradiance, 2h parked)
    summer_temps = [t for t in monthly_temps if t["month"] in (6, 7, 8)]
    if summer_temps:
        peak_temp = max(summer_temps, key=lambda t: t.get("avg_temp_c", 0))
        car_result = estimate_car_interior_temp(
            outdoor_temp_c=peak_temp.get("avg_temp_c", 35),
            irradiance_w_m2=900,
            hours_parked=2.0,
        )
        max_car_temp = car_result.interior_temp_c
    else:
        max_car_temp = 0.0

    # Annual comfort average
    annual_comfort = round(sum(m.comfort_score for m in monthly_comfort) / len(monthly_comfort), 1)

    # Key insight
    if annual_comfort >= 70:
        key_insight = f"This property enjoys excellent year-round outdoor comfort with {best.month_name} being the best month."
    elif annual_comfort >= 50:
        key_insight = f"Comfortable for most of the year — best in {best.month_name}, most challenging in {worst.month_name}."
    else:
        key_insight = f"Demanding climate — {worst.month_name} poses significant outdoor comfort challenges."

    return AnnualImpactSummary(
        best_outdoor_month=best.month,
        worst_outdoor_month=worst.month,
        hottest_facade=hottest,
        coolest_facade=coolest,
        max_car_interior_temp_c=max_car_temp,
        annual_comfort_score=annual_comfort,
        key_insight=key_insight,
    )
