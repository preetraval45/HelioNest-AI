"""Unit tests for AI agent routing and orchestrator (Task 2.4 / 2.10)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.ai.orchestrator import get_suggested_questions, orchestrate


_PROPERTY_DATA = {
    "address": "123 Main St, Charlotte, NC",
    "solar": {"peak_sun_hours": 5.2, "annual_ac_kwh": 9800},
    "weather": {"temp_c": 25, "uv_index": 7, "comfort_score": 72},
    "monthly_comfort": [70, 65, 68, 75, 72, 60, 55, 56, 65, 72, 70, 68],
}


class TestOrchestratorRouting:
    @pytest.mark.asyncio
    async def test_solar_question_routes_to_solar_agent(self):
        with patch("app.ai.orchestrator.solar_agent_respond", new_callable=AsyncMock) as mock_solar:
            mock_solar.return_value = "Solar answer"
            result = await orchestrate("How much solar energy does this property get?", _PROPERTY_DATA, [])
        assert result["agent_used"] == "solar"
        assert result["intent"] == "solar"
        mock_solar.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_weather_question_routes_to_weather_agent(self):
        with patch("app.ai.orchestrator.weather_agent_respond", new_callable=AsyncMock) as mock_weather:
            mock_weather.return_value = "Weather answer"
            result = await orchestrate("What is the temperature like in summer?", _PROPERTY_DATA, [])
        assert result["agent_used"] == "weather"

    @pytest.mark.asyncio
    async def test_impact_question_routes_to_impact_agent(self):
        with patch("app.ai.orchestrator.impact_agent_respond", new_callable=AsyncMock) as mock_impact:
            mock_impact.return_value = "Impact answer"
            result = await orchestrate("How hot does a car get in the parking lot?", _PROPERTY_DATA, [])
        assert result["agent_used"] == "impact"

    @pytest.mark.asyncio
    async def test_result_has_required_keys(self):
        with patch("app.ai.orchestrator.solar_agent_respond", new_callable=AsyncMock) as mock_solar:
            mock_solar.return_value = "Answer text"
            result = await orchestrate("What is the UV index?", _PROPERTY_DATA, [])
        assert "answer" in result
        assert "agent_used" in result
        assert "intent" in result


class TestSuggestedQuestions:
    @pytest.mark.asyncio
    async def test_returns_list(self):
        questions = await get_suggested_questions(_PROPERTY_DATA)
        assert isinstance(questions, list)

    @pytest.mark.asyncio
    async def test_returns_at_least_4_questions(self):
        questions = await get_suggested_questions(_PROPERTY_DATA)
        assert len(questions) >= 4

    @pytest.mark.asyncio
    async def test_all_questions_are_strings(self):
        questions = await get_suggested_questions(_PROPERTY_DATA)
        assert all(isinstance(q, str) for q in questions)

    @pytest.mark.asyncio
    async def test_empty_property_data_still_returns_questions(self):
        questions = await get_suggested_questions({})
        assert len(questions) >= 1
