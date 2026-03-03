"""Geocoding service — converts a US address string to lat/lon + structured fields.

Primary:  Geocodio API (requires GEOCODIO_API_KEY in settings)
Fallback: Nominatim / OpenStreetMap (free, no key, US-only filter applied client-side)
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import quote as url_quote

import httpx

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "DC",
}

GEOCODIO_URL = "https://api.geocod.io/v1.7/geocode"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{}.json"

REQUEST_TIMEOUT = 10.0  # seconds


@dataclass
class GeocodedLocation:
    formatted_address: str
    lat: float
    lon: float
    city: str
    state: str
    zip: str


class GeocodingError(Exception):
    """Raised when no geocoding provider can resolve the address."""


# ── Cache key ──────────────────────────────────────────────────────────────────

def _address_slug(address: str) -> str:
    """Normalise an address to a stable cache key."""
    nfkd = unicodedata.normalize("NFKD", address.lower())
    cleaned = re.sub(r"[^a-z0-9 ,]", "", nfkd)
    return re.sub(r"\s+", "_", cleaned.strip())


# ── Geocodio provider ──────────────────────────────────────────────────────────

async def _geocode_via_geocodio(address: str) -> GeocodedLocation | None:
    """Call Geocodio API. Returns None if key not set or request fails."""
    if not settings.GEOCODIO_API_KEY:
        return None

    params = {
        "q": address,
        "api_key": settings.GEOCODIO_API_KEY,
        "limit": 1,
        "country": "US",
        "fields": "zip",
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(GEOCODIO_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Geocodio request failed: %s", exc)
        return None

    results = data.get("results", [])
    if not results:
        return None

    best = results[0]
    components = best.get("address_components", {})
    location = best.get("location", {})

    state = components.get("state", "").upper()
    if state not in US_STATES:
        return None  # Non-US result

    return GeocodedLocation(
        formatted_address=best.get("formatted_address", address),
        lat=float(location.get("lat", 0)),
        lon=float(location.get("lng", 0)),
        city=components.get("city", ""),
        state=state,
        zip=components.get("zip", ""),
    )


# ── Nominatim fallback ─────────────────────────────────────────────────────────

async def _geocode_via_nominatim(address: str) -> GeocodedLocation | None:
    """Call Nominatim (OpenStreetMap) as a free fallback."""
    params = {
        "q": address,
        "format": "jsonv2",
        "limit": 5,
        "countrycodes": "us",
        "addressdetails": 1,
    }
    headers = {"User-Agent": "HelioNest-AI/1.0 contact:helionest-app@proton.me"}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(NOMINATIM_URL, params=params, headers=headers)
            resp.raise_for_status()
            results = resp.json()
    except Exception as exc:
        logger.warning("Nominatim request failed: %s", exc)
        return None

    for r in results:
        addr = r.get("address", {})
        state_code = addr.get("ISO3166-2-lvl4", "").replace("US-", "").upper()
        if state_code not in US_STATES:
            # Try state abbreviation from name lookup
            state_name = addr.get("state", "")
            state_code = _state_name_to_abbr(state_name)
            if state_code not in US_STATES:
                continue

        city = (
            addr.get("city")
            or addr.get("town")
            or addr.get("village")
            or addr.get("county", "")
        )
        postcode = addr.get("postcode", "").split("-")[0]  # Take 5-digit zip

        return GeocodedLocation(
            formatted_address=r.get("display_name", address),
            lat=float(r.get("lat", 0)),
            lon=float(r.get("lon", 0)),
            city=city,
            state=state_code,
            zip=postcode,
        )

    return None


# ── Mapbox Geocoding API ───────────────────────────────────────────────────────

async def _geocode_via_mapbox(address: str) -> GeocodedLocation | None:
    """Call Mapbox Geocoding API (v5). Returns None if token not set or request fails."""
    if not settings.MAPBOX_TOKEN:
        return None

    url = MAPBOX_GEOCODING_URL.format(url_quote(address))
    params = {
        "access_token": settings.MAPBOX_TOKEN,
        "country": "us",
        "limit": 1,
        "types": "address",
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Mapbox geocoding request failed: %s", exc)
        return None

    features = data.get("features", [])
    if not features:
        return None

    best = features[0]
    coords = best.get("geometry", {}).get("coordinates", [0, 0])
    lon, lat = float(coords[0]), float(coords[1])

    # Parse context array for postcode / place / region
    zip_code = ""
    city = ""
    state_code = ""
    for ctx in best.get("context", []):
        ctx_id = ctx.get("id", "")
        if ctx_id.startswith("postcode"):
            zip_code = ctx.get("text", "").split("-")[0]
        elif ctx_id.startswith("place"):
            city = ctx.get("text", "")
        elif ctx_id.startswith("region"):
            short_code = ctx.get("short_code", "").replace("US-", "").upper()
            if short_code in US_STATES:
                state_code = short_code

    if not state_code:
        return None  # Non-US or couldn't determine state

    return GeocodedLocation(
        formatted_address=best.get("place_name", address),
        lat=lat,
        lon=lon,
        city=city,
        state=state_code,
        zip=zip_code,
    )


# ── US Census Geocoder (free, no key, US only) ─────────────────────────────────

async def _geocode_via_census(address: str) -> GeocodedLocation | None:
    """Call the free US Census Bureau geocoder — no API key required."""
    params = {
        "address": address,
        "benchmark": "2020",
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(CENSUS_GEOCODER_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Census geocoder request failed: %s", exc)
        return None

    matches = data.get("result", {}).get("addressMatches", [])
    if not matches:
        return None

    best = matches[0]
    coords = best.get("coordinates", {})
    components = best.get("addressComponents", {})

    state = components.get("state", "").upper()
    if state not in US_STATES:
        return None

    city = components.get("city", "") or components.get("unincorporatedPlace", "")
    return GeocodedLocation(
        formatted_address=best.get("matchedAddress", address),
        lat=float(coords.get("y", 0)),
        lon=float(coords.get("x", 0)),
        city=city,
        state=state,
        zip=components.get("zip", ""),
    )


def _state_name_to_abbr(name: str) -> str:
    """Convert full state name to 2-letter abbreviation."""
    mapping = {
        "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
        "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
        "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
        "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
        "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
        "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
        "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
        "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
        "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
        "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
        "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
        "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
        "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
    }
    return mapping.get(name.lower(), "")


# ── Public API ─────────────────────────────────────────────────────────────────

async def geocode_address(address: str) -> GeocodedLocation:
    """Geocode a US address string.

    1. Check Redis cache (TTL: 7 days)
    2. Try Geocodio (if API key is set)
    3. Try Mapbox (if MAPBOX_TOKEN is set) — comprehensive US address coverage
    4. Fall back to US Census Geocoder (free, no key)
    5. Fall back to Nominatim
    6. Raise GeocodingError if nothing works
    """
    slug = _address_slug(address)
    cache_key = make_cache_key("geocode", slug)

    # Cache check
    cached = await cache_get(cache_key)
    if cached:
        logger.debug("Geocode cache hit: %s", slug)
        return GeocodedLocation(**cached)

    # Try providers in order: Geocodio → Mapbox → Census → Nominatim
    result = await _geocode_via_geocodio(address)
    if result is None:
        result = await _geocode_via_mapbox(address)
    if result is None:
        result = await _geocode_via_census(address)
    if result is None:
        result = await _geocode_via_nominatim(address)

    if result is None:
        raise GeocodingError(f"Could not geocode address: {address!r}")

    # Cache successful result
    await cache_set(
        cache_key,
        {
            "formatted_address": result.formatted_address,
            "lat": result.lat,
            "lon": result.lon,
            "city": result.city,
            "state": result.state,
            "zip": result.zip,
        },
        settings.CACHE_TTL_GEOCODE,
    )

    logger.info("Geocoded %r → %s, %s (%.4f, %.4f)", address, result.city, result.state, result.lat, result.lon)
    return result
