export type RiskLevel = "low" | "moderate" | "high" | "very_high" | "extreme";
export type Facade = "north" | "south" | "east" | "west";

export interface FacadeHeatScore {
  facade: Facade;
  heat_gain_score: number; // 0-100
  worst_month: number;
  best_month: number;
}

export interface CarHeatRisk {
  hour: number;
  outdoor_temp_c: number;
  estimated_interior_temp_c: number;
  risk_level: RiskLevel;
}

export interface PropertyAnalysis {
  location_id: string;
  facade_scores: FacadeHeatScore[];
  worst_car_heat_hour: CarHeatRisk;
  outdoor_comfort_score: number;
  solar_panel_score: number; // 0-100 potential
  annual_heat_risk: RiskLevel;
  monthly_comfort: { month: number; score: number }[];
}
