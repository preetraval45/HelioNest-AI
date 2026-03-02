"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { geocodeAddress } from "@/lib/api/addressApi";
import type { Location } from "@/types/location";

type Tab = "overview" | "solar" | "weather" | "moon" | "impact" | "ai" | "2d" | "3d" | "360";

const TABS: { id: Tab; label: string; icon: string; badge?: string }[] = [
  { id: "overview", label: "Overview",    icon: "🏠" },
  { id: "solar",    label: "Solar",       icon: "☀️",  badge: "solar" },
  { id: "weather",  label: "Weather",     icon: "🌡️", badge: "weather" },
  { id: "moon",     label: "Moon",        icon: "🌙",  badge: "moon" },
  { id: "impact",   label: "Impact",      icon: "📊" },
  { id: "ai",       label: "AI Chat",     icon: "🤖",  badge: "moon" },
  { id: "2d",       label: "2D Map",      icon: "🗺️" },
  { id: "3d",       label: "3D View",     icon: "🏗️" },
  { id: "360",      label: "360°",        icon: "🔭" },
];

const TAB_META: Record<Tab, { title: string; desc: string; phase: string; icon: string }> = {
  overview: { title: "Property Overview",    icon: "🏠", desc: "Full climate summary — solar potential, weather, heat impact, and AI insights.", phase: "Available" },
  solar:    { title: "Solar Analysis",       icon: "☀️", desc: "Sun path arcs, sunrise/sunset, peak solar hours, seasonal irradiance, and panel potential.", phase: "Phase 1 ✓" },
  weather:  { title: "Weather & Climate",    icon: "🌡️", desc: "Current conditions, 7-day forecast, monthly averages, heat index, and comfort scores.", phase: "Phase 1 ✓" },
  moon:     { title: "Moon Intelligence",    icon: "🌙", desc: "Lunar phase, moonrise/moonset, night-sky visibility score, and lunar calendar.", phase: "Phase 2 ✓" },
  impact:   { title: "Property Heat Impact", icon: "📊", desc: "Facade heat gain (N/S/E/W), car interior heat risk model, and annual outdoor score.", phase: "Phase 2 ✓" },
  ai:       { title: "AI Climate Insights",  icon: "🤖", desc: "Ask Claude AI anything about your property's climate — solar, weather, risks.", phase: "Phase 2 ✓" },
  "2d":     { title: "2D Map View",          icon: "🗺️", desc: "Satellite and street map with solar exposure overlay and sun compass.", phase: "Phase 1 ✓" },
  "3d":     { title: "3D Property View",     icon: "🏗️", desc: "Three.js 3D model with animated shadow sweep and sun arc simulation.", phase: "Phase 2" },
  "360":    { title: "360° Sky Dome",        icon: "🔭", desc: "Full panoramic sky dome showing real-time sun & moon position.", phase: "Phase 2" },
};

function TabContent({ tab, location }: { tab: Tab; location: Location | null }) {
  if (!location) return null;
  const m = TAB_META[tab];
  const isDone = m.phase.includes("✓");

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-5 bg-th-bg-2 border border-th-border">
        {m.icon}
      </div>
      <h2 className="text-xl font-bold text-th-text mb-2">{m.title}</h2>
      <p className="text-sm text-th-text-2 max-w-md mb-5 leading-relaxed">{m.desc}</p>
      <span className={isDone ? "badge-weather" : "badge-moon"}>
        {isDone ? "✓ " : ""}
        {m.phase}
      </span>
      {isDone && (
        <p className="mt-3 text-xs text-th-muted">
          Data rendering for this tab is wired up in the API — UI charts coming in Phase 2.
        </p>
      )}
    </div>
  );
}

function AddressHeader({ location, loading, error }: { location: Location | null; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="px-6 py-4 border-b border-th-border">
        <div className="skeleton h-6 w-72 rounded-lg mb-2" />
        <div className="skeleton h-4 w-44 rounded-lg" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-6 py-4 border-b border-th-border">
        <p className="text-sm text-th-danger">{error}</p>
      </div>
    );
  }
  if (!location) return null;
  return (
    <div className="px-6 py-4 border-b border-th-border bg-th-bg">
      <h1 className="text-lg font-bold text-th-text">{location.formatted_address}</h1>
      <p className="text-sm text-th-text-2 mt-0.5">
        {location.lat.toFixed(4)}°N · {Math.abs(location.lon).toFixed(4)}°W ·{" "}
        {location.city}, {location.state} {location.zip}
      </p>
    </div>
  );
}

export default function PropertyPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const router = useRouter();
  const decoded = decodeURIComponent(address);

  const [location, setLocation]   = useState<Location | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setLocation(await geocodeAddress(decoded));
      } catch {
        setError("Could not geocode this address. Please check it and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [decoded]);

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      {/* Global nav with theme toggle */}
      <Navbar />

      {/* Inline search bar */}
      <div className="border-b border-th-border bg-th-bg sticky top-14 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim();
              if (val) router.push(`/property/${encodeURIComponent(val)}`);
            }}
            className="flex gap-2 max-w-xl"
          >
            <input
              name="q"
              defaultValue={decoded}
              placeholder="Search another address…"
              className="input-field flex-1 rounded-xl px-3 py-2 text-sm"
            />
            <button type="submit" className="btn-solar px-4 py-2 rounded-xl text-sm font-semibold">
              Go
            </button>
          </form>
        </div>
      </div>

      {/* Address header */}
      <AddressHeader location={location} loading={loading} error={error} />

      {/* Tab bar — horizontally scrollable on mobile */}
      <div className="border-b border-th-border bg-th-bg sticky top-[calc(3.5rem+2.75rem)] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 shrink-0 ${
                  activeTab === id
                    ? "bg-th-solar/10 text-th-solar border border-th-solar/30"
                    : "text-th-text-2 hover:text-th-text hover:bg-th-bg-2"
                }`}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-32 rounded-2xl" />
            ))}
          </div>
        ) : (
          <TabContent tab={activeTab} location={location} />
        )}
      </main>
    </div>
  );
}
