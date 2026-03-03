"""Shadow simulation engine.

Computes shadow direction, length multiplier, and property shadow polygon
from solar azimuth + elevation angles. Also provides hourly shadow sweep
data for animated overlays.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional


@dataclass
class ShadowVector:
    """Single-moment shadow information."""
    azimuth_deg: float          # Sun azimuth (degrees, 0=N, 90=E, 180=S, 270=W)
    elevation_deg: float        # Sun elevation above horizon (degrees; negative = below)
    shadow_azimuth_deg: float   # Shadow direction = sun_azimuth + 180° (where shadow falls)
    shadow_length_ratio: float  # Shadow length as multiple of object height (0 = noon, ∞ = horizon)
    is_daytime: bool


@dataclass
class ShadowPolygon:
    """4-corner shadow polygon for a unit square building (1×1m footprint, height=1m).
    Scale all vertices by actual building dimensions.
    """
    # Building corners (relative coordinates, clockwise from NW)
    footprint: list[tuple[float, float]] = field(default_factory=list)
    # Shadow tip corners (relative coordinates)
    shadow_tips: list[tuple[float, float]] = field(default_factory=list)
    shadow_azimuth_deg: float = 0.0
    shadow_length_ratio: float = 0.0


@dataclass
class HourlyShadow:
    """Shadow state at a given hour of day."""
    hour: int
    shadow_azimuth_deg: float
    shadow_length_ratio: float
    elevation_deg: float
    is_daytime: bool


@dataclass
class DailyShadowSweep:
    """Full daily shadow sweep — hourly shadow snapshots."""
    date: date
    lat: float
    lon: float
    hourly: list[HourlyShadow]
    max_shadow_hour: int         # Hour with longest shadow (near sunrise/sunset)
    min_shadow_hour: int         # Hour with shortest shadow (solar noon)
    solar_noon_hour: float       # Decimal hour of solar noon


# ── Math helpers ──────────────────────────────────────────────────────────────

def _shadow_azimuth(sun_azimuth: float) -> float:
    """Shadow falls opposite to sun: azimuth + 180° (mod 360)."""
    return (sun_azimuth + 180.0) % 360.0


def _shadow_length_ratio(elevation_deg: float) -> float:
    """Length multiplier = cot(elevation) = cos/sin.
    Returns 0 for elevation ≤ 0 (night), caps at 50 (near-horizon).
    """
    if elevation_deg <= 0:
        return 0.0
    el_rad = math.radians(elevation_deg)
    return min(50.0, math.cos(el_rad) / math.sin(el_rad))


def compute_shadow_vector(azimuth_deg: float, elevation_deg: float) -> ShadowVector:
    """Compute shadow direction and length from sun position."""
    is_day = elevation_deg > 0
    return ShadowVector(
        azimuth_deg=azimuth_deg,
        elevation_deg=elevation_deg,
        shadow_azimuth_deg=_shadow_azimuth(azimuth_deg),
        shadow_length_ratio=_shadow_length_ratio(elevation_deg) if is_day else 0.0,
        is_daytime=is_day,
    )


def _polar_offset(azimuth_deg: float, distance: float) -> tuple[float, float]:
    """Convert azimuth + distance into (dx, dy) offsets.
    Azimuth: 0=North (+y), 90=East (+x), 180=South (-y), 270=West (-x).
    """
    az_rad = math.radians(azimuth_deg)
    dx = distance * math.sin(az_rad)
    dy = distance * math.cos(az_rad)
    return (dx, dy)


def compute_shadow_polygon(
    azimuth_deg: float,
    elevation_deg: float,
    building_width: float = 1.0,
    building_depth: float = 1.0,
) -> ShadowPolygon:
    """Compute a shadow polygon for a rectangular building footprint.

    The building is centred at (0, 0) with:
      - width = east–west extent (metres)
      - depth = north–south extent (metres)
    Shadow extends in shadow_azimuth direction by (building_height * length_ratio).
    Assumes building height = 1 unit (scale by actual height when rendering).

    Returns footprint corners + shadow-tip corners as relative (dx, dy) tuples
    that can be added to the property lat/lon using a metres-per-degree scale.
    """
    hw = building_width / 2
    hd = building_depth / 2

    # Building corners (NW, NE, SE, SW)
    footprint = [(-hw, hd), (hw, hd), (hw, -hd), (-hw, -hd)]

    shadow_len = _shadow_length_ratio(elevation_deg)
    if elevation_deg <= 0 or shadow_len == 0:
        return ShadowPolygon(
            footprint=footprint,
            shadow_tips=[],
            shadow_azimuth_deg=_shadow_azimuth(azimuth_deg),
            shadow_length_ratio=0.0,
        )

    # Extrude each footprint corner in shadow direction by shadow_len
    s_az = _shadow_azimuth(azimuth_deg)
    tips = []
    for (cx, cy) in footprint:
        dx, dy = _polar_offset(s_az, shadow_len)
        tips.append((cx + dx, cy + dy))

    return ShadowPolygon(
        footprint=footprint,
        shadow_tips=tips,
        shadow_azimuth_deg=s_az,
        shadow_length_ratio=shadow_len,
    )


# ── Hourly sweep ──────────────────────────────────────────────────────────────

def _simple_sun_position(lat: float, doy: int, hour_decimal: float) -> tuple[float, float]:
    """Simplified solar position calculation (azimuth, elevation) in degrees.
    Accurate to ~1° for most mid-latitude locations.
    """
    lat_r = math.radians(lat)
    # Declination
    dec = math.radians(23.45 * math.sin(math.radians((360 / 365) * (doy - 81))))
    # Equation of time correction (minutes)
    b = math.radians((360 / 365) * (doy - 81))
    eot = 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)
    solar_time = hour_decimal + eot / 60
    # Hour angle
    ha = math.radians(15 * (solar_time - 12))
    # Elevation
    sin_el = (math.sin(lat_r) * math.sin(dec)
               + math.cos(lat_r) * math.cos(dec) * math.cos(ha))
    el = math.degrees(math.asin(max(-1.0, min(1.0, sin_el))))
    # Azimuth
    cos_az = ((math.sin(dec) - math.sin(lat_r) * sin_el)
               / (math.cos(lat_r) * math.cos(math.radians(el)) + 1e-9))
    az = math.degrees(math.acos(max(-1.0, min(1.0, cos_az))))
    if ha > 0:
        az = 360 - az
    return az, el


def get_daily_shadow_sweep(lat: float, lon: float, target_date: Optional[date] = None) -> DailyShadowSweep:
    """Compute hourly shadow vectors for a full day (0h–23h).

    Args:
        lat: Latitude in degrees.
        lon: Longitude (used for display only; time correction applied via EoT).
        target_date: Date for the sweep (defaults to today).

    Returns:
        DailyShadowSweep with hourly shadow vectors and metadata.
    """
    if target_date is None:
        from datetime import date as date_cls
        target_date = date_cls.today()

    # Day of year
    start_of_year = date(target_date.year, 1, 1)
    doy = (target_date - start_of_year).days + 1

    hourly: list[HourlyShadow] = []
    daytime_hours: list[tuple[int, float]] = []  # (hour, length_ratio)
    solar_noon_el = -90.0
    solar_noon_hour = 12.0

    for h in range(24):
        az, el = _simple_sun_position(lat, doy, h + 0.5)  # mid-hour
        sh_az = _shadow_azimuth(az)
        sh_len = _shadow_length_ratio(el) if el > 0 else 0.0
        is_day = el > 0

        hourly.append(HourlyShadow(
            hour=h,
            shadow_azimuth_deg=sh_az,
            shadow_length_ratio=sh_len,
            elevation_deg=el,
            is_daytime=is_day,
        ))

        if is_day:
            daytime_hours.append((h, sh_len))
        if el > solar_noon_el:
            solar_noon_el = el
            solar_noon_hour = h + 0.5

    if daytime_hours:
        max_shadow_hour = max(daytime_hours, key=lambda x: x[1])[0]
        min_shadow_hour = min(daytime_hours, key=lambda x: x[1])[0]
    else:
        max_shadow_hour = 6
        min_shadow_hour = 12

    return DailyShadowSweep(
        date=target_date,
        lat=lat,
        lon=lon,
        hourly=hourly,
        max_shadow_hour=max_shadow_hour,
        min_shadow_hour=min_shadow_hour,
        solar_noon_hour=solar_noon_hour,
    )
