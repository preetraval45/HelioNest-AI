"use client";

import { use, useEffect, useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { AIChat } from "@/components/AIChat";
import { AlertBanner, type PropertyAlert } from "@/components/AlertBanner";
import { MoonPhaseCard } from "@/components/MoonPhaseCard";
import { MonthlyHeatmap, type MonthlyDataPoint } from "@/components/charts/MonthlyHeatmap";
import { HourlyTimeline } from "@/components/charts/HourlyTimeline";
import SunArcVisualization from "@/components/charts/SunArcVisualization";
import { ViewModeSwitcher, type ViewMode } from "@/components/ViewModeSwitcher";
import SolarROICalculator from "@/components/SolarROICalculator";
import ClimateRiskReport from "@/components/ClimateRiskReport";
import { incrementPropertyViews } from "@/components/PWAInstallPrompt";
import { geocodeAddress, reverseGeocode } from "@/lib/api/addressApi";
import type { Location } from "@/types/location";

// Lazy-load heavy 3D components — no SSR
const PropertyView3D  = lazy(() => import("@/components/views/PropertyView3D"));
const PropertyView360 = lazy(() => import("@/components/views/PropertyView360").then((m) => ({ default: m.PropertyView360 })));
const PropertyMap2D   = lazy(() => import("@/components/maps/PropertyMap2D"));

const API = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost"}/api/v1`;

type Tab = "overview" | "solar" | "weather" | "moon" | "impact" | "ai" | "views";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview",  icon: "🏠" },
  { id: "solar",    label: "Solar",     icon: "☀️" },
  { id: "weather",  label: "Weather",   icon: "🌡️" },
  { id: "moon",     label: "Moon",      icon: "🌙" },
  { id: "impact",   label: "Impact",    icon: "📊" },
  { id: "ai",       label: "AI Chat",   icon: "🤖" },
  { id: "views",    label: "Map / 3D",  icon: "🗺️" },
];

// ── Data shapes ──────────────────────────────────────────────────────────────

interface SolarData {
  sunrise?: string; sunset?: string; solar_noon?: string;
  day_length_hours?: number; max_elevation_deg?: number;
  peak_sun_hours?: number; annual_ac_kwh?: number;
}

interface WeatherData {
  temp_c?: number; feels_like_c?: number; humidity_pct?: number;
  uv_index?: number; conditions?: string; comfort_level?: string;
  comfort_score?: number; wind_kmh?: number; risk_flags?: string[];
}

interface MoonData {
  phase?: { phase_name: string; illumination_pct: number; phase_angle: number; emoji: string };
  rise_set?: { moonrise: string | null; moonset: string | null; is_up_all_day: boolean; is_down_all_day: boolean };
  position?: { azimuth_deg: number; elevation_deg: number };
  night_visibility?: { score: number; level: string; moon_impact: string };
}

