from datetime import datetime

from pydantic import BaseModel


class CurrentWeatherOut(BaseModel):
    temp_c: float
    feels_like_c: float
    humidity_pct: float
    wind_speed_kmh: float
    precipitation_mm: float
    uv_index: float
    conditions: str
    heat_index_c: float | None = None
    wind_chill_c: float | None = None
    comfort_score: float        # 0-100
    comfort_level: str          # great / good / moderate / uncomfortable / dangerous

    model_config = {"from_attributes": True}


class ForecastDayOut(BaseModel):
    date: str
    temp_max_c: float
    temp_min_c: float
    uv_index_max: float
    precipitation_mm: float
    conditions: str
    comfort_level: str


class MonthlyAverageOut(BaseModel):
    month: int
    avg_temp_c: float
    avg_max_temp_c: float
    avg_min_temp_c: float
    avg_humidity_pct: float
    avg_uv_index: float
    avg_precipitation_mm: float
    comfort_score: float
