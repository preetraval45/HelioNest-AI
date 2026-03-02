from datetime import datetime

from pydantic import BaseModel


class SunPositionOut(BaseModel):
    time: str           # ISO 8601
    azimuth: float      # degrees clockwise from north
    elevation: float    # degrees above horizon
    is_daytime: bool


class SolarDayOut(BaseModel):
    date: str
    sunrise: str
    solar_noon: str
    sunset: str
    day_length_hours: float
    max_elevation_deg: float
    hourly_path: list[SunPositionOut]


class SolarMonthOut(BaseModel):
    month: int
    avg_irradiance_kwh: float
    avg_peak_sun_hours: float
    avg_day_length_hours: float


class SolarSeasonalOut(BaseModel):
    lat: float
    lon: float
    monthly: list[SolarMonthOut]
    summer_solstice: SolarDayOut
    winter_solstice: SolarDayOut
