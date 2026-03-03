"""Nearby OSM building footprints via Overpass API — for shadow analysis overlays."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.cache import cache_get, cache_set, make_cache_key
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)

_OVERPASS_URL = "https://overpass-api.de/api/interpreter"


# ── Response models ─────────────────────────────────────────────────────────────

class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: list[Any]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]


# ── Helpers ──────────────────────────────────────────────────────────────────────

def _estimate_height(tags: dict[str, str]) -> float:
    """Estimate building height from OSM tags (metres)."""
    if "height" in tags:
        try:
            return float(tags["height"].replace("m", "").strip())
        except ValueError:
            pass
    if "building:levels" in tags:
        try:
            return float(tags["building:levels"]) * 3.0
        except ValueError:
            pass
    return 9.0  # default 3-storey assumption


def _overpass_to_geojson(data: dict[str, Any]) -> GeoJSONFeatureCollection:
    """Convert Overpass API JSON → GeoJSON FeatureCollection."""
    elements: list[dict[str, Any]] = data.get("elements", [])

    # Build node lookup: id → [lon, lat]
    nodes: dict[int, list[float]] = {}
    for el in elements:
        if el.get("type") == "node":
            nodes[el["id"]] = [el["lon"], el["lat"]]

    features: list[GeoJSONFeature] = []
    for el in elements:
        if el.get("type") != "way":
            continue
        node_ids: list[int] = el.get("nodes", [])
        coords = [nodes[nid] for nid in node_ids if nid in nodes]
        if len(coords) < 3:
            continue
        # Ensure ring is closed
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        tags: dict[str, str] = el.get("tags", {})
        features.append(GeoJSONFeature(
            geometry=GeoJSONGeometry(type="Polygon", coordinates=[coords]),
            properties={
                "osm_id": el["id"],
                "building": tags.get("building", "yes"),
                "height": _estimate_height(tags),
                "name": tags.get("name", ""),
            },
        ))

    return GeoJSONFeatureCollection(features=features)


# ── Endpoint ─────────────────────────────────────────────────────────────────────

@router.get("/neighbors", response_model=GeoJSONFeatureCollection)
async def get_neighbor_buildings(
    lat: float = Query(..., description="Latitude (decimal degrees)"),
    lon: float = Query(..., description="Longitude (decimal degrees)"),
    radius: int = Query(150, ge=50, le=500, description="Search radius in metres"),
) -> GeoJSONFeatureCollection:
    """Return nearby OSM building footprints as GeoJSON for shadow simulation overlays."""
    cache_key = make_cache_key("neighbors", lat=lat, lon=lon, radius=radius)
    cached = await cache_get(cache_key)
    if cached:
        return GeoJSONFeatureCollection(**cached)

    overpass_query = (
        f"[out:json][timeout:10];"
        f'(way["building"](around:{radius},{lat},{lon}););'
        f"out body;>;out skel qt;"
    )

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(_OVERPASS_URL, data={"data": overpass_query})
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
    except httpx.TimeoutException as exc:
        logger.warning("Overpass API timeout for lat=%s lon=%s", lat, lon)
        raise HTTPException(status_code=504, detail="Overpass API timed out") from exc
    except httpx.HTTPStatusError as exc:
        logger.warning("Overpass API HTTP error: %s", exc.response.status_code)
        raise HTTPException(status_code=502, detail="Overpass API returned an error") from exc
    except Exception as exc:
        logger.exception("Unexpected Overpass API error")
        raise HTTPException(status_code=502, detail=f"Overpass API error: {exc}") from exc

    result = _overpass_to_geojson(data)

    # Cache for 24 h — OSM building data changes rarely
    await cache_set(cache_key, result.model_dump(), ttl=86400)
    return result
