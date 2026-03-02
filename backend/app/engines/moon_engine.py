"""Moon Intelligence Engine — lunar phases, rise/set times, position, and night visibility.

Uses the ephem library for astronomically accurate lunar calculations.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timezone

import ephem


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class MoonPhase:
    """Current lunar phase information."""
    phase_angle: float       # 0-360°, 0=new, 180=full
    illumination_pct: float  # 0-100 % of visible disk illuminated
    phase_name: str          # New / Waxing Crescent / First Quarter / etc.
    emoji: str               # Visual shorthand


@dataclass
class MoonPosition:
    """Moon position in the sky at a given moment."""
    timestamp: datetime
    azimuth_deg: float       # 0=N, 90=E, 180=S, 270=W
    elevation_deg: float     # Degrees above horizon (negative = below)
    distance_km: float       # Earth-Moon distance


@dataclass
class MoonRiseSet:
    """Moon rise and set times for a given date."""
    moonrise: datetime | None
    moonset: datetime | None
    is_up_all_day: bool
    is_down_all_day: bool


@dataclass
class NightVisibility:
    """Night-sky quality score based on moon phase and elevation."""
    score: int           # 0 (bright full moon) – 100 (dark new moon)
    level: str           # "Excellent" / "Good" / "Fair" / "Poor"
    moon_impact: str     # Plain-English reason


@dataclass
class DailyMoonData:
    """Comprehensive moon data for one day."""
    date: date
    phase: MoonPhase
    position_now: MoonPosition
    rise_set: MoonRiseSet
    night_visibility: NightVisibility


# ── Phase classification ───────────────────────────────────────────────────────

def _classify_phase(illumination: float, phase_angle: float) -> tuple[str, str]:
    """Return (phase_name, emoji) from illumination % and phase angle (degrees)."""
    waxing = phase_angle < 180

    if illumination < 2:
        return "New Moon", "🌑"
    if illumination < 20:
        return "Waxing Crescent" if waxing else "Waning Crescent", "🌒" if waxing else "🌘"
    if illumination < 45:
        return "First Quarter" if waxing else "Last Quarter", "🌓" if waxing else "🌗"
    if illumination < 70:
        return "Waxing Gibbous" if waxing else "Waning Gibbous", "🌔" if waxing else "🌖"
    if illumination < 98:
        return "Waxing Gibbous" if waxing else "Waning Gibbous", "🌔" if waxing else "🌖"
    return "Full Moon", "🌕"


# ── Core calculations ──────────────────────────────────────────────────────────

def get_moon_phase(dt: datetime | None = None) -> MoonPhase:
    """Return moon phase data at the given UTC datetime (defaults to now)."""
    if dt is None:
        dt = datetime.now(timezone.utc)

    moon = ephem.Moon()
    moon.compute(dt.strftime("%Y/%m/%d %H:%M:%S"), epoch=ephem.J2000)

    phase_angle = float(moon.phase)          # 0-100 in ephem (% illumination)
    illumination = phase_angle               # ephem.Moon.phase is already % illumination
    # Compute true phase angle (0–360) from sun-moon elongation
    sun = ephem.Sun()
    sun.compute(dt.strftime("%Y/%m/%d %H:%M:%S"), epoch=ephem.J2000)

    # Elongation gives the angular separation; sign determines waxing/waning
    elong_deg = math.degrees(float(moon.elong))
    phase_360 = elong_deg % 360             # 0=new, 180=full, 360=back to new

    phase_name, emoji = _classify_phase(illumination, phase_360)

    return MoonPhase(
        phase_angle=round(phase_360, 1),
        illumination_pct=round(illumination, 1),
        phase_name=phase_name,
        emoji=emoji,
    )


def get_moon_position(lat: float, lon: float, dt: datetime | None = None) -> MoonPosition:
    """Return moon azimuth, elevation, and distance for the given location/time."""
    if dt is None:
        dt = datetime.now(timezone.utc)

    observer = ephem.Observer()
    observer.lat = str(lat)
    observer.lon = str(lon)
    observer.date = dt.strftime("%Y/%m/%d %H:%M:%S")
    observer.pressure = 0    # disable atmospheric refraction for consistency

    moon = ephem.Moon()
    moon.compute(observer)

    azimuth = math.degrees(float(moon.az))
    elevation = math.degrees(float(moon.alt))
    distance_km = float(moon.earth_distance) * 149_597_870.7  # AU → km

    return MoonPosition(
        timestamp=dt,
        azimuth_deg=round(azimuth, 2),
        elevation_deg=round(elevation, 2),
        distance_km=round(distance_km),
    )


def get_moonrise_moonset(lat: float, lon: float, target_date: date) -> MoonRiseSet:
    """Return moonrise and moonset times (UTC) for the given date and location."""
    observer = ephem.Observer()
    observer.lat = str(lat)
    observer.lon = str(lon)
    observer.pressure = 0
    observer.horizon = "0"

    # Set observer to midnight UTC of the target date
    observer.date = f"{target_date.strftime('%Y/%m/%d')} 00:00:00"

    moon = ephem.Moon()

    moonrise: datetime | None = None
    moonset: datetime | None = None
    is_up_all_day = False
    is_down_all_day = False

    try:
        rise_time = observer.next_rising(moon)
        # Check if rise_time is within the same calendar date
        rise_dt = ephem.localtime(rise_time) if False else rise_time.datetime()
        rise_dt = rise_dt.replace(tzinfo=timezone.utc)
        if rise_dt.date() == target_date:
            moonrise = rise_dt
    except ephem.AlwaysUpError:
        is_up_all_day = True
    except ephem.NeverUpError:
        is_down_all_day = True
    except Exception:
        pass

    try:
        set_time = observer.next_setting(moon)
        set_dt = set_time.datetime().replace(tzinfo=timezone.utc)
        if set_dt.date() == target_date:
            moonset = set_dt
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        pass
    except Exception:
        pass

    return MoonRiseSet(
        moonrise=moonrise,
        moonset=moonset,
        is_up_all_day=is_up_all_day,
        is_down_all_day=is_down_all_day,
    )


def get_night_visibility(phase: MoonPhase, lat: float, lon: float) -> NightVisibility:
    """Score night-sky visibility (0=bright/poor, 100=dark/excellent)."""
    # Base score from illumination — more illumination = brighter sky = lower score
    score = round(100 - phase.illumination_pct)

    # Classify
    if score >= 80:
        level = "Excellent"
        moon_impact = "Dark skies — ideal for stargazing and astrophotography."
    elif score >= 60:
        level = "Good"
        moon_impact = "Mostly dark skies with minimal moon interference."
    elif score >= 40:
        level = "Fair"
        moon_impact = "Partial moon glow will reduce visibility of faint stars."
    else:
        level = "Poor"
        moon_impact = f"{phase.phase_name} ({round(phase.illumination_pct)}% lit) — moon significantly brightens the sky."

    return NightVisibility(
        score=max(0, min(100, score)),
        level=level,
        moon_impact=moon_impact,
    )


def get_daily_moon_data(lat: float, lon: float, target_date: date | None = None) -> DailyMoonData:
    """Return comprehensive moon data for a given date and location."""
    if target_date is None:
        target_date = datetime.now(timezone.utc).date()

    # Use noon UTC of the target date as reference moment
    noon_utc = datetime(target_date.year, target_date.month, target_date.day, 12, 0, 0, tzinfo=timezone.utc)

    phase = get_moon_phase(noon_utc)
    position = get_moon_position(lat, lon, noon_utc)
    rise_set = get_moonrise_moonset(lat, lon, target_date)
    visibility = get_night_visibility(phase, lat, lon)

    return DailyMoonData(
        date=target_date,
        phase=phase,
        position_now=position,
        rise_set=rise_set,
        night_visibility=visibility,
    )
