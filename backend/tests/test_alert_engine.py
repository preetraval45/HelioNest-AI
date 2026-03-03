"""Unit tests for the Alert Engine (Task 2.9)."""

import pytest
from app.engines.alert_engine import AlertSeverity, evaluate_alerts


class TestAlertEngine:
    # ── Temperature ───────────────────────────────────────────────────────────

    def test_extreme_heat_triggers_danger(self):
        alerts = evaluate_alerts(temp_c=40)
        ids = [a.id for a in alerts]
        assert "extreme_heat" in ids
        danger = next(a for a in alerts if a.id == "extreme_heat")
        assert danger.severity == AlertSeverity.DANGER

    def test_high_heat_triggers_warning(self):
        alerts = evaluate_alerts(temp_c=33)
        ids = [a.id for a in alerts]
        assert "high_heat" in ids
        assert "extreme_heat" not in ids

    def test_freeze_triggers_danger(self):
        alerts = evaluate_alerts(temp_c=-5)
        assert any(a.id == "freeze_risk" for a in alerts)

    def test_cold_warning(self):
        alerts = evaluate_alerts(temp_c=2)
        assert any(a.id == "cold_warning" for a in alerts)

    def test_comfortable_temp_no_alerts(self):
        alerts = evaluate_alerts(temp_c=21)
        assert len(alerts) == 0

    # ── UV ────────────────────────────────────────────────────────────────────

    def test_extreme_uv_danger(self):
        alerts = evaluate_alerts(uv_index=12)
        assert any(a.id == "extreme_uv" and a.severity == AlertSeverity.DANGER for a in alerts)

    def test_high_uv_warning(self):
        alerts = evaluate_alerts(uv_index=9)
        assert any(a.id == "high_uv" and a.severity == AlertSeverity.WARNING for a in alerts)

    def test_low_uv_no_alert(self):
        alerts = evaluate_alerts(uv_index=2)
        assert len(alerts) == 0

    # ── Humidity ──────────────────────────────────────────────────────────────

    def test_high_humidity_warning(self):
        alerts = evaluate_alerts(humidity_pct=90)
        assert any(a.id == "high_humidity" for a in alerts)

    def test_normal_humidity_no_alert(self):
        alerts = evaluate_alerts(humidity_pct=55)
        assert len(alerts) == 0

    # ── Conditions text ───────────────────────────────────────────────────────

    def test_thunderstorm_danger(self):
        alerts = evaluate_alerts(conditions="Thunderstorm with heavy rain")
        assert any(a.id == "storm_risk" and a.severity == AlertSeverity.DANGER for a in alerts)

    def test_rain_warning(self):
        alerts = evaluate_alerts(conditions="Light rain")
        assert any(a.id == "precip_warning" for a in alerts)

    # ── Ordering ──────────────────────────────────────────────────────────────

    def test_danger_alerts_sort_first(self):
        alerts = evaluate_alerts(temp_c=40, uv_index=9, humidity_pct=88)
        assert alerts[0].severity == AlertSeverity.DANGER

    # ── Multiple alerts ───────────────────────────────────────────────────────

    def test_multiple_conditions_stack(self):
        alerts = evaluate_alerts(temp_c=39, uv_index=11, humidity_pct=90)
        assert len(alerts) >= 3
