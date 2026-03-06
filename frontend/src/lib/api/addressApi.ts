import { apiClient } from "@/lib/apiClient";
import type { Location } from "@/types/location";

export async function geocodeAddress(address: string): Promise<Location> {
  const { data } = await apiClient.post<Location>("/api/v1/address/geocode", { address });
  return data;
}

export async function reverseGeocode(lat: number, lon: number): Promise<Location> {
  const { data } = await apiClient.get<Location>(
    `/api/v1/address/reverse-geocode?lat=${lat}&lon=${lon}`
  );
  return data;
}
