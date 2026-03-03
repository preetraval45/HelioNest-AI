"""Unit tests for the Property Heat Impact Engine (Task 2.2)."""

import pytest
from app.engines.impact_engine import (
    estimate_car_interior_temp,
    get_facade_heat_scores,
    get_monthly_outdoor_comfort,
)


# ── Car heat model ─────────────────────────────────────────────────────────────

class TestCarHeatModel:
    def test_safe_conditions(self):
        result = estimate_car_interior_temp(outdoor_temp_c=20, irradiance_w_m2=200, hours_parked=0.5)
        assert result.interior_temp_c < 30
        assert result.risk_level == "Safe"

    def test_hot_sunny_day(self):
        result = estimate_car_interior_temp(outdoor_temp_c=35, irradiance_w_m2=900, hours_parked=2)
        assert result.interior_temp_c > 50
        assert result.risk_level in ("Dangerous", "Deadly", "Hot")

    def test_deadly_threshold(self):
        result = estimate_car_interior_temp(outdoor_temp_c=40, irradiance_w_m2=1000, hours_parked=4)
        # Interior should reach extreme levels
        assert result.interior_temp_c > 60 or result.risk_level in ("Dangerous", "Deadly")

    def test_zero_irradiance_no_extra_heat(self):
        result = estimate_car_interior_temp(outdoor_temp_c=25, irradiance_w_m2=0, hours_parked=1)
        # No irradiance → interior close to outdoor temp
        assert result.interior_temp_c < result.outdoor_temp_c + 10

    def test_result_fields(self):
        result = estimate_car_interior_temp(outdoor_temp_c=30, irradiance_w_m2=600, hours_parked=1)
        assert hasattr(result, "interior_temp_c")
        assert hasattr(result, "outdoor_temp_c")
        assert hasattr(result, "risk_level")
        assert hasattr(result, "temp_rise_c")
        assert result.temp_rise_c >= 0


# ── Facade heat scores ─────────────────────────────────────────────────────────

class TestFacadeHeatScores:
    def test_returns_48_entries(self):
        scores = get_facade_heat_scores(lat=35.2)
        assert len(scores) == 48  # 4 directions × 12 months

    def test_all_directions_present(self):
        scores = get_facade_heat_scores(lat=35.2)
        directions = {s.direction for s in scores}
        assert directions == {"N", "S", "E", "W"}

    def test_south_warmer_than_north_in_winter(self):
        scores = get_facade_heat_scores(lat=40.0)
        # January (month 1)
        jan_s = next(s for s in scores if s.direction == "S" and s.month == 1)
        jan_n = next(s for s in scores if s.direction == "N" and s.month == 1)
        assert jan_s.heat_score >= jan_n.heat_score

    def test_scores_in_valid_range(self):
        scores = get_facade_heat_scores(lat=30.0)
        for s in scores:
            assert 0 <= s.heat_score <= 100


# ── Monthly outdoor comfort ────────────────────────────────────────────────────

class TestMonthlyOutdoorComfort:
    _TEMPS = [2, 4, 10, 16, 22, 28, 32, 31, 26, 18, 10, 4]  # Charlotte-like

    def test_returns_12_months(self):
        result = get_monthly_outdoor_comfort(self._TEMPS)
        assert len(result) == 12

    def test_summer_lower_comfort_extreme_heat(self):
        result = get_monthly_outdoor_comfort(self._TEMPS)
        july = result[6]   # index 6 = July
        april = result[3]  # index 3 = April
        assert april.comfort_score >= july.comfort_score

    def test_comfort_scores_in_range(self):
        result = get_monthly_outdoor_comfort(self._TEMPS)
        for m in result:
            assert 0 <= m.comfort_score <= 100
