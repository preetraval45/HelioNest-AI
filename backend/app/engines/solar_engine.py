"""Solar data engine — sun position, sun path, sunrise/sunset, and seasonal summaries.

Uses pvlib for precise astronomical calculations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import pandas as pd
import pvlib
from pvlib.location import Location as PVLocation

from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Data classes ───────────────────────────────────────────────────────────────


@dataclass
class SunPosition:
    timestamp: datetime
    azimuth_deg: float       # 0=N, 90=E, 180=S, 270=W
    elevation_deg: float     # degrees above horizon (negative = below)
    is_daytime: bool


@dataclass
class SunriseSet:
    date: date
    sunrise: datetime        # timezone-aware UTC
    solar_noon: datetime     # timezone-aware UTC
    sunset: datetime         # timezone-aware UTC
    day_length_hours: float
    max_elevation_deg: float
    solar_noon_azimuth_deg: float


@dataclass
class MonthlySolarSummary:
    month: int               # 1-12
    avg_day_length_hours: float
    avg_max_elevation_deg: float
    avg_sunrise_hour: float  # local decimal hour e.g. 6.5 = 6:30 AM
    avg_sunset_hour: float
    solstice_type: str | None  # "summer" | "winter" | None


@dataclass
class SeasonalSolarSummary:
    lat: float
    lon: float
    monthly: list[MonthlySolarSummary]
    summer_solstice: SunriseSet
    winter_solstice: SunriseSet
    spring_equinox: SunriseSet
    autumn_equinox: SunriseSet


# ── Helpers ────────────────────────────────────────────────────────────────────


def _pv_location(lat: float, lon: float) -> PVLocation:
    """Create a pvlib Location with no timezone (UTC calculations)."""
    return PVLocation(latitude=lat, longitude=lon, altitude=0)


def _utc_times(start: datetime, end: datetime, freq_minutes: int = 15) -> pd.DatetimeIndex:
    """Generate a UTC DatetimeIndex at the given interval."""
    return pd.date_range(start=start, end=end, freq=f"{freq_minutes}min", tz="UTC")


# ── Public functions ───────────────────────────────────────────────────────────


def get_sun_position(lat: float, lon: float, dt: datetime) -> SunPosition:
    """Return azimuth + elevation for a single instant.

    Args:
        lat: Latitude in decimal degrees.
        lon: Longitude in decimal degrees.
        dt: Datetime (naive = treated as UTC; aware = converted to UTC).
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    loc = _pv_location(lat, lon)
    times = pd.DatetimeIndex([dt])
    solar = loc.get_solarposition(times)

    azimuth = float(solar["azimuth"].iloc[0])
    elevation = float(solar["elevation"].iloc[0])

    return SunPosition(
        timestamp=dt,
        azimuth_deg=round(azimuth, 2),
        elevation_deg=round(elevation, 2),
        is_daytime=elevation > 0,
    )


def get_daily_sun_path(
    lat: float,
    lon: float,
    target_date: date,
    interval_minutes: int = 15,
) -> list[SunPosition]:
    """Return list of sun positions throughout the day (every `interval_minutes`).

    Args:
        lat: Latitude in decimal degrees.
        lon: Longitude in decimal degrees.
        target_date: The date to compute for.
        interval_minutes: Time step (default 15 min → 96 points/day).
    """
    start = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=1) - timedelta(minutes=interval_minutes)

    loc = _pv_location(lat, lon)
    times = _utc_times(start, end, interval_minutes)
    solar = loc.get_solarposition(times)

    points: list[SunPosition] = []
    for ts, row in solar.iterrows():
        points.append(
            SunPosition(
                timestamp=ts.to_pydatetime(),
                azimuth_deg=round(float(row["azimuth"]), 2),
                elevation_deg=round(float(row["elevation"]), 2),
                is_daytime=float(row["elevation"]) > 0,
            )
        )
    return points


