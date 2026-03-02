from pydantic import BaseModel


class FacadeHeatScoreOut(BaseModel):
    facade: str         # north / south / east / west
    heat_gain_score: float  # 0-100
    worst_month: int
    best_month: int


class CarHeatRiskOut(BaseModel):
    hour: int
    outdoor_temp_c: float
    estimated_interior_temp_c: float
    risk_level: str     # low / moderate / high / very_high / extreme


class PropertyAnalysisOut(BaseModel):
    location_id: int
    facade_scores: list[FacadeHeatScoreOut]
    worst_car_heat: CarHeatRiskOut
    outdoor_comfort_score: float
    solar_panel_score: float
    annual_heat_risk_level: str
    monthly_comfort: list[dict]     # [{ month: int, score: float }]

    model_config = {"from_attributes": True}
