# Import all models here so Alembic autogenerate can detect them
from app.models.location import Location
from app.models.property_analysis import PropertyAnalysis
from app.models.saved_property import SavedProperty
from app.models.solar_snapshot import SolarSnapshot
from app.models.user import User
from app.models.weather_snapshot import WeatherSnapshot

__all__ = [
    "Location",
    "PropertyAnalysis",
    "SavedProperty",
    "SolarSnapshot",
    "User",
    "WeatherSnapshot",
]
