"""Unit tests for solar_engine.py"""

import pytest
from datetime import date, datetime, timezone

from app.engines.solar_engine import (
    get_sun_position,
    get_daily_sun_path,
    get_sunrise_sunset,
)


# Charlotte, NC coordinates
LAT, LON = 35.2271, -80.8431


class TestGetSunPosition:
    def test_returns_sun_position(self):
        dt = datetime(2025, 6, 21, 12, 0, tzinfo=timezone.utc)  # Summer solstice noon UTC
        pos = get_sun_position(LAT, LON, dt)

        assert -90 <= pos.elevation_deg <= 90
        assert 0 <= pos.azimuth_deg < 360
        assert isinstance(pos.is_daytime, bool)

    def test_daytime_at_solar_noon(self):
        dt = datetime(2025, 6, 21, 16, 0, tzinfo=timezone.utc)  # ~noon in Eastern time
        pos = get_sun_position(LAT, LON, dt)
        assert pos.is_daytime is True
        assert pos.elevation_deg > 0

    def test_nighttime_at_midnight(self):
        dt = datetime(2025, 6, 21, 5, 0, tzinfo=timezone.utc)  # midnight Eastern
        pos = get_sun_position(LAT, LON, dt)
        assert pos.is_daytime is False
        assert pos.elevation_deg < 0

    def test_naive_datetime_treated_as_utc(self):
        dt_naive = datetime(2025, 6, 21, 16, 0)
        dt_aware = datetime(2025, 6, 21, 16, 0, tzinfo=timezone.utc)
        pos_naive = get_sun_position(LAT, LON, dt_naive)
        pos_aware = get_sun_position(LAT, LON, dt_aware)
        assert abs(pos_naive.elevation_deg - pos_aware.elevation_deg) < 0.01


class TestGetDailySunPath:
    def test_returns_96_points_at_15min_interval(self):
        path = get_daily_sun_path(LAT, LON, date(2025, 6, 21))
        assert len(path) == 96  # 24h / 15min

    def test_all_points_have_valid_range(self):
        path = get_daily_sun_path(LAT, LON, date(2025, 6, 21))
        for p in path:
            assert -90 <= p.elevation_deg <= 90
            assert 0 <= p.azimuth_deg < 360

    def test_some_daytime_points_in_summer(self):
        path = get_daily_sun_path(LAT, LON, date(2025, 6, 21))
        daytime = [p for p in path if p.is_daytime]
        assert len(daytime) > 40  # More than 10 hours of daylight


class TestGetSunriseSunset:
    def test_summer_solstice_long_day(self):
        ss = get_sunrise_sunset(LAT, LON, date(2025, 6, 21))
        assert ss.day_length_hours > 14.0  # Charlotte has ~14.5h on summer solstice

    def test_winter_solstice_short_day(self):
        ss = get_sunrise_sunset(LAT, LON, date(2025, 12, 21))
        assert ss.day_length_hours < 10.0  # Charlotte has ~9.5h on winter solstice

    def test_sunrise_before_sunset(self):
        ss = get_sunrise_sunset(LAT, LON, date(2025, 6, 21))
        assert ss.sunrise < ss.sunset

    def test_solar_noon_between_sunrise_sunset(self):
        ss = get_sunrise_sunset(LAT, LON, date(2025, 6, 21))
        assert ss.sunrise < ss.solar_noon < ss.sunset

    def test_max_elevation_positive_in_summer(self):
        ss = get_sunrise_sunset(LAT, LON, date(2025, 6, 21))
        assert ss.max_elevation_deg > 70  # Charlotte in summer: ~76°

    def test_max_elevation_lower_in_winter(self):
        ss_summer = get_sunrise_sunset(LAT, LON, date(2025, 6, 21))
        ss_winter = get_sunrise_sunset(LAT, LON, date(2025, 12, 21))
        assert ss_summer.max_elevation_deg > ss_winter.max_elevation_deg