interface ForecastDay {
  date: string; temp_max_c: number; temp_min_c: number;
  precipitation_mm: number; conditions: string; weather_code: number;
  uv_index_max: number; wind_speed_max_kmh: number;
  sunrise?: string; sunset?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "⛅";
  if (code <= 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 99) return "⛈️";
  return "🌡️";
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent = "solar" }: Readonly<{
  label: string; value: string; sub?: string; icon: string;
  accent?: "solar" | "moon" | "weather" | "danger";
}>) {
  const colors = {
    solar:   "text-th-solar bg-th-solar/10 border-th-solar/20",
    moon:    "text-th-moon bg-th-moon/10 border-th-moon/20",
    weather: "text-th-weather bg-th-weather/10 border-th-weather/20",
    danger:  "text-th-danger bg-th-danger/10 border-th-danger/20",
  };
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-3 border ${colors[accent]}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-th-text">{value}</div>
      <div className="text-sm text-th-text-2 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-th-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: Readonly<{ children: React.ReactNode }>) {
  return <h2 className="text-base font-semibold text-th-text mb-4">{children}</h2>;
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function DateBar({ date, onChange }: Readonly<{ date: Date; onChange: (d: Date) => void }>) {
  const isToday = formatDate(date) === formatDate(new Date());

  function selectMonth(m: number) {
    const now = new Date();
    // If same month as today, snap to today; otherwise use the 15th as representative mid-month
    if (m === now.getMonth()) {
      onChange(new Date(now));
    } else {
      onChange(new Date(now.getFullYear(), m, 15));
    }
  }

  return (
    <div className="flex items-center gap-1.5 mb-5 overflow-x-auto no-scrollbar pb-0.5">
      {MONTH_LABELS.map((m, i) => (
        <button
          key={m} type="button" onClick={() => selectMonth(i)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all border focus-visible:ring-2 focus-visible:ring-amber-500 ${
            date.getMonth() === i
              ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
              : "text-th-text-2 border-th-border hover:text-th-solar hover:border-amber-500/30 hover:bg-th-bg-2"
          }`}
        >{m}</button>
      ))}
      <div className="w-px h-5 bg-th-border shrink-0 mx-0.5" />
      <button
        type="button"
        onClick={() => onChange(new Date())}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border focus-visible:ring-2 focus-visible:ring-amber-500 ${
          isToday ? "bg-amber-500 text-white border-amber-500" : "text-th-text-2 border-th-border hover:border-amber-500/40 hover:text-th-solar"
        }`}
      >Today</button>
    </div>
  );
}

function Loading3D() {
  return (
    <div className="flex items-center justify-center h-80 rounded-2xl bg-th-bg-2 border border-th-border">
      <div className="text-center">
        <div className="w-8 h-8 rounded-full border-2 border-th-solar/30 border-t-th-solar animate-spin mx-auto mb-3" />
        <p className="text-sm text-th-muted">Loading 3D scene…</p>
      </div>
    </div>
  );
}

// ── Tab content components ────────────────────────────────────────────────────

function OverviewTab({ location, alerts, selectedDate }: Readonly<{ location: Location; alerts: PropertyAlert[]; selectedDate: Date }>) {
  const [solar, setSolar]   = useState<SolarData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    // Single request — snapshot fetches solar + weather + moon in parallel on the backend
    void fetchJson<{ solar: SolarData; weather: WeatherData }>(`${API}/property/snapshot?lat=${location.lat}&lon=${location.lon}`)
      .then((d) => { if (d) { setSolar(d.solar); setWeather(d.weather); } });
  }, [location]);

  return (
    <div className="space-y-6">
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="☀️" label="Peak Sun Hours" value={solar?.peak_sun_hours ? `${solar.peak_sun_hours}h` : "—"} sub="per day" accent="solar" />
        <StatCard icon="🌡️" label="Temperature"    value={weather?.temp_c == null ? "—" : `${Math.round(weather.temp_c)}°C`} sub={weather?.conditions} accent="weather" />
        <StatCard icon="💧" label="Humidity"       value={weather?.humidity_pct == null ? "—" : `${weather.humidity_pct}%`} sub="relative" accent="moon" />
        <StatCard icon="🔆" label="UV Index"       value={weather?.uv_index == null ? "—" : String(weather.uv_index)} sub={weather?.uv_index == null || weather.uv_index < 8 ? "Moderate" : "High risk"} accent={weather?.uv_index == null || weather.uv_index < 8 ? "solar" : "danger"} />
      </div>

      {location && (
        <div className="glass-card rounded-2xl p-5">
          <SectionTitle>
            {formatDate(selectedDate) === formatDate(new Date())
              ? "Today's Sun Arc"
              : `Sun Arc — ${selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
          </SectionTitle>
          <SunArcVisualization lat={location.lat} lon={location.lon} date={selectedDate} />
        </div>
      )}

      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Location Details</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 text-sm">
          {[
            ["Address", location.formatted_address],
            ["Coordinates", `${location.lat.toFixed(4)}°N, ${Math.abs(location.lon).toFixed(4)}°W`],
            ["City", location.city ?? "—"],
            ["State", location.state ?? "—"],
            ["ZIP", location.zip ?? "—"],
            ["Sunrise", solar?.sunrise ?? "—"],
            ["Sunset", solar?.sunset ?? "—"],
            ["Day Length", solar?.day_length_hours ? `${solar.day_length_hours.toFixed(1)}h` : "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-xs text-th-muted mb-0.5">{label}</div>
              <div className="text-th-text font-medium truncate">{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SolarTab({ location, selectedDate }: Readonly<{ location: Location; selectedDate: Date }>) {
  const [solar, setSolar] = useState<SolarData | null>(null);
  useEffect(() => {
    const dateStr = formatDate(selectedDate);
    void fetchJson<SolarData>(`${API}/solar/daily?lat=${location.lat}&lon=${location.lon}&date=${dateStr}`).then(setSolar);
  }, [location, selectedDate]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="⏰" label="Sunrise"          value={solar?.sunrise ?? "—"}            accent="solar" />
        <StatCard icon="🌅" label="Sunset"           value={solar?.sunset ?? "—"}             accent="solar" />
        <StatCard icon="☀️" label="Peak Sun Hours"  value={solar?.peak_sun_hours ? `${solar.peak_sun_hours}h` : "—"} accent="solar" />
        <StatCard icon="⚡" label="Annual Energy"   value={solar?.annual_ac_kwh ? `${Math.round(solar.annual_ac_kwh).toLocaleString()} kWh` : "—"} sub="est. PV output" accent="solar" />
      </div>

      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Sun Arc — {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</SectionTitle>
        <SunArcVisualization lat={location.lat} lon={location.lon} date={selectedDate} />
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-2 text-sm text-th-text-2">
        <SectionTitle>Solar Stats</SectionTitle>
        {[
          ["Solar noon", solar?.solar_noon ?? "—"],
          ["Max elevation", solar?.max_elevation_deg == null ? "—" : `${solar.max_elevation_deg.toFixed(1)}°`],
          ["Day length", solar?.day_length_hours == null ? "—" : `${solar.day_length_hours.toFixed(1)} hours`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-th-border pb-2 last:border-0 last:pb-0">
            <span className="text-th-muted">{k}</span>
            <span className="text-th-text font-medium">{v}</span>
          </div>
        ))}
      </div>

      <SolarROICalculator lat={location.lat} lon={location.lon} />
    </div>
  );
}

function WeatherTab({ location }: Readonly<{ location: Location }>) {
  const [weather, setWeather]   = useState<WeatherData | null>(null);
  const [monthly, setMonthly]   = useState<MonthlyDataPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);

  useEffect(() => {
    void fetchJson<WeatherData>(`${API}/weather/current?lat=${location.lat}&lon=${location.lon}`).then(setWeather);
    void fetchJson<{ days: ForecastDay[] }>(`${API}/weather/forecast?lat=${location.lat}&lon=${location.lon}&days=7`)
      .then((d) => { if (d) setForecast(d.days); });
    void fetchJson<{ monthly: Array<{ month: number; avg_temp_max_c: number; avg_temp_min_c: number }> }>(
      `${API}/weather/monthly?lat=${location.lat}&lon=${location.lon}`
    ).then((d) => {
      if (!d) return;
      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      setMonthly(d.monthly.map((m) => ({
        month:  MONTHS[m.month - 1] ?? "?",
        value:  Math.round(m.avg_temp_max_c),
        label:  `Avg high ${m.avg_temp_max_c.toFixed(1)}°C`,
      })));
    });
  }, [location]);

  const hourlyTemps = Array.from({ length: 24 }, (_, h) => {
    const base = weather?.temp_c ?? 20;
    return base - 5 + Math.sin((h - 6) * Math.PI / 12) * 8;
  });
  const hourlyUV = Array.from({ length: 24 }, (_, h) => {
    if (h < 6 || h > 20) return 0;
    const base = weather?.uv_index ?? 5;
    return Math.max(0, base * Math.sin((h - 6) * Math.PI / 14));
  });
  const hourlyElev = Array.from({ length: 24 }, (_, h) => {
    return Math.max(-20, 70 * Math.sin((h - 6) * Math.PI / 12));
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="🌡️" label="Temperature"  value={weather?.temp_c == null ? "—" : `${Math.round(weather.temp_c)}°C`} sub={weather?.feels_like_c == null ? undefined : `Feels ${Math.round(weather.feels_like_c)}°C`} accent="weather" />
        <StatCard icon="💧" label="Humidity"     value={weather?.humidity_pct == null ? "—" : `${weather.humidity_pct}%`} accent="moon" />
        <StatCard icon="🔆" label="UV Index"     value={weather?.uv_index == null ? "—" : String(weather.uv_index)} sub={weather?.uv_index == null || weather.uv_index < 6 ? "Moderate" : "⚠️ High"} accent={weather?.uv_index == null || weather.uv_index < 8 ? "solar" : "danger"} />
        <StatCard icon="😊" label="Comfort"      value={weather?.comfort_score == null ? "—" : `${weather.comfort_score}/100`} sub={weather?.comfort_level} accent="weather" />
      </div>

      {monthly.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <MonthlyHeatmap data={monthly} metric="heat" title="Monthly Avg High Temperature" />
        </div>
      )}

      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>24-Hour Profile</SectionTitle>
        <HourlyTimeline hourlyTemps={hourlyTemps} hourlyUV={hourlyUV} hourlySolarElevation={hourlyElev} />
      </div>

      {forecast.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <SectionTitle>7-Day Forecast</SectionTitle>
          <div className="grid grid-cols-7 gap-1.5">
            {forecast.map((day) => {
              const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
              const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={day.date} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-th-bg-2 border border-th-border text-center min-w-0">
                  <div className="text-[10px] font-semibold text-th-text">{dayLabel}</div>
                  <div className="text-[9px] text-th-muted">{dateLabel}</div>
                  <div className="text-xl leading-none my-0.5">{weatherEmoji(day.weather_code)}</div>
                  <div className="text-xs font-bold text-amber-500">{Math.round(day.temp_max_c)}°</div>
                  <div className="text-xs text-th-muted">{Math.round(day.temp_min_c)}°</div>
                  {day.precipitation_mm > 0.5 && (
                    <div className="text-[9px] text-blue-400">{day.precipitation_mm.toFixed(0)}mm</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {weather?.risk_flags && weather.risk_flags.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <SectionTitle>Risk Flags</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {weather.risk_flags.map((f) => (
              <span key={f} className="badge-danger">{f}</span>
            ))}
          </div>
        </div>
      )}

      <ClimateRiskReport lat={location.lat} lon={location.lon} />
    </div>
  );
}

function MoonTab({ location, selectedDate }: Readonly<{ location: Location; selectedDate: Date }>) {
  const [moon, setMoon] = useState<MoonData | null>(null);
  useEffect(() => {
    const dateStr = formatDate(selectedDate);
    void fetchJson<MoonData>(`${API}/moon/daily?lat=${location.lat}&lon=${location.lon}&date=${dateStr}`).then(setMoon);
  }, [location, selectedDate]);

  if (!moon) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {(["sk-a", "sk-b", "sk-c", "sk-d"] as const).map((key) => <div key={key} className="skeleton h-28 rounded-2xl" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {moon.phase && moon.rise_set && moon.night_visibility && (
          <MoonPhaseCard
            phase={moon.phase}
            riseSet={moon.rise_set}
            visibility={moon.night_visibility}
            positionElevation={moon.position?.elevation_deg}
          />
        )}
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <SectionTitle>Moon Position</SectionTitle>
          {moon.position && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <StatCard icon="🧭" label="Azimuth"   value={`${moon.position.azimuth_deg.toFixed(1)}°`}   accent="moon" />
              <StatCard icon="📐" label="Elevation" value={`${moon.position.elevation_deg.toFixed(1)}°`} accent="moon" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImpactTab({ location }: Readonly<{ location: Location }>) {
  const [monthly, setMonthly] = useState<MonthlyDataPoint[]>([]);
  useEffect(() => {
    void fetchJson<{ monthly: Array<{ month: number; avg_temp_max_c: number }> }>(
      `${API}/weather/monthly?lat=${location.lat}&lon=${location.lon}`
    ).then(async (d) => {
      if (!d) return;
      const temps = d.monthly.map((m) => m.avg_temp_max_c);
      const comfort = await fetchJson<{ monthly: Array<{ month: number; comfort_score: number; label: string }> }>(
        `${API}/impact/comfort?monthly_data=${encodeURIComponent(JSON.stringify(temps))}`
      );
      if (!comfort) return;
      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      setMonthly(comfort.monthly.map((m) => ({
        month: MONTHS[m.month - 1] ?? "?",
        value: Math.round(m.comfort_score),
        label: m.label,
      })));
    });
  }, [location]);

  return (
    <div className="space-y-6">
      {monthly.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <MonthlyHeatmap data={monthly} metric="comfort" title="Monthly Outdoor Comfort Score" />
        </div>
      )}

      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Car Heat Risk Calculator</SectionTitle>
        <CarHeatCalculator />
      </div>

      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Facade Heat Exposure</SectionTitle>
        <p className="text-sm text-th-text-2">
          South-facing walls receive the most solar heat gain in winter (passive heating benefit).
          West-facing walls experience peak heat in afternoon — consider shade trees or external shading.
        </p>
      </div>

      <MoldAirQualityPanel lat={location.lat} lon={location.lon} />
    </div>
  );
}

function moldGaugeColor(idx: number): string {
  if (idx >= 7) return "#ef4444";
  if (idx >= 4) return "#f97316";
  if (idx >= 2) return "#eab308";
  return "#10b981";
}

function MoldAirQualityPanel({ lat, lon }: Readonly<{ lat: number; lon: number }>) {
  const [mold, setMold] = useState<{
    mold_index: number; risk_level: string; risk_color: string;
    contributing_factors: string[]; recommendations: string[];
  } | null>(null);
  const [aq, setAq] = useState<{
    aqi: number | null; aqi_category: string | null; aqi_color: string | null;
    station_name: string | null; distance_km: number | null;
    pollutants: Array<{ parameter: string; value: number; unit: string }>;
  } | null>(null);

  useEffect(() => {
    void fetchJson<typeof mold>(`${API}/impact/mold-risk?lat=${lat}&lon=${lon}`).then(setMold);
    void fetchJson<typeof aq>(`${API}/impact/air-quality?lat=${lat}&lon=${lon}`).then(setAq);
  }, [lat, lon]);

  const moldTextColor: Record<string, string> = {
    low: "text-emerald-500", moderate: "text-yellow-500",
    high: "text-orange-500", extreme: "text-red-500",
  };

  let aqContent: React.ReactNode;
  if (!aq) {
    aqContent = <div className="skeleton h-20 rounded-lg" />;
  } else if (aq.aqi === null) {
    aqContent = <p className="text-sm text-th-muted">No monitoring station within 25 km of this location.</p>;
  } else {
    aqContent = (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg border border-th-border bg-th-bg-2">
          <span className="text-3xl font-bold text-th-text">{aq.aqi}</span>
          <div>
            <p className="text-sm font-semibold text-th-text">{aq.aqi_category}</p>
            <p className="text-[10px] text-th-muted">US AQI (PM2.5-based)</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {aq.pollutants.slice(0, 6).map((p) => (
            <div key={p.parameter} className="bg-th-bg-2 border border-th-border rounded-lg p-2 text-center">
              <div className="text-xs font-mono font-bold text-th-text uppercase">{p.parameter}</div>
              <div className="text-[11px] text-th-muted">{p.value} {p.unit}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mold Risk */}
      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Mold Risk Index</SectionTitle>
        {mold ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 shrink-0">
                <svg
                  viewBox="0 0 36 36"
                  aria-label={`Mold risk gauge: ${mold.mold_index} out of 10 — ${mold.risk_level} risk`}
                  className="w-full -rotate-90"
                >
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-th-border" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={moldGaugeColor(mold.mold_index)} strokeWidth="3"
                    strokeDasharray={`${(mold.mold_index / 10) * 100} 100`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-lg font-bold ${moldTextColor[mold.risk_level]}`}>{mold.mold_index}</span>
                  <span className="text-[9px] text-th-muted">/10</span>
                </div>
              </div>
              <div>
                <p className={`font-semibold capitalize text-sm ${moldTextColor[mold.risk_level]}`}>{mold.risk_level} Risk</p>
                <ul className="mt-1 space-y-0.5">
                  {mold.contributing_factors.map((f) => <li key={f} className="text-[11px] text-th-muted">{f}</li>)}
                </ul>
              </div>
            </div>
            {mold.recommendations.length > 0 && (
              <div className="bg-th-bg-2 rounded-lg p-3 text-xs space-y-1">
                {mold.recommendations.map((r) => <p key={r} className="text-th-text-2">• {r}</p>)}
              </div>
            )}
          </div>
        ) : <div className="skeleton h-20 rounded-lg" />}
      </div>

      {/* Air Quality */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Air Quality Index</SectionTitle>
          {aq?.station_name && (
            <span className="text-[10px] text-th-muted">{aq.station_name} · {aq.distance_km} km</span>
          )}
        </div>
        {aqContent}
      </div>
    </div>
  );
}

function CarHeatCalculator() {
  const [temp, setTemp]     = useState(30);
  const [hours, setHours]   = useState(1);
  const [result, setResult] = useState<{ interior_temp_c: number; risk_level: string; temp_rise_c: number } | null>(null);

  useEffect(() => {
    void fetchJson<{ interior_temp_c: number; risk_level: string; temp_rise_c: number }>(
      `${API}/impact/car-heat?outdoor_temp_c=${temp}&irradiance_w_m2=800&hours_parked=${hours}`
    ).then(setResult);
  }, [temp, hours]);

  const riskColor: Record<string, string> = {
    Safe: "badge-weather", Warm: "badge-solar", Hot: "badge-solar",
    Dangerous: "badge-danger", Deadly: "badge-danger",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="car-temp" className="text-xs text-th-muted mb-1 block">Outdoor Temp (°C)</label>
          <input id="car-temp" type="range" min={-10} max={50} value={temp} aria-label={`Outdoor temperature ${temp}°C`} onChange={(e) => setTemp(+e.target.value)}
            className="w-full accent-amber-400" />
          <div className="text-sm text-th-text text-center">{temp}°C</div>
        </div>
        <div>
          <label htmlFor="car-hours" className="text-xs text-th-muted mb-1 block">Hours Parked</label>
          <input id="car-hours" type="range" min={0.25} max={8} step={0.25} value={hours} aria-label={`Hours parked ${hours}`} onChange={(e) => setHours(+e.target.value)}
            className="w-full accent-amber-400" />
          <div className="text-sm text-th-text text-center">{hours}h</div>
        </div>
      </div>
      {result && (
        <div className="flex items-center gap-4 p-4 rounded-xl bg-th-bg-2 border border-th-border">
          <div className="text-3xl font-bold text-th-solar">{Math.round(result.interior_temp_c)}°C</div>
          <div>
            <div className="text-sm text-th-text">Interior temperature</div>
            <div className="text-xs text-th-muted">+{Math.round(result.temp_rise_c)}°C above outdoor</div>
            <span className={`${riskColor[result.risk_level] ?? "badge-solar"} mt-1 inline-block`}>{result.risk_level}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AITab({ location }: Readonly<{ location: Location }>) {
  const [suggested, setSuggested] = useState<string[]>([]);
  const propertyData = { address: location.formatted_address, lat: location.lat, lon: location.lon };

  useEffect(() => {
    void fetch(`${API}/ai/suggested-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_data: propertyData }),
    }).then((r) => r.json()).then((d: { questions?: string[] }) => {
      if (d.questions) setSuggested(d.questions);
    }).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.formatted_address]);

  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col h-[600px]">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-xl">🤖</span>
        <h2 className="font-semibold text-th-text">AI Climate Chat</h2>
        <span className="badge-moon ml-auto">Claude · Multi-agent</span>
      </div>
      <AIChat
        propertyData={propertyData as Record<string, unknown>}
        suggestedQuestions={suggested}
        className="flex-1 min-h-0"
      />
    </div>
  );
}

function ViewsTab({ location }: Readonly<{ location: Location }>) {
  const [viewMode, setViewMode] = useState<ViewMode>("2d");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SectionTitle>Property View</SectionTitle>
        <ViewModeSwitcher mode={viewMode} onChange={setViewMode} />
      </div>

      <Suspense fallback={<Loading3D />}>
        {viewMode === "2d" && (
          <div aria-label="2D satellite map view" className="rounded-2xl overflow-hidden border border-th-border h-[480px]">
            <PropertyMap2D lat={location.lat} lon={location.lon} />
          </div>
        )}
        {viewMode === "3d" && (
          <div aria-label="3D property model with animated sun arc">
            <PropertyView3D lat={location.lat} lon={location.lon} />
          </div>
        )}
        {viewMode === "360" && (
          <div aria-label="360-degree sky dome panoramic view">
            <PropertyView360 lat={location.lat} lon={location.lon} />
          </div>
        )}
      </Suspense>
    </div>
  );
}

// ── Address Header ─────────────────────────────────────────────────────────────

function AddressHeader({ location, loading, error }: Readonly<{ location: Location | null; loading: boolean; error: string | null }>) {
  if (loading) return (
    <div className="px-6 py-4 border-b border-th-border bg-th-bg">
      <div className="skeleton h-6 w-72 rounded-lg mb-2" />
      <div className="skeleton h-4 w-44 rounded-lg" />
    </div>
  );
  if (error) return (
    <div className="px-6 py-4 border-b border-th-border bg-th-bg">
      <p className="text-sm text-th-danger">{error}</p>
    </div>
  );
  if (!location) return null;
  return (
    <div className="px-6 py-3 border-b border-th-border bg-th-bg">
      <h1 className="text-base font-bold text-th-text">{location.formatted_address}</h1>
      <p className="text-xs text-th-text-2 mt-0.5">
        {location.lat.toFixed(4)}°N · {Math.abs(location.lon).toFixed(4)}°W · {location.city}, {location.state} {location.zip}
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PropertyPage({ params }: Readonly<{ params: Promise<{ address: string }> }>) {
  const { address } = use(params);
  const router = useRouter();
  const decoded = decodeURIComponent(address);

  const [location, setLocation]     = useState<Location | null>(null);
  const [activeTab, setActiveTab]   = useState<Tab>("overview");
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [alerts, setAlerts]         = useState<PropertyAlert[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const loc = await geocodeAddress(decoded);
        setLocation(loc);
        incrementPropertyViews();

        // Fetch weather to build alerts
        const weather = await fetchJson<WeatherData>(`${API}/weather/current?lat=${loc.lat}&lon=${loc.lon}`);
        if (weather) {
          const builtAlerts: PropertyAlert[] = [];
          if (weather.temp_c != null && weather.temp_c >= 38)
            builtAlerts.push({ id: "heat", severity: "danger", title: "Extreme Heat", description: `${Math.round(weather.temp_c)}°C — avoid prolonged outdoor exposure.`, icon: "🔥" });
          else if (weather.temp_c != null && weather.temp_c >= 32)
            builtAlerts.push({ id: "heat", severity: "warning", title: "High Heat", description: `Temperature is ${Math.round(weather.temp_c)}°C.`, icon: "🌡️" });
          if (weather.uv_index != null && weather.uv_index >= 11)
            builtAlerts.push({ id: "uv", severity: "danger", title: "Extreme UV", description: `UV index ${weather.uv_index} — unprotected skin burns in minutes.`, icon: "☀️" });
          else if (weather.uv_index != null && weather.uv_index >= 8)
            builtAlerts.push({ id: "uv", severity: "warning", title: "High UV", description: `UV index ${weather.uv_index} — wear sunscreen and protective clothing.`, icon: "🕶️" });
          if (weather.temp_c != null && weather.temp_c <= 0)
            builtAlerts.push({ id: "freeze", severity: "danger", title: "Freeze Risk", description: `${Math.round(weather.temp_c)}°C — risk of black ice and pipe damage.`, icon: "❄️" });
          setAlerts(builtAlerts);
        }
      } catch {
        setError("Could not geocode this address. Please check it and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [decoded]);

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      <Navbar />

      {/* Inline search */}
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
            <input name="q" placeholder="Search another address…"
              className="input-field flex-1 rounded-xl px-3 py-2 text-sm" />
            <button
              type="button"
              title="Use my current location"
              onClick={() => {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition(
                  async (pos) => {
                    try {
                      const loc = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                      router.push(`/property/${encodeURIComponent(loc.formatted_address)}`);
                    } catch { /* ignore */ }
                  },
                  () => { /* denied */ },
                  { timeout: 10000 }
                );
              }}
              className="px-3 py-2 rounded-xl border border-th-border bg-th-bg-2 text-th-text-2 hover:text-th-solar hover:border-th-solar/40 transition-all text-base"
            >
              📍
            </button>
            <button type="submit" className="btn-solar px-4 py-2 rounded-xl text-sm font-semibold">Go</button>
          </form>
        </div>
      </div>

      <AddressHeader location={location} loading={loading} error={error} />

      {/* Tab bar */}
      <div className="border-b border-th-border bg-th-bg sticky top-[calc(3.5rem+2.75rem)] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div
            role="tablist"
            aria-label="Property information tabs"
            tabIndex={-1}
            className="flex gap-1 overflow-x-auto no-scrollbar py-2"
            onKeyDown={(e) => {
              const idx = TABS.findIndex((t) => t.id === activeTab);
              let next: Tab | null = null;
              if (e.key === "ArrowRight") next = TABS[(idx + 1) % TABS.length].id;
              else if (e.key === "ArrowLeft") next = TABS[(idx - 1 + TABS.length) % TABS.length].id;
              else if (e.key === "Home") next = TABS[0].id;
              else if (e.key === "End") next = TABS.at(-1)!.id;
              if (next) {
                e.preventDefault();
                setActiveTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            {TABS.map(({ id, label, icon }) => {
              const base = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70";
              return activeTab === id ? (
                <button key={id} id={`tab-${id}`} type="button" role="tab"
                  aria-selected="true" aria-controls={`panel-${id}`} tabIndex={0}
                  onClick={() => setActiveTab(id)}
                  className={`${base} bg-th-solar/10 text-th-solar border border-th-solar/30`}>
                  <span aria-hidden="true">{icon}</span>{label}
                </button>
              ) : (
                <button key={id} id={`tab-${id}`} type="button" role="tab"
                  aria-selected="false" aria-controls={`panel-${id}`} tabIndex={-1}
                  onClick={() => setActiveTab(id)}
                  className={`${base} text-th-text-2 hover:text-th-text hover:bg-th-bg-2`}>
                  <span aria-hidden="true">{icon}</span>{label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {location && activeTab !== "ai" && activeTab !== "views" && (
          <DateBar date={selectedDate} onChange={setSelectedDate} />
        )}
        {(() => {
          let tabContent: React.ReactNode = null;
          if (loading) {
            tabContent = (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(["sk-1","sk-2","sk-3","sk-4","sk-5","sk-6","sk-7","sk-8"] as const).map((key) => <div key={key} className="skeleton h-28 rounded-2xl" />)}
              </div>
            );
          } else if (location) {
            tabContent = (
              <div
                id={`panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`tab-${activeTab}`}
                tabIndex={0}
                className="focus-visible:outline-none"
              >
                {activeTab === "overview" && <OverviewTab location={location} alerts={alerts} selectedDate={selectedDate} />}
                {activeTab === "solar"    && <SolarTab    location={location} selectedDate={selectedDate} />}
                {activeTab === "weather"  && <WeatherTab  location={location} />}
                {activeTab === "moon"     && <MoonTab     location={location} selectedDate={selectedDate} />}
                {activeTab === "impact"   && <ImpactTab   location={location} />}
                {activeTab === "ai"       && <AITab        location={location} />}
                {activeTab === "views"    && <ViewsTab    location={location} />}
              </div>
            );
          }
          return tabContent;
        })()}
      </main>
    </div>
  );
}
