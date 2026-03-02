from pydantic import BaseModel, Field


class GeocodeRequest(BaseModel):
    address: str = Field(..., min_length=5, max_length=500, description="Full US address to geocode")


class LocationOut(BaseModel):
    id: int
    address: str
    formatted_address: str
    lat: float
    lon: float
    city: str
    state: str
    zip: str

    model_config = {"from_attributes": True}
