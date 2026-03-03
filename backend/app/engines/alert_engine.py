"""Alert engine — evaluate weather/solar data against risk thresholds."""

from dataclasses import dataclass
from enum import Enum


class AlertSeverity(str, Enum):
    INFO    = "info"
    WARNING = "warning"
    DANGER  = "danger"


@dataclass
class Alert:
    id: str
    severity: AlertSeverity
    title: str
    description: str
    icon: str


# ── Thresholds ─────────────────────────────────────────────────────────────────

_THRESHOLDS = {
    "extreme_heat":   {"temp_c": 38,   "severity": AlertSeverity.DANGER,  "title": "Extreme Heat",      "icon": "🔥"},
    "high_heat":      {"temp_c": 32,   "severity": AlertSeverity.WARNING, "title": "High Heat",         "icon": "🌡️"},
    "freeze_risk":    {"temp_c": 0,    "severity": AlertSeverity.DANGER,  "title": "Freeze Risk",       "icon": "❄️"},
    "cold_warning":   {"temp_c": 4,    "severity": AlertSeverity.WARNING, "title": "Cold Warning",      "icon": "🥶"},
    "extreme_uv":     {"uv": 11,       "severity": AlertSeverity.DANGER,  "title": "Extreme UV",        "icon": "☀️"},
    "high_uv":        {"uv": 8,        "severity": AlertSeverity.WARNING, "title": "High UV Index",     "icon": "🕶️"},
    "high_humidity":  {"humidity": 85, "severity": AlertSeverity.WARNING, "title": "High Humidity",     "icon": "💧"},
    "storm_risk":     {},  # handled by condition text scan
}


def evaluate_alerts(
    temp_c: float | None = None,
    uv_index: float | None = None,
    humidity_pct: float | None = None,
    conditions: str | None = None,
    wind_kmh: float | None = None,
) -> list[Alert]:
    """Return a list of active alerts for the given weather conditions."""
    alerts: list[Alert] = []

    # ── Temperature alerts ─────────────────────────────────────────────────────
    if temp_c is not None:
        if temp_c >= 38:
            alerts.append(Alert(
                id="extreme_heat", severity=AlertSeverity.DANGER,
                title="Extreme Heat",
                description=f"Current temperature {temp_c:.0f}°C exceeds safe outdoor limits. Avoid prolonged exposure, stay hydrated.",
                icon="🔥",
            ))
        elif temp_c >= 32:
            alerts.append(Alert(
                id="high_heat", severity=AlertSeverity.WARNING,
                title="High Heat Advisory",
                description=f"Temperature is {temp_c:.0f}°C. Limit strenuous outdoor activity and watch for heat exhaustion.",
                icon="🌡️",
            ))
        elif temp_c <= 0:
            alerts.append(Alert(
                id="freeze_risk", severity=AlertSeverity.DANGER,
                title="Freeze Risk",
                description=f"Temperature is {temp_c:.0f}°C. Risk of black ice, pipe damage, and frostbite with prolonged exposure.",
                icon="❄️",
            ))
        elif temp_c <= 4:
            alerts.append(Alert(
                id="cold_warning", severity=AlertSeverity.WARNING,
                title="Cold Warning",
                description=f"Temperature is {temp_c:.0f}°C. Dress in layers and be cautious of icy surfaces.",
                icon="🥶",
            ))

    # ── UV alerts ──────────────────────────────────────────────────────────────
    if uv_index is not None:
        if uv_index >= 11:
            alerts.append(Alert(
                id="extreme_uv", severity=AlertSeverity.DANGER,
                title="Extreme UV Index",
                description=f"UV index is {uv_index:.0f}. Unprotected skin burns in minutes. Avoid outdoor exposure 10am–4pm.",
                icon="☀️",
            ))
        elif uv_index >= 8:
            alerts.append(Alert(
                id="high_uv", severity=AlertSeverity.WARNING,
                title="High UV Index",
                description=f"UV index is {uv_index:.0f}. Apply SPF 30+ sunscreen, wear a hat and UV-blocking sunglasses.",
                icon="🕶️",
            ))

    # ── Humidity alerts ────────────────────────────────────────────────────────
    if humidity_pct is not None and humidity_pct >= 85:
        alerts.append(Alert(
            id="high_humidity", severity=AlertSeverity.WARNING,
            title="High Humidity",
            description=f"Humidity is {humidity_pct:.0f}%. Heat index may feel significantly hotter. Risk of mold growth if sustained.",
            icon="💧",
        ))

    # ── Storm / condition alerts ───────────────────────────────────────────────
    if conditions:
        cond_lower = conditions.lower()
        storm_keywords = ("thunderstorm", "tornado", "hurricane", "blizzard", "hail", "severe")
        warn_keywords  = ("rain", "snow", "fog", "sleet", "freezing", "drizzle")

        if any(k in cond_lower for k in storm_keywords):
            alerts.append(Alert(
                id="storm_risk", severity=AlertSeverity.DANGER,
                title="Severe Weather Alert",
                description=f"Current conditions: {conditions}. Take shelter and monitor local emergency broadcasts.",
                icon="⛈️",
            ))
        elif any(k in cond_lower for k in warn_keywords):
            alerts.append(Alert(
                id="precip_warning", severity=AlertSeverity.WARNING,
                title="Precipitation Warning",
                description=f"Current conditions: {conditions}. Use caution on roads and outdoor surfaces.",
                icon="🌧️",
            ))

    # ── High wind ──────────────────────────────────────────────────────────────
    if wind_kmh is not None and wind_kmh >= 60:
        alerts.append(Alert(
            id="high_wind", severity=AlertSeverity.WARNING,
            title="High Wind Advisory",
            description=f"Wind speed is {wind_kmh:.0f} km/h. Secure outdoor furniture; avoid tall trees.",
            icon="💨",
        ))

    # Sort: DANGER first, then WARNING, then INFO
    order = {AlertSeverity.DANGER: 0, AlertSeverity.WARNING: 1, AlertSeverity.INFO: 2}
    alerts.sort(key=lambda a: order[a.severity])
    return alerts