def get_sunrise_sunset(lat: float, lon: float, target_date: date) -> SunriseSet:
    """Compute sunrise, solar noon, sunset, and day length for a given date.

    Uses pvlib's spa_python algorithm (highly accurate).
    """
    start = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=1, minutes=-1)

    loc = _pv_location(lat, lon)
    times = _utc_times(start, end, freq_minutes=1)
    solar = loc.get_solarposition(times)

    # Sunrise: first moment elevation crosses 0 from below
    elevations = solar["elevation"].values
    sunrise_dt = start
    solar_noon_dt = start
    sunset_dt = end

    above = elevations > 0
    if above.any():
        sunrise_idx = int(above.argmax())
        sunrise_dt = times[sunrise_idx].to_pydatetime()

        # Solar noon = maximum elevation
        noon_idx = int(solar["elevation"].argmax())
        solar_noon_dt = times[noon_idx].to_pydatetime()

        # Sunset: last moment elevation is above 0
        for i in range(len(above) - 1, -1, -1):
            if above[i]:
                sunset_dt = times[i].to_pydatetime()
                break

    day_length = (sunset_dt - sunrise_dt).total_seconds() / 3600
    max_elev = float(solar["elevation"].max())
    noon_azimuth = float(solar["azimuth"].loc[solar["elevation"].idxmax()])

    return SunriseSet(
        date=target_date,
        sunrise=sunrise_dt,
        solar_noon=solar_noon_dt,
        sunset=sunset_dt,
        day_length_hours=round(max(day_length, 0), 2),
        max_elevation_deg=round(max_elev, 2),
        solar_noon_azimuth_deg=round(noon_azimuth, 2),
    )


def get_seasonal_summary(lat: float, lon: float, year: int | None = None) -> SeasonalSolarSummary:
    """Compute monthly solar summaries + solstice/equinox data.

    Args:
        lat: Latitude in decimal degrees.
        lon: Longitude in decimal degrees.
        year: Year to compute for (defaults to current year).
    """
    from datetime import date as _date
    import datetime as _dt

    if year is None:
        year = _dt.date.today().year

    monthly: list[MonthlySolarSummary] = []

    for month in range(1, 13):
        # Sample the 1st, 10th, 20th to approximate monthly averages
        sample_days = [_date(year, month, 1), _date(year, month, 10), _date(year, month, 20)]
        day_lengths, max_elevs, sunrise_hours, sunset_hours = [], [], [], []

        for d in sample_days:
            ss = get_sunrise_sunset(lat, lon, d)
            day_lengths.append(ss.day_length_hours)
            max_elevs.append(ss.max_elevation_deg)
            sunrise_hours.append(ss.sunrise.hour + ss.sunrise.minute / 60)
            sunset_hours.append(ss.sunset.hour + ss.sunset.minute / 60)

        solstice_type = None
        if month == 6:
            solstice_type = "summer" if lat >= 0 else "winter"
        elif month == 12:
            solstice_type = "winter" if lat >= 0 else "summer"

        monthly.append(
            MonthlySolarSummary(
                month=month,
                avg_day_length_hours=round(sum(day_lengths) / len(day_lengths), 2),
                avg_max_elevation_deg=round(sum(max_elevs) / len(max_elevs), 2),
                avg_sunrise_hour=round(sum(sunrise_hours) / len(sunrise_hours), 2),
                avg_sunset_hour=round(sum(sunset_hours) / len(sunset_hours), 2),
                solstice_type=solstice_type,
            )
        )

    # Solstice / equinox dates (approximate)
    summer_sol = get_sunrise_sunset(lat, lon, _date(year, 6, 21))
    winter_sol = get_sunrise_sunset(lat, lon, _date(year, 12, 21))
    spring_eq = get_sunrise_sunset(lat, lon, _date(year, 3, 20))
    autumn_eq = get_sunrise_sunset(lat, lon, _date(year, 9, 22))

    logger.info("Computed seasonal summary for (%.4f, %.4f) year=%d", lat, lon, year)

    return SeasonalSolarSummary(
        lat=lat,
        lon=lon,
        monthly=monthly,
        summer_solstice=summer_sol,
        winter_solstice=winter_sol,
        spring_equinox=spring_eq,
        autumn_equinox=autumn_eq,
    )
