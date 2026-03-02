import { create } from "zustand";

type ActiveTab = "overview" | "solar" | "weather" | "moon" | "impact" | "ai" | "3d" | "360";

interface UIStore {
  sidebarOpen: boolean;
  activeTab: ActiveTab;
  mapCenter: [number, number]; // [lng, lat]
  mapZoom: number;
  viewMode: "2d" | "3d" | "360";

  setSidebarOpen: (open: boolean) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setMapCenter: (center: [number, number]) => void;
  setMapZoom: (zoom: number) => void;
  setViewMode: (mode: "2d" | "3d" | "360") => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: false,
  activeTab: "overview",
  mapCenter: [-98.5795, 39.8283], // geographic center of USA
  mapZoom: 4,
  viewMode: "2d",

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setMapCenter: (center) => set({ mapCenter: center }),
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
