"""Unit tests for geocoding service."""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.geocoding import (
    GeocodingError,
    GeocodedLocation,
    _address_slug,
    _state_name_to_abbr,
    geocode_address,
)


class TestAddressSlug:
    def test_lowercases_and_replaces_spaces(self):
        assert _address_slug("123 Main St") == "123_main_st"

    def test_removes_special_chars(self):
        assert _address_slug("Suite #200, Floor 3!") == "suite_200_floor_3"

    def test_normalizes_unicode(self):
        slug = _address_slug("Café Street")
        assert "cafe" in slug or "caf" in slug


class TestStateNameToAbbr:
    def test_known_states(self):
        assert _state_name_to_abbr("North Carolina") == "NC"
        assert _state_name_to_abbr("california") == "CA"
        assert _state_name_to_abbr("TEXAS") == "TX"

    def test_unknown_returns_empty(self):
        assert _state_name_to_abbr("NotAState") == ""


class TestGeocodeAddress:
    @pytest.mark.asyncio
    async def test_returns_cached_result(self):
        cached = {
            "formatted_address": "123 Main St, Charlotte, NC 28201",
            "lat": 35.2271,
            "lon": -80.8431,
            "city": "Charlotte",
            "state": "NC",
            "zip": "28201",
        }
        with patch("app.services.geocoding.cache_get", new_callable=AsyncMock, return_value=cached):
            result = await geocode_address("123 Main St, Charlotte, NC")

        assert result.city == "Charlotte"
        assert result.state == "NC"
        assert result.lat == 35.2271

    @pytest.mark.asyncio
    async def test_raises_geocoding_error_when_all_providers_fail(self):
        with (
            patch("app.services.geocoding.cache_get", new_callable=AsyncMock, return_value=None),
            patch("app.services.geocoding._geocode_via_geocodio", new_callable=AsyncMock, return_value=None),
            patch("app.services.geocoding._geocode_via_nominatim", new_callable=AsyncMock, return_value=None),
            patch("app.services.geocoding.cache_set", new_callable=AsyncMock),
        ):
            with pytest.raises(GeocodingError):
                await geocode_address("completely invalid address xyz 999")

    @pytest.mark.asyncio
    async def test_uses_nominatim_when_geocodio_fails(self):
        nominatim_result = GeocodedLocation(
            formatted_address="1 Apple Park Way, Cupertino, CA 95014",
            lat=37.3349,
            lon=-122.0090,
            city="Cupertino",
            state="CA",
            zip="95014",
        )
        with (
            patch("app.services.geocoding.cache_get", new_callable=AsyncMock, return_value=None),
            patch("app.services.geocoding._geocode_via_geocodio", new_callable=AsyncMock, return_value=None),
            patch("app.services.geocoding._geocode_via_nominatim", new_callable=AsyncMock, return_value=nominatim_result),
            patch("app.services.geocoding.cache_set", new_callable=AsyncMock),
        ):
            result = await geocode_address("Apple Park, Cupertino CA")

        assert result.city == "Cupertino"
        assert result.state == "CA"
