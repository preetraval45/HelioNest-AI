"""Geocoding service — converts a US address string to lat/lon + structured fields.

Provider cascade (all free options tried before giving up):
  1. Geocodio      — requires GEOCODIO_API_KEY, very comprehensive US coverage
  2. Mapbox        — requires MAPBOX_TOKEN, comprehensive coverage
  3. Census        — free, no key, Public_AR_Current benchmark (most up-to-date)
  4. Photon        — free, no key, komoot OSM-powered, good building coverage
  5. Nominatim     — free, no key, OpenStreetMap
  6. ZIP centroid  — free, no key, last resort: resolves the ZIP code area so
                     brand-new addresses still get approximate coordinates
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

GEOCODIO_URL         = "https://api.geocod.io/v1.7/geocode"
NOMINATIM_URL        = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
CENSUS_GEOCODER_URL  = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{}.json"
PHOTON_URL           = "https://photon.komoot.io/api/"
ZIPPOPOTAM_URL       = "https://api.zippopotam.us/us/{}"

REQUEST_TIMEOUT = 12.0  # seconds
USER_AGENT = "HelioNest-AI/1.0 contact:helionest-app@proton.me"

# US state name patterns for detecting incomplete addresses
_US_INDICATORS = frozenset({"usa", "united states", "u.s.a", "u.s.", "america"})


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


def _extract_zip(address: str) -> str | None:
    """Extract 5-digit ZIP code from an address string."""
    m = re.search(r"\b(\d{5})(?:-\d{4})?\b", address)
    return m.group(1) if m else None


def _has_us_indicator(address: str) -> bool:
    """Return True if the address already contains an explicit US indicator."""
    lower = address.lower()
    return any(ind in lower for ind in _US_INDICATORS)


def _has_city_or_state(address: str) -> bool:
    """Heuristic: True if the address has at least 2 commas or a 2-letter US state abbreviation."""
    if address.count(",") >= 1:
        return True
    # Look for a 2-letter US state abbr preceded by a space or comma
    for state in US_STATES:
        if re.search(r"[\s,]" + state + r"[\s,\d]", address, re.IGNORECASE):
            return True
    return False


def _strip_house_number(address: str) -> str:
    """Remove leading house number from a street address, e.g. '1003 Tundra Swan Dr' -> 'Tundra Swan Dr'."""
    return re.sub(r"^\s*\d+[-\w]?\s+", "", address).strip()


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
        return None

    return GeocodedLocation(
        formatted_address=best.get("formatted_address", address),
        lat=float(location.get("lat", 0)),
        lon=float(location.get("lng", 0)),
        city=components.get("city", ""),
        state=state,
        zip=components.get("zip", ""),
    )


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
        return None

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
    """Call the free US Census Bureau geocoder using the current benchmark."""
    params = {
        "address": address,
        "benchmark": "Public_AR_Current",  # most up-to-date TIGER data
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


# ── Photon (komoot) — free, no key, OSM-powered ────────────────────────────────

async def _geocode_via_photon(address: str) -> GeocodedLocation | None:
    """Call Photon geocoder (photon.komoot.io) — free, no API key, OSM data."""
    params = {
        "q": address,
        "limit": 5,
        "lang": "en",
        # Bounding box roughly covering the contiguous US + AK/HI
        "bbox": "-180,18,-60,72",
    }
    headers = {"User-Agent": USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(PHOTON_URL, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Photon geocoding request failed: %s", exc)
        return None

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        country_code = props.get("country_code", "").lower()
        if country_code != "us":
            continue

        state_name = props.get("state", "")
        state_code = _state_name_to_abbr(state_name)
        if state_code not in US_STATES:
            continue

        coords = feature.get("geometry", {}).get("coordinates", [0, 0])
        lon, lat = float(coords[0]), float(coords[1])

        city = props.get("city") or props.get("town") or props.get("village") or props.get("county", "")
        zip_code = props.get("postcode", "").split("-")[0]

        # Build a formatted address from available parts
        parts = []
        if props.get("housenumber"):
            parts.append(f"{props['housenumber']} {props.get('street', '')}")
        elif props.get("street"):
            parts.append(props["street"])
        if city:
            parts.append(city)
        parts.append(f"{state_code} {zip_code}".strip())

        return GeocodedLocation(
            formatted_address=", ".join(p for p in parts if p),
            lat=lat,
            lon=lon,
            city=city,
            state=state_code,
            zip=zip_code,
        )

    return None


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
    headers = {"User-Agent": USER_AGENT}

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
        postcode = addr.get("postcode", "").split("-")[0]

        return GeocodedLocation(
            formatted_address=r.get("display_name", address),
            lat=float(r.get("lat", 0)),
            lon=float(r.get("lon", 0)),
            city=city,
            state=state_code,
            zip=postcode,
        )

    return None


# ── ZIP centroid fallback (last resort) ────────────────────────────────────────

async def _geocode_via_zip_centroid(address: str) -> GeocodedLocation | None:
    """Last-resort fallback: parse the ZIP code and resolve its centroid.

    Used for brand-new construction addresses that are not yet in any geocoding
    database. Returns the ZIP code area centre (accurate to within ~5 miles).
    """
    zip_code = _extract_zip(address)
    if not zip_code:
        return None

    url = ZIPPOPOTAM_URL.format(zip_code)
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("ZIP centroid lookup failed for %s: %s", zip_code, exc)
        return None

    places = data.get("places", [])
    if not places:
        return None

    place = places[0]
    state_abbr = place.get("state abbreviation", "").upper()
    if state_abbr not in US_STATES:
        return None

    city = place.get("place name", "")
    lat  = float(place.get("latitude",  0))
    lon  = float(place.get("longitude", 0))

    # Preserve the user's original street address so the DB record is useful,
    # but append "(area)" to indicate approximate coordinates.
    formatted = f"{address.split(',')[0].strip()}, {city}, {state_abbr} {zip_code} (area)"

    logger.info("ZIP centroid fallback used for %r → %s, %s", address, city, state_abbr)
    return GeocodedLocation(
        formatted_address=formatted,
        lat=lat,
        lon=lon,
        city=city,
        state=state_abbr,
        zip=zip_code,
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


# ── Reverse geocoding (lat/lon → address) ─────────────────────────────────────

async def reverse_geocode(lat: float, lon: float) -> GeocodedLocation:
    """Convert GPS coordinates to a US street address via Nominatim reverse geocode.

    Cached by rounded coordinates (4 decimal places ≈ 11 m accuracy).
    Raises GeocodingError if the location is outside the US or cannot be resolved.
    """
    cache_key = make_cache_key("revgeo", f"{lat:.4f}_{lon:.4f}")
    cached = await cache_get(cache_key)
    if cached:
        logger.debug("Reverse geocode cache hit: %.4f, %.4f", lat, lon)
        return GeocodedLocation(**cached)

    params = {
        "lat": lat,
        "lon": lon,
        "format": "jsonv2",
        "addressdetails": 1,
        "zoom": 18,  # house-level detail
    }
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.get(NOMINATIM_REVERSE_URL, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Nominatim reverse geocode failed: %s", exc)
        raise GeocodingError(f"Could not reverse geocode ({lat:.5f}, {lon:.5f})")

    if "error" in data:
        raise GeocodingError(f"Location ({lat:.5f}, {lon:.5f}) is not recognized")

    addr = data.get("address", {})

    # Determine US state
    state_code = addr.get("ISO3166-2-lvl4", "").replace("US-", "").upper()
    if state_code not in US_STATES:
        state_code = _state_name_to_abbr(addr.get("state", ""))
    if state_code not in US_STATES:
        raise GeocodingError(
            f"Location ({lat:.5f}, {lon:.5f}) is outside the US"
        )

    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("suburb")
        or addr.get("county", "")
    )
    postcode = addr.get("postcode", "").split("-")[0]

    # Build clean street address
    house_number = addr.get("house_number", "")
    road = addr.get("road", "")
    street_part = f"{house_number} {road}".strip() if house_number else road

    if street_part:
        formatted = f"{street_part}, {city}, {state_code} {postcode}".strip(", ")
    else:
        formatted = f"{city}, {state_code} {postcode}".strip(", ")

    result = GeocodedLocation(
        formatted_address=formatted,
        lat=float(data.get("lat", lat)),
        lon=float(data.get("lon", lon)),
        city=city,
        state=state_code,
        zip=postcode,
    )

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
    logger.info(
        "Reverse geocoded (%.4f, %.4f) → %s", lat, lon, result.formatted_address
    )
    return result


async def _geocode_augmented_fallbacks(address: str) -> GeocodedLocation | None:
    """Try variations of a partial address that failed all standard providers."""
    # Strategy 1: append ", USA" to anchor providers to the US
    if not _has_us_indicator(address):
        augmented = address.rstrip(", ") + ", USA"
        logger.debug("Trying augmented address: %r", augmented)
        result = await _geocode_via_photon(augmented) or await _geocode_via_nominatim(augmented)
        if result:
            return result

    # Strategy 2: strip leading house number → street-level centroid
    stripped = _strip_house_number(address)
    if stripped and stripped != address:
        logger.debug("Trying street-only address: %r", stripped)
        result = await _geocode_via_photon(stripped) or await _geocode_via_nominatim(stripped)
        if result:
            return result

    return None


# ── Public API ─────────────────────────────────────────────────────────────────

async def geocode_address(address: str) -> GeocodedLocation:
    """Geocode a US address string.

    Provider cascade (no API keys required for steps 3–6):
      1. Geocodio          — requires GEOCODIO_API_KEY
      2. Mapbox            — requires MAPBOX_TOKEN
      3. Census (current)  — free, no key, TIGER/Current data
      4. Photon (komoot)   — free, no key, OSM data
      5. Nominatim         — free, no key, OSM data
      6. ZIP centroid      — free, no key, always resolves if ZIP is present
    """
    slug = _address_slug(address)
    cache_key = make_cache_key("geocode", slug)

    # Cache check
    cached = await cache_get(cache_key)
    if cached:
        logger.debug("Geocode cache hit: %s", slug)
        return GeocodedLocation(**cached)

    result = (
        await _geocode_via_geocodio(address)
        or await _geocode_via_mapbox(address)
        or await _geocode_via_census(address)
        or await _geocode_via_photon(address)
        or await _geocode_via_nominatim(address)
        or await _geocode_augmented_fallbacks(address)
        or await _geocode_via_zip_centroid(address)
    )

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

    logger.info(
        "Geocoded %r → %s, %s (%.4f, %.4f)",
        address, result.city, result.state, result.lat, result.lon,
    )
    return result
