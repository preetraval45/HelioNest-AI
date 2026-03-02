import { apiClient } from "@/lib/apiClient";
import type { Location } from "@/types/location";

export async function geocodeAddress(address: string): Promise<Location> {
  const { data } = await apiClient.post<Location>("/api/v1/address/geocode", { address });
  return data;
}
