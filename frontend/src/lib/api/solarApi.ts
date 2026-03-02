import { apiClient } from "@/lib/apiClient";
import type { SolarDayData, SolarSeasonalData } from "@/types/solar";

export async function getSolarDaily(lat: number, lon: number, date: string): Promise<SolarDayData> {
  const { data } = await apiClient.get<SolarDayData>("/api/v1/solar/daily", {
    params: { lat, lon, date },
  });
  return data;
}

export async function getSolarSeasonal(lat: number, lon: number): Promise<SolarSeasonalData> {
  const { data } = await apiClient.get<SolarSeasonalData>("/api/v1/solar/seasonal", {
    params: { lat, lon },
  });
  return data;
}
