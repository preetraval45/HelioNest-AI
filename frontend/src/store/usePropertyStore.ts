import { create } from "zustand";
import type { Location } from "@/types/location";
import type { PropertyAnalysis } from "@/types/property";

interface PropertyStore {
  currentLocation: Location | null;
  analysisData: PropertyAnalysis | null;
  isLoading: boolean;
  error: string | null;

  setLocation: (location: Location) => void;
  setAnalysis: (data: PropertyAnalysis) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const usePropertyStore = create<PropertyStore>((set) => ({
  currentLocation: null,
  analysisData: null,
  isLoading: false,
  error: null,

  setLocation: (location) => set({ currentLocation: location }),
  setAnalysis: (data) => set({ analysisData: data }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set({ currentLocation: null, analysisData: null, isLoading: false, error: null }),
}));
