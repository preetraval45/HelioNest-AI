export type ComfortLevel = "great" | "good" | "moderate" | "uncomfortable" | "dangerous";

export interface CurrentWeather {
  temp_c: number;
  feels_like_c: number;
  humidity: number;
  uv_index: number;
  wind_speed_kmh: number;
  precipitation_mm: number;
  conditions: string;
  comfort_level: ComfortLevel;
  comfort_score: number; // 0-100
}

export interface ForecastDay {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  uv_index_max: number;
  precipitation_mm: number;
  conditions: string;
  comfort_level: ComfortLevel;
}

export interface MonthlyAverage {
  month: number;
  avg_temp_c: number;
  avg_max_temp_c: number;
  avg_min_temp_c: number;
  avg_humidity: number;
  avg_uv_index: number;
  avg_precipitation_mm: number;
  comfort_score: number;
}
