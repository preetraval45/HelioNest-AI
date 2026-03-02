export interface SunPosition {
  time: string; // ISO datetime
  azimuth: number; // degrees from north, clockwise
  elevation: number; // degrees above horizon
  is_daytime: boolean;
}

export interface SolarDayData {
  date: string;
  sunrise: string;
  solar_noon: string;
  sunset: string;
  day_length_hours: number;
  hourly_path: SunPosition[];
}

export interface SolarMonthData {
  month: number;
  avg_irradiance_kwh: number;
  avg_peak_sun_hours: number;
  avg_day_length_hours: number;
}

export interface SolarSeasonalData {
  location: { lat: number; lon: number };
  monthly: SolarMonthData[];
  summer_solstice: SolarDayData;
  winter_solstice: SolarDayData;
}
