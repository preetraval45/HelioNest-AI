"""Address / Geocoding endpoint — POST /api/v1/address/geocode"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import get_logger
from app.models.location import Location
from app.schemas.location import GeocodeRequest, LocationOut
from app.services.geocoding import GeocodingError, geocode_address

router = APIRouter()
logger = get_logger(__name__)


@router.post("/geocode", response_model=LocationOut)
async def geocode(
    body: GeocodeRequest,
    db: AsyncSession = Depends(get_db),
) -> LocationOut:
    """Geocode a U.S. address and persist it to the database.

    - Validates that the address resolves to a U.S. location.
    - Returns existing DB record if the same address was already geocoded.
    - Caches geocoding result in Redis (7 days) to avoid redundant API calls.
    """
    address = body.address.strip()

    # ── Geocode ────────────────────────────────────────────────────────────────
    try:
        geo = await geocode_address(address)
    except GeocodingError:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "geocoding_failed",
                "message": (
                    f"Could not resolve address: {address!r}. "
                    "Please provide a full U.S. address including city and state."
                ),
            },
        )

    # ── Dedup: check if this formatted address already exists in DB ────────────
    existing_stmt = select(Location).where(
        Location.formatted_address == geo.formatted_address
    )
    result = await db.execute(existing_stmt)
    existing = result.scalar_one_or_none()
    if existing:
        logger.debug("Returning existing location id=%d", existing.id)
        return LocationOut.model_validate(existing)

    # ── Persist new location ───────────────────────────────────────────────────
    geom_point = from_shape(Point(geo.lon, geo.lat), srid=4326)

    location = Location(
        address=address,
        formatted_address=geo.formatted_address,
        lat=geo.lat,
        lon=geo.lon,
        city=geo.city,
        state=geo.state,
        zip=geo.zip,
        geom=geom_point,
    )
    db.add(location)
    await db.commit()
    await db.refresh(location)

    logger.info("Saved new location id=%d: %s", location.id, geo.formatted_address)
    return LocationOut.model_validate(location)
