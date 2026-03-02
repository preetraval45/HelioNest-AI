export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Location extends Coordinates {
  id?: string;
  formatted_address: string;
  city: string;
  state: string;
  zip: string;
}
