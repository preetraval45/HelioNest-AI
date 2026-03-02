"""Unit tests for weather engine and comfort calculations."""

import pytest

from app.services.weather_service import (
    calc_comfort_score,
    calc_heat_index,
    calc_wind_chill,
)
from app.engines.weather_engine import enrich_weather, score_monthly_comfort


# ── calc_heat_index ────────────────────────────────────────────────────────────

class TestCalcHeatIndex:
    def test_returns_temp_when_below_threshold(self):
        # Below 27°C — returns raw temp
        assert calc_heat_index(25.0, 80.0) == 25.0

    def test_returns_temp_when_low_humidity(self):
        # High temp but low humidity — returns raw temp
        assert calc_heat_index(35.0, 30.0) == 35.0

    def test_high_heat_and_humidity(self):
        # 35°C + 80% humidity should produce a higher apparent temp
        hi = calc_heat_index(35.0, 80.0)
        assert hi > 35.0

    def test_extreme_heat(self):
        # 40°C + 90% should be well above 40
        hi = calc_heat_index(40.0, 90.0)
        assert hi > 45.0


# ── calc_wind_chill ────────────────────────────────────────────────────────────

class TestCalcWindChill:
    def test_returns_temp_when_warm(self):
        # Above 10°C — returns raw temp
        assert calc_wind_chill(15.0, 30.0) == 15.0

    def test_returns_temp_when_calm(self):
        # Wind below 4.8 km/h — returns raw temp
        assert calc_wind_chill(0.0, 3.0) == 0.0

    def test_cold_wind_feels_colder(self):
        wc = calc_wind_chill(-10.0, 30.0)
        assert wc < -10.0

    def test_stronger_wind_feels_colder(self):
        wc_light = calc_wind_chill(-5.0, 10.0)
        wc_strong = calc_wind_chill(-5.0, 50.0)
        assert wc_strong < wc_light


# ── calc_comfort_score ────────────────────────────────────────────────────────

class TestCalcComfortScore:
    def test_ideal_conditions_score_high(self):
        # 22°C, 50% humidity, 10 km/h wind, UV 3 — near perfect
        score, level = calc_comfort_score(22.0, 50.0, 10.0, 3.0)
        assert score >= 80
        assert level in ("Excellent", "Good")

    def test_freezing_temp_scores_low(self):
        score, _ = calc_comfort_score(-15.0, 60.0, 5.0, 1.0)
        assert score <= 60

    def test_scorching_temp_scores_low(self):
        score, _ = calc_comfort_score(42.0, 30.0, 5.0, 3.0)
        assert score <= 60

    def test_high_uv_penalizes_score(self):
        score_low_uv, _ = calc_comfort_score(22.0, 50.0, 10.0, 2.0)
        score_high_uv, _ = calc_comfort_score(22.0, 50.0, 10.0, 11.0)
        assert score_high_uv < score_low_uv

    def test_score_in_valid_range(self):
        score, _ = calc_comfort_score(50.0, 100.0, 100.0, 15.0)
        assert 0 <= score <= 100

    def test_level_strings_are_valid(self):
        valid_levels = {"Excellent", "Good", "Fair", "Poor", "Very Poor"}
        for temp in [-20, 0, 22, 35, 45]:
            _, level = calc_comfort_score(float(temp), 50.0, 15.0, 3.0)
            assert level in valid_levels


# ── enrich_weather ─────────────────────────────────────────────────────────────

class TestEnrichWeather:
    def _make_weather(self, temp_c=22.0, feels_like_c=22.0, humidity=50.0,
                      wind_kmh=15.0, uv=3.0, precip=0.0,
                      heat_index_c=22.0, wind_chill_c=22.0,
                      comfort_score=85.0, comfort_level="Good",
                      conditions="Clear sky", weather_code=0):
        from datetime import datetime, timezone
        from app.services.weather_service import CurrentWeather
        return CurrentWeather(
            timestamp=datetime.now(timezone.utc),
            temp_c=temp_c,
            feels_like_c=feels_like_c,
            humidity_pct=humidity,
            wind_speed_kmh=wind_kmh,
            precipitation_mm=precip,
            uv_index=uv,
            conditions=conditions,
            weather_code=weather_code,
            heat_index_c=heat_index_c,
            wind_chill_c=wind_chill_c,
            comfort_score=comfort_score,
            comfort_level=comfort_level,
        )

    def test_no_flags_for_mild_weather(self):
        weather = self._make_weather()
        enriched = enrich_weather(weather)
        assert enriched.risk_flags == []

    def test_heat_danger_flag(self):
        weather = self._make_weather(heat_index_c=36.0)
        enriched = enrich_weather(weather)
        assert "Heat Danger" in enriched.risk_flags

    def test_extreme_heat_flag(self):
        weather = self._make_weather(heat_index_c=42.0)
        enriched = enrich_weather(weather)
        assert "Extreme Heat Danger" in enriched.risk_flags

    def test_wind_chill_warning_flag(self):
        weather = self._make_weather(wind_chill_c=-22.0)
        enriched = enrich_weather(weather)
        assert "Wind Chill Warning" in enriched.risk_flags

    def test_high_uv_flag(self):
        weather = self._make_weather(uv=8.5)
        enriched = enrich_weather(weather)
        assert "Very High UV" in enriched.risk_flags

    def test_extreme_uv_flag(self):
        weather = self._make_weather(uv=11.5)
        enriched = enrich_weather(weather)
        assert "Extreme UV" in enriched.risk_flags

    def test_wind_advisory_flag(self):
        weather = self._make_weather(wind_kmh=45.0)
        enriched = enrich_weather(weather)
        assert "Wind Advisory" in enriched.risk_flags

    def test_heavy_precipitation_flag(self):
        weather = self._make_weather(precip=12.0)
        enriched = enrich_weather(weather)
        assert "Heavy Precipitation" in enriched.risk_flags

    def test_delta_calculation(self):
        weather = self._make_weather(temp_c=20.0, feels_like_c=25.0)
        enriched = enrich_weather(weather)
        assert enriched.apparent_vs_actual_delta == pytest.approx(5.0, abs=0.1)

    def test_comfort_summary_is_string(self):
        weather = self._make_weather()
        enriched = enrich_weather(weather)
        assert isinstance(enriched.comfort_summary, str)
        assert len(enriched.comfort_summary) > 10


# ── score_monthly_comfort ──────────────────────────────────────────────────────

class TestScoreMonthlyComfort:
    def _make_monthly(self):
        from app.services.weather_service import MonthlyAverage
        return [
            MonthlyAverage(month=m, avg_temp_max_c=20.0 + m, avg_temp_min_c=10.0 + m,
                           avg_precipitation_mm=50.0, avg_uv_index=4.0)
            for m in range(1, 13)
        ]

    def test_returns_12_entries(self):
        averages = self._make_monthly()
        results = score_monthly_comfort(averages)
        assert len(results) == 12

    def test_each_entry_has_required_keys(self):
        averages = self._make_monthly()
        results = score_monthly_comfort(averages)
        for entry in results:
            assert "month" in entry
            assert "comfort_score" in entry
            assert "comfort_level" in entry
            assert "avg_temp_c" in entry

    def test_scores_in_valid_range(self):
        averages = self._make_monthly()
        results = score_monthly_comfort(averages)
        for entry in results:
            assert 0 <= entry["comfort_score"] <= 100
