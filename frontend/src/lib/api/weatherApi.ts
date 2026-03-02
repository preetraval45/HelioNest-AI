import { apiClient } from "@/lib/apiClient";
import type { CurrentWeather, ForecastDay, MonthlyAverage } from "@/types/weather";

export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const { data } = await apiClient.get<CurrentWeather>("/api/v1/weather/current", {
    params: { lat, lon },
  });
  return data;
}

export async function getWeatherForecast(lat: number, lon: number, days = 7): Promise<ForecastDay[]> {
  const { data } = await apiClient.get<ForecastDay[]>("/api/v1/weather/forecast", {
    params: { lat, lon, days },
  });
  return data;
}

export async function getMonthlyAverages(lat: number, lon: number): Promise<MonthlyAverage[]> {
  const { data } = await apiClient.get<MonthlyAverage[]>("/api/v1/weather/monthly-averages", {
    params: { lat, lon },
  });
  return data;
}
