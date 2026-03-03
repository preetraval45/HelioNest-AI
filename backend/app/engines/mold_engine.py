"""Mold Risk Index engine.

Computes a 0–10 mold risk score from temperature, relative humidity,
and dew point using established thresholds (based on Lüdecke / ASHRAE research).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class MoldRisk:
    """Mold growth risk assessment."""
    mold_index: float               # 0 (none) → 10 (extreme)
    risk_level: str                 # "low" | "moderate" | "high" | "extreme"
    risk_color: str                 # CSS color class for UI
    contributing_factors: list[str] = field(default_factory=list)
    recommendations: list[str]     = field(default_factory=list)


def calculate_mold_risk(
    temp_c: float,
    humidity_pct: float,
    dew_point_c: float | None = None,
) -> MoldRisk:
    """Compute mold growth risk index from environmental conditions.

    Risk thresholds:
    - Temperature: 15–35°C is the prime growth range; 20–30°C is optimal.
    - Humidity: >70% triggers elevated risk; >85% is high risk; >90% extreme.
    - Dew point: surface condensation occurs when surface temp ≈ dew point.

    Args:
        temp_c:       Ambient temperature (°C).
        humidity_pct: Relative humidity (0–100).
        dew_point_c:  Dew point temperature (°C). Optional.

    Returns:
        MoldRisk with index, level, factors, and recommendations.
    """
    score = 0.0
    factors: list[str] = []
    recs: list[str] = []

    # ── Temperature score (0–3 points) ─────────────────────────────────────────
    if 20 <= temp_c <= 30:
        score += 3.0
        factors.append(f"Optimal mold temperature ({temp_c:.1f}°C)")
    elif 15 <= temp_c < 20 or 30 < temp_c <= 35:
        score += 1.5
        factors.append(f"Elevated mold temperature ({temp_c:.1f}°C)")
    elif temp_c < 0:
        score -= 1.0  # freezing suppresses mold

    # ── Humidity score (0–5 points) ─────────────────────────────────────────────
    if humidity_pct >= 90:
        score += 5.0
        factors.append(f"Extreme humidity ({humidity_pct:.0f}%)")
        recs.append("Use industrial dehumidifiers; inspect walls for moisture intrusion")
    elif humidity_pct >= 85:
        score += 3.5
        factors.append(f"Very high humidity ({humidity_pct:.0f}%)")
        recs.append("Run dehumidifier to maintain humidity below 60%")
    elif humidity_pct >= 70:
        score += 2.0
        factors.append(f"Elevated humidity ({humidity_pct:.0f}%)")
        recs.append("Monitor humidity; increase ventilation")
    elif humidity_pct >= 60:
        score += 0.5
    else:
        recs.append("Maintain indoor humidity below 60% for best protection")

    # ── Dew point score (0–2 points) ────────────────────────────────────────────
    if dew_point_c is not None:
        dew_spread = temp_c - dew_point_c  # smaller = more condensation risk
        if dew_spread <= 2:
            score += 2.0
            factors.append(f"Near-saturation (dew point {dew_point_c:.1f}°C — surface condensation likely)")
            recs.append("Inspect for condensation on windows, walls, and pipes")
        elif dew_spread <= 5:
            score += 1.0
            factors.append(f"High dew point spread ({dew_spread:.1f}°C)")

    # ── Cap and classify ─────────────────────────────────────────────────────────
    index = min(10.0, max(0.0, score))

    if index < 2:
        level = "low"
        color = "text-emerald-500"
        if not recs:
            recs.append("Current conditions pose minimal mold risk — maintain good ventilation")
    elif index < 4:
        level = "moderate"
        color = "text-yellow-500"
        recs.append("Monitor humidity levels; ensure bathroom / kitchen fans are used")
    elif index < 7:
        level = "high"
        color = "text-orange-500"
        recs.append("Check crawl spaces, attics, and basements for visible mold")
        recs.append("Consider a whole-home dehumidifier")
    else:
        level = "extreme"
        color = "text-red-500"
        recs.append("Consult a mold remediation specialist immediately")
        recs.append("Identify and fix any water leaks or moisture sources")

    return MoldRisk(
        mold_index=round(index, 1),
        risk_level=level,
        risk_color=color,
        contributing_factors=factors,
        recommendations=recs,
    )
