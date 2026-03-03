"""Multi-Agent Orchestrator — routes questions to the appropriate specialist agent.

Routing strategy: keyword + semantic matching to select the best agent.
Falls back to a general Claude response if no specialist matches.
"""

from __future__ import annotations

import re

from app.ai.client import call_claude
from app.ai.retriever import retrieve_context
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Intent routing keywords ───────────────────────────────────────────────────

_SOLAR_KEYWORDS = re.compile(
    r"\b(sun|solar|sunrise|sunset|uv|irradiance|photovoltaic|pv|panel|"
    r"daylight|shadow|azimuth|elevation|solstice|equinox|peak hour)\b",
    re.IGNORECASE,
)

_WEATHER_KEYWORDS = re.compile(
    r"\b(weather|temperature|humidity|rain|snow|wind|storm|forecast|"
    r"heat index|wind chill|comfort|climate|cloud|fog|precipitation|cold|hot)\b",
    re.IGNORECASE,
)

_IMPACT_KEYWORDS = re.compile(
    r"\b(facade|wall|car|vehicle|parking|heat gain|energy cost|cooling|heating|"
    r"outdoor|comfort score|south facing|north facing|east|west|insulation|thermostat)\b",
    re.IGNORECASE,
)

_PREDICTION_KEYWORDS = re.compile(
    r"\b(future|predict|trend|climate change|risk|flood|wildfire|drought|"
    r"long.?term|years|decade|global warming|extreme|resilience)\b",
    re.IGNORECASE,
)

_CLIMATE_KEYWORDS = re.compile(
    r"\b(historical|history|10.?year|decade|warming|cooling|trend|"
    r"climate risk|climate forecast|past data|temperature rise|precipitation change|"
    r"extreme event|heatwave|drought|flood risk|storm surge)\b",
    re.IGNORECASE,
)


def _detect_intent(question: str) -> str:
    """Return the best agent to handle this question."""
    scores = {
        "solar": len(_SOLAR_KEYWORDS.findall(question)),
        "weather": len(_WEATHER_KEYWORDS.findall(question)),
        "impact": len(_IMPACT_KEYWORDS.findall(question)),
        "prediction": len(_PREDICTION_KEYWORDS.findall(question)),
        "climate": len(_CLIMATE_KEYWORDS.findall(question)),
    }
    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    return best if scores[best] > 0 else "general"


# ── General fallback ──────────────────────────────────────────────────────────

_GENERAL_SYSTEM = """You are HelioNest AI — a property climate intelligence assistant.
Answer questions about solar conditions, weather, moon phases, property heat impact,
and environmental factors for specific U.S. addresses.

Be helpful, concise (under 200 words), and personalize answers using the property data provided."""


async def _general_respond(question: str, property_data: dict) -> str:
    context = await retrieve_context(question)
    location = property_data.get("location", {})

    user_prompt = f"""Property: {location.get('formatted_address', 'Unknown')}

{"Relevant Context:" + chr(10) + context if context else ""}

Question: {question}"""

    return await call_claude(system=_GENERAL_SYSTEM, user=user_prompt, max_tokens=400)


# ── Main orchestrator ─────────────────────────────────────────────────────────

async def orchestrate(
    question: str,
    property_data: dict,
    conversation_history: list[dict] | None = None,
) -> dict:
    """Route the question to the best specialist agent and return the response.

    Args:
        question: The user's question string.
        property_data: Dict with keys: location, solar, weather, impact.
        conversation_history: List of {role, content} dicts for context.

    Returns:
        Dict with: answer, agent_used, intent.
    """
    intent = _detect_intent(question)
    logger.debug("Orchestrator routing '%s' → agent: %s", question[:60], intent)

    try:
        if intent == "solar":
            from app.ai.agents.solar_agent import solar_agent_respond
            answer = await solar_agent_respond(question, property_data)
        elif intent == "weather":
            from app.ai.agents.weather_agent import weather_agent_respond
            answer = await weather_agent_respond(question, property_data)
        elif intent == "impact":
            from app.ai.agents.impact_agent import impact_agent_respond
            answer = await impact_agent_respond(question, property_data)
        elif intent == "prediction":
            from app.ai.agents.prediction_agent import prediction_agent_respond
            answer = await prediction_agent_respond(question, property_data)
        elif intent == "climate":
            from app.ai.agents.climate_agent import climate_agent_respond
            answer = await climate_agent_respond(question, property_data)
        else:
            answer = await _general_respond(question, property_data)

    except Exception as exc:
        logger.error("Agent error (%s): %s", intent, exc)
        answer = "I'm having trouble processing your question right now. Please try again."

    return {
        "answer": answer,
        "agent_used": intent,
        "intent": intent,
    }


async def get_suggested_questions(property_data: dict) -> list[str]:
    """Generate 4-6 dynamic suggested questions based on the property's data."""
    location = property_data.get("location", {})
    weather = property_data.get("weather", {})
    impact = property_data.get("impact", {})

    suggestions = [
        f"What are the best months to spend time outdoors at this property?",
        f"How does the {impact.get('hottest_facade', 'south')} facade affect my energy bills?",
        "Is it safe to leave my car parked outside in summer here?",
        f"What's the UV risk level for this location in peak summer?",
    ]

    # Add context-specific suggestions
    risk_flags = weather.get("risk_flags", [])
    if risk_flags:
        suggestions.append(f"What do I need to know about the current {risk_flags[0].lower()} alert?")

    if location.get("state"):
        suggestions.append(f"How does {location['state']}'s climate compare to the national average?")

    return suggestions[:6]
