"use client";

import { use, useEffect, useState, lazy, Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { AIChat } from "@/components/AIChat";
import { AlertBanner, type PropertyAlert } from "@/components/AlertBanner";
import { MoonPhaseCard } from "@/components/MoonPhaseCard";
import { MonthlyHeatmap, type MonthlyDataPoint } from "@/components/charts/MonthlyHeatmap";
import { HourlyTimeline } from "@/components/charts/HourlyTimeline";
import SunArcVisualization from "@/components/charts/SunArcVisualization";
import SolarROICalculator from "@/components/SolarROICalculator";
import ClimateRiskReport from "@/components/ClimateRiskReport";
import { incrementPropertyViews } from "@/components/PWAInstallPrompt";
import { geocodeAddress, reverseGeocode } from "@/lib/api/addressApi";
import type { Location } from "@/types/location";

const PropertyView3D  = lazy(() => import("@/components/views/PropertyView3D"));
const PropertyView360 = lazy(() => import("@/components/views/PropertyView360").then((m) => ({ default: m.PropertyView360 })));
const PropertyMap2D   = lazy(() => import("@/components/maps/PropertyMap2D"));

const API = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost"}/api/v1`;

type Tab = "overview" | "solar" | "3d" | "weather" | "moon" | "impact" | "ai";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview",  icon: "🏠" },
  { id: "solar",    label: "Solar",     icon: "☀️" },
  { id: "3d",       label: "3D View",   icon: "🌐" },
  { id: "weather",  label: "Weather",   icon: "🌡️" },
  { id: "moon",     label: "Moon",      icon: "🌙" },
  { id: "impact",   label: "Impact",    icon: "📊" },
  { id: "ai",       label: "AI Chat",   icon: "🤖" },
];

// ── Data types ─────────────────────────────────────────────────────────────────

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

// ── Utilities ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weatherEmoji(code: number): string {
  if (code === 0)  return "☀️";
  if (code <= 2)   return "⛅";
  if (code <= 3)   return "☁️";
  if (code <= 48)  return "🌫️";
  if (code <= 67)  return "🌧️";
  if (code <= 77)  return "❄️";
  if (code <= 82)  return "🌦️";
  if (code <= 99)  return "⛈️";
  return "🌡️";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Shared primitives ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent = "solar" }: Readonly<{
  label: string; value: string; sub?: string; icon: string;
  accent?: "solar" | "moon" | "weather" | "danger" | "neutral";
}>) {
  const colors: Record<string, string> = {
    solar:   "text-amber-400  bg-amber-400/10  border-amber-400/20",
    moon:    "text-violet-400 bg-violet-400/10 border-violet-400/20",
    weather: "text-sky-400    bg-sky-400/10    border-sky-400/20",
    danger:  "text-red-400    bg-red-400/10    border-red-400/20",
    neutral: "text-slate-400  bg-slate-400/10  border-slate-400/20",
  };
  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col gap-2 hover:border-th-border/60 transition-all">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base border ${colors[accent] ?? colors.neutral}`}>
        {icon}
      </div>
      <div className="text-xl font-bold text-th-text leading-tight">{value}</div>
      <div className="text-xs text-th-text-2">{label}</div>
      {sub && <div className="text-[11px] text-th-muted">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, action }: Readonly<{ children: React.ReactNode; action?: React.ReactNode }>) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-th-text">{children}</h2>
      {action}
    </div>
  );
}

function AIInsightCard({ prompt, context }: Readonly<{ prompt: string; context: Record<string, unknown> }>) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchInsight = useCallback(async () => {
    if (insight || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          property_data: context,
          conversation_history: [],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { response?: string };
        setInsight(data.response ?? null);
      }
    } catch {
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }, [prompt, context, insight, loading]);

  const handleOpen = () => {
    setOpen(true);
    void fetchInsight();
  };

  return (
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors border border-violet-400/20 hover:border-violet-400/40 rounded-lg px-3 py-1.5 bg-violet-400/5"
        >
          <span>🤖</span> Get AI Insight
        </button>
      ) : (
        <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3 text-xs text-th-text-2 leading-relaxed">
          <div className="flex items-center gap-1.5 mb-2 text-violet-400 font-semibold">
            <span>🤖</span> AI Insight
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-th-muted">
              <div className="w-3 h-3 border border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              Thinking…
            </div>
          ) : insight ? (
            <p className="whitespace-pre-wrap">{insight}</p>
          ) : (
            <p className="text-th-muted">Could not load insight.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Date bar ───────────────────────────────────────────────────────────────────

function DateBar({ date, onChange }: Readonly<{ date: Date; onChange: (d: Date) => void }>) {
  const isToday = toDateStr(date) === toDateStr(new Date());
  const currentMonth = new Date().getMonth();

  return (
    <div className="flex items-center gap-1 mb-5 overflow-x-auto no-scrollbar pb-0.5">
      {MONTH_LABELS.map((m, i) => (
        <button
          key={m} type="button"
          onClick={() => {
            const t = new Date();
            onChange(i === t.getMonth() ? t : new Date(t.getFullYear(), i, 15));
          }}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all border focus-visible:ring-2 focus-visible:ring-amber-500 ${
            date.getMonth() === i
              ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
              : i === currentMonth
              ? "text-th-text-2 border-amber-500/20 hover:text-th-solar hover:border-amber-500/30 hover:bg-th-bg-2"
              : "text-th-text-2 border-th-border hover:text-th-solar hover:border-amber-500/30 hover:bg-th-bg-2"
          }`}
        >{m}</button>
      ))}
      <div className="w-px h-4 bg-th-border shrink-0 mx-0.5" />
      <button
        type="button"
        onClick={() => onChange(new Date())}
        className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border focus-visible:ring-2 focus-visible:ring-amber-500 ${
          isToday ? "bg-amber-500 text-white border-amber-500" : "text-th-text-2 border-th-border hover:border-amber-500/40 hover:text-th-solar"
        }`}
      >Today</button>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function GridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${count} gap-3`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-28 rounded-2xl" />
      ))}
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────────

function OverviewTab({ location, alerts, selectedDate }: Readonly<{
  location: Location; alerts: PropertyAlert[]; selectedDate: Date;
}>) {
  const [solar,   setSolar]   = useState<SolarData   | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    void fetchJson<{ solar: SolarData; weather: WeatherData }>(
      `${API}/property/snapshot?lat=${location.lat}&lon=${location.lon}`,
    ).then((d) => { if (d) { setSolar(d.solar); setWeather(d.weather); } });
  }, [location]);

  const uvLevel = (uv: number) => {
    if (uv < 3) return "Low";
    if (uv < 6) return "Moderate";
    if (uv < 8) return "High";
    if (uv < 11) return "Very High";
    return "Extreme";
  };

  return (
    <div className="space-y-6">
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="☀️" label="Peak Sun Hours" accent="solar"
          value={solar?.peak_sun_hours ? `${solar.peak_sun_hours}h` : "—"}
          sub={solar?.annual_ac_kwh ? `~${Math.round(solar.annual_ac_kwh / 1000)}k kWh/yr` : "per day"} />
        <StatCard icon="🌡️" label="Temperature" accent="weather"
          value={weather?.temp_c == null ? "—" : `${Math.round(weather.temp_c)}°C`}
          sub={weather?.conditions} />
        <StatCard icon="💧" label="Humidity" accent="neutral"
          value={weather?.humidity_pct == null ? "—" : `${weather.humidity_pct}%`}
          sub={weather?.comfort_level} />
        <StatCard icon="🔆" label="UV Index" accent={weather?.uv_index == null || weather.uv_index < 8 ? "solar" : "danger"}
          value={weather?.uv_index == null ? "—" : String(weather.uv_index)}
          sub={weather?.uv_index == null ? undefined : uvLevel(weather.uv_index)} />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="⏰" label="Sunrise"    accent="solar"   value={solar?.sunrise ?? "—"} />
        <StatCard icon="🌅" label="Sunset"     accent="solar"   value={solar?.sunset  ?? "—"} />
        <StatCard icon="🌤️" label="Day Length" accent="neutral" value={solar?.day_length_hours ? `${solar.day_length_hours.toFixed(1)}h` : "—"} />
        <StatCard icon="💨" label="Wind"       accent="weather" value={weather?.wind_kmh == null ? "—" : `${Math.round(weather.wind_kmh)} km/h`} />
      </div>

      {/* Sun Arc */}
      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>
          {toDateStr(selectedDate) === toDateStr(new Date())
            ? "Today's Sun Path"
            : `Sun Path — ${selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
        </SectionTitle>
        <SunArcVisualization lat={location.lat} lon={location.lon} date={selectedDate} />
      </div>

      {/* Location + AI insight */}
      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Location Details</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 text-sm">
          {[
            ["Address",    location.formatted_address],
            ["Coordinates",`${location.lat.toFixed(4)}°N, ${Math.abs(location.lon).toFixed(4)}°W`],
            ["City",       location.city  ?? "—"],
            ["State",      location.state ?? "—"],
            ["ZIP",        location.zip   ?? "—"],
            ["Solar Noon", solar?.solar_noon ?? "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-[11px] text-th-muted mb-0.5">{label}</div>
              <div className="text-th-text font-medium truncate">{val}</div>
            </div>
          ))}
        </div>
        <AIInsightCard
          prompt={`Give me a concise 2-sentence solar and climate overview for this property at ${location.formatted_address}. Focus on solar potential and key climate factors.`}
          context={{ lat: location.lat, lon: location.lon, address: location.formatted_address, solar, weather }}
        />
      </div>
    </div>
  );
}

// ── Tab: Solar ─────────────────────────────────────────────────────────────────

function SolarTab({ location, selectedDate }: Readonly<{ location: Location; selectedDate: Date }>) {
  const [solar, setSolar] = useState<SolarData | null>(null);
  const [sweep, setSweep] = useState<{ hourly: { elevation_deg: number; shadow_length_ratio: number; is_daytime: boolean }[] } | null>(null);

  useEffect(() => {
    void fetchJson<SolarData>(`${API}/solar/daily?lat=${location.lat}&lon=${location.lon}&date=${toDateStr(selectedDate)}`).then(setSolar);
    void fetchJson<typeof sweep>(`${API}/solar/shadow/sweep?lat=${location.lat}&lon=${location.lon}&date=${toDateStr(selectedDate)}`).then(setSweep);
  }, [location, selectedDate]);

  // Hourly elevation from sweep
  const hourlyElev = sweep
    ? Array.from({ length: 24 }, (_, h) => sweep.hourly[h]?.elevation_deg ?? -10)
    : Array.from({ length: 24 }, (_, h) => Math.max(-20, 70 * Math.sin((h - 6) * Math.PI / 12)));

  const hourlyUV = Array.from({ length: 24 }, (_, h) => {
    if (h < 5 || h > 20) return 0;
    const base = 5;
    return Math.max(0, base * Math.sin((h - 5) * Math.PI / 15));
  });

  const hourlyTemps = Array.from({ length: 24 }, () => 20);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="⏰" label="Sunrise"        accent="solar"   value={solar?.sunrise ?? "—"} />
        <StatCard icon="🌅" label="Sunset"         accent="solar"   value={solar?.sunset  ?? "—"} />
        <StatCard icon="☀️" label="Peak Sun Hours" accent="solar"   value={solar?.peak_sun_hours ? `${solar.peak_sun_hours}h` : "—"} />
        <StatCard icon="⚡" label="Annual Energy"  accent="neutral" value={solar?.annual_ac_kwh ? `${Math.round(solar.annual_ac_kwh).toLocaleString()} kWh` : "—"} sub="est. PV output" />
      </div>

      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>
          {toDateStr(selectedDate) === toDateStr(new Date())
            ? "Today's Sun Path"
            : `Sun Path — ${selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
        </SectionTitle>
        <SunArcVisualization lat={location.lat} lon={location.lon} date={selectedDate} />
      </div>

      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Hourly Sun Elevation</SectionTitle>
        <HourlyTimeline hourlyTemps={hourlyTemps} hourlyUV={hourlyUV} hourlySolarElevation={hourlyElev} date={selectedDate} />
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-2 text-sm">
        <SectionTitle>Solar Stats</SectionTitle>
        {[
          ["Solar noon",    solar?.solar_noon ?? "—"],
          ["Max elevation", solar?.max_elevation_deg == null ? "—" : `${solar.max_elevation_deg.toFixed(1)}°`],
          ["Day length",    solar?.day_length_hours   == null ? "—" : `${solar.day_length_hours.toFixed(1)} hours`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-th-border pb-2 last:border-0 last:pb-0">
            <span className="text-th-muted">{k}</span>
            <span className="text-th-text font-semibold">{v}</span>
          </div>
        ))}
        <AIInsightCard
          prompt={`Explain the solar potential for ${location.formatted_address} in 2 sentences. Current max elevation: ${solar?.max_elevation_deg?.toFixed(1)}°, ${solar?.peak_sun_hours}h peak sun.`}
          context={{ lat: location.lat, lon: location.lon, solar }}
        />
      </div>

      <SolarROICalculator lat={location.lat} lon={location.lon} state={location.state} />
    </div>
  );
}

// ── Tab: Weather ───────────────────────────────────────────────────────────────

function WeatherTab({ location }: Readonly<{ location: Location }>) {
  const [weather,  setWeather]  = useState<WeatherData | null>(null);
  const [monthly,  setMonthly]  = useState<MonthlyDataPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);

  useEffect(() => {
    void fetchJson<WeatherData>(`${API}/weather/current?lat=${location.lat}&lon=${location.lon}`).then(setWeather);
    void fetchJson<{ days: ForecastDay[] }>(`${API}/weather/forecast?lat=${location.lat}&lon=${location.lon}&days=7`)
      .then((d) => { if (d) setForecast(d.days); });
    void fetchJson<{ monthly: Array<{ month: number; avg_temp_max_c: number; avg_temp_min_c: number }> }>(
      `${API}/weather/monthly?lat=${location.lat}&lon=${location.lon}`,
    ).then((d) => {
      if (!d) return;
      setMonthly(d.monthly.map((m) => ({
        month: MONTH_LABELS[m.month - 1] ?? "?",
        value: Math.round(m.avg_temp_max_c),
        label: `High ${m.avg_temp_max_c.toFixed(1)}°C`,
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
  const hourlyElev = Array.from({ length: 24 }, (_, h) =>
    Math.max(-20, 70 * Math.sin((h - 6) * Math.PI / 12)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="🌡️" label="Temperature" accent="weather"
          value={weather?.temp_c == null ? "—" : `${Math.round(weather.temp_c)}°C`}
          sub={weather?.feels_like_c == null ? undefined : `Feels ${Math.round(weather.feels_like_c)}°C`} />
        <StatCard icon="💧" label="Humidity" accent="neutral"
          value={weather?.humidity_pct == null ? "—" : `${weather.humidity_pct}%`} />
        <StatCard icon="🔆" label="UV Index" accent={weather?.uv_index == null || weather.uv_index < 8 ? "solar" : "danger"}
          value={weather?.uv_index == null ? "—" : String(weather.uv_index)}
          sub={weather?.uv_index == null || weather.uv_index < 6 ? "Moderate" : "⚠️ High"} />
        <StatCard icon="😊" label="Comfort Score" accent="weather"
          value={weather?.comfort_score == null ? "—" : `${weather.comfort_score}/100`}
          sub={weather?.comfort_level} />
      </div>

      {monthly.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <MonthlyHeatmap data={monthly} metric="heat" title="Monthly Avg High Temperature (°C)" />
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
              const dayLabel  = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
              const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={day.date} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-th-bg-2 border border-th-border text-center">
                  <div className="text-[10px] font-bold text-th-text">{dayLabel}</div>
                  <div className="text-[9px] text-th-muted">{dateLabel}</div>
                  <div className="text-xl leading-none my-0.5">{weatherEmoji(day.weather_code)}</div>
                  <div className="text-xs font-bold text-amber-400">{Math.round(day.temp_max_c)}°</div>
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

      <div className="glass-card rounded-2xl p-5">
        <AIInsightCard
          prompt={`What are the most important weather and climate considerations for living at ${location.formatted_address}? Current temp: ${weather?.temp_c}°C, UV: ${weather?.uv_index}. Give 2-3 actionable points.`}
          context={{ lat: location.lat, lon: location.lon, weather }}
        />
      </div>
    </div>
  );
}

// ── Tab: Moon ──────────────────────────────────────────────────────────────────

function MoonTab({ location, selectedDate }: Readonly<{ location: Location; selectedDate: Date }>) {
  const [moon, setMoon] = useState<MoonData | null>(null);

  useEffect(() => {
    void fetchJson<MoonData>(
      `${API}/moon/daily?lat=${location.lat}&lon=${location.lon}&date=${toDateStr(selectedDate)}`,
    ).then(setMoon);
  }, [location, selectedDate]);

  if (!moon) return <GridSkeleton count={4} />;

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
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <SectionTitle>Moon Position</SectionTitle>
          {moon.position && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="🧭" label="Azimuth"   accent="moon" value={`${moon.position.azimuth_deg.toFixed(1)}°`} />
              <StatCard icon="📐" label="Elevation" accent="moon" value={`${moon.position.elevation_deg.toFixed(1)}°`} />
            </div>
          )}
          {moon.phase && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-th-border pb-2">
                <span className="text-th-muted">Phase</span>
                <span className="text-th-text font-semibold">{moon.phase.emoji} {moon.phase.phase_name}</span>
              </div>
              <div className="flex justify-between border-b border-th-border pb-2">
                <span className="text-th-muted">Illumination</span>
                <span className="text-th-text font-semibold">{moon.phase.illumination_pct.toFixed(0)}%</span>
              </div>
              {moon.night_visibility && (
                <div className="flex justify-between">
                  <span className="text-th-muted">Night visibility</span>
                  <span className="text-th-text font-semibold">{moon.night_visibility.level}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="glass-card rounded-2xl p-5">
        <AIInsightCard
          prompt={`Briefly explain how the current moon phase (${moon.phase?.phase_name}, ${moon.phase?.illumination_pct?.toFixed(0)}% illuminated) affects outdoor activities and visibility at ${location.formatted_address}.`}
          context={{ lat: location.lat, lon: location.lon, moon }}
        />
      </div>
    </div>
  );
}

// ── Mold gauge ─────────────────────────────────────────────────────────────────

function moldGaugeColor(idx: number): string {
  if (idx >= 7) return "#ef4444";
  if (idx >= 4) return "#f97316";
  if (idx >= 2) return "#eab308";
  return "#10b981";
}

// ── Tab: Impact ────────────────────────────────────────────────────────────────

type CarHeatRow = { hours: number; interior_temp_c: number; risk_level: string; temp_rise_c: number };

function ImpactTab({ location, selectedDate }: Readonly<{ location: Location; selectedDate: Date }>) {
  const [monthly, setMonthly] = useState<MonthlyDataPoint[]>([]);
  const [mold, setMold] = useState<{
    mold_index: number; risk_level: string;
    contributing_factors: string[]; recommendations: string[];
  } | null>(null);
  const [aq, setAq] = useState<{
    aqi: number | null; aqi_category: string | null; aqi_color: string | null;
    station_name: string | null; distance_km: number | null;
    pollutants: Array<{ parameter: string; value: number; unit: string }>;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{ solar: SolarData; weather: WeatherData } | null>(null);
  const [dailySolar, setDailySolar] = useState<SolarData | null>(null);
  const [carHeat, setCarHeat] = useState<CarHeatRow[]>([]);

  // Format selected date for display
  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
  const isToday = toDateStr(selectedDate) === toDateStr(new Date());

  useEffect(() => {
    void fetchJson<{ monthly: Array<{ month: number; avg_temp_max_c: number }> }>(
      `${API}/weather/monthly?lat=${location.lat}&lon=${location.lon}`,
    ).then(async (d) => {
      if (!d) return;
      const temps = d.monthly.map((m) => m.avg_temp_max_c);
      const comfort = await fetchJson<{ monthly: Array<{ month: number; comfort_score: number; label: string }> }>(
        `${API}/impact/comfort?monthly_data=${encodeURIComponent(JSON.stringify(temps))}`,
      );
      if (!comfort) return;
      setMonthly(comfort.monthly.map((m) => ({
        month: MONTH_LABELS[m.month - 1] ?? "?",
        value: Math.round(m.comfort_score),
        label: m.label,
      })));
    });

    void fetchJson<typeof mold>(`${API}/impact/mold-risk?lat=${location.lat}&lon=${location.lon}`).then(setMold);
    void fetchJson<typeof aq>(`${API}/impact/air-quality?lat=${location.lat}&lon=${location.lon}`).then(setAq);
    void fetchJson<{ solar: SolarData; weather: WeatherData }>(
      `${API}/property/snapshot?lat=${location.lat}&lon=${location.lon}`,
    ).then(setSnapshot);
  }, [location]);

  // Re-fetch solar elevation for the selected date so irradiance is date-accurate
  useEffect(() => {
    void fetchJson<SolarData>(
      `${API}/solar/daily?lat=${location.lat}&lon=${location.lon}&date=${toDateStr(selectedDate)}`,
    ).then(setDailySolar);
    setCarHeat([]); // clear while refetching
  }, [location, selectedDate]);

  useEffect(() => {
    if (!snapshot || !dailySolar) return;
    const tempC = snapshot.weather.temp_c ?? 25;
    const maxElev = dailySolar.max_elevation_deg ?? snapshot.solar.max_elevation_deg ?? 45;
    const irradiance = Math.round(950 * Math.sin(maxElev * Math.PI / 180));
    void Promise.all(
      [1, 2, 4].map((h) =>
        fetchJson<{ interior_temp_c: number; risk_level: string; temp_rise_c: number }>(
          `${API}/impact/car-heat?outdoor_temp_c=${tempC}&irradiance_w_m2=${irradiance}&hours_parked=${h}`,
        ).then((r) => (r ? { hours: h, ...r } : null)),
      ),
    ).then((rows) => { setCarHeat(rows.filter((r): r is CarHeatRow => r !== null)); });
  }, [snapshot, dailySolar]);

  const moldTextColor: Record<string, string> = {
    low: "text-emerald-400", moderate: "text-yellow-400",
    high: "text-orange-400", extreme: "text-red-400",
  };

  const riskColor: Record<string, string> = {
    Safe: "text-emerald-400", Warm: "text-yellow-400", Hot: "text-orange-400",
    Dangerous: "text-red-400", Deadly: "text-red-500",
  };

  const tempC = snapshot?.weather.temp_c;
  const maxElev = dailySolar?.max_elevation_deg ?? snapshot?.solar.max_elevation_deg;
  const irradiance = maxElev !== undefined ? Math.round(950 * Math.sin(maxElev * Math.PI / 180)) : null;

  // Direction solar flux factors (fraction of peak irradiance hitting the surface)
  const facadeDirections = [
    { dir: "South", emoji: "↓", factor: 1.0,  note: "Maximum gain at solar noon" },
    { dir: "West",  emoji: "←", factor: 0.72, note: "Peak in afternoon — most problematic in summer" },
    { dir: "East",  emoji: "→", factor: 0.72, note: "Morning sun, cooler afternoons" },
    { dir: "North", emoji: "↑", factor: 0.08, note: "Minimal direct solar gain year-round" },
  ];

  return (
    <div className="space-y-6">
      {monthly.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <MonthlyHeatmap data={monthly} metric="comfort" title="Monthly Outdoor Comfort Score" />
        </div>
      )}

      {/* Mold risk */}
      <div className="glass-card rounded-2xl p-5">
        <SectionTitle>Mold Risk Index</SectionTitle>
        {mold ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 shrink-0">
                <svg viewBox="0 0 36 36" aria-label={`Mold risk: ${mold.mold_index}/10`} className="w-full -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-th-border" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={moldGaugeColor(mold.mold_index)} strokeWidth="3"
                    strokeDasharray={`${(mold.mold_index / 10) * 100} 100`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-lg font-bold ${moldTextColor[mold.risk_level] ?? "text-th-text"}`}>{mold.mold_index}</span>
                  <span className="text-[9px] text-th-muted">/10</span>
                </div>
              </div>
              <div>
                <p className={`font-semibold capitalize text-sm ${moldTextColor[mold.risk_level] ?? ""}`}>{mold.risk_level} Risk</p>
                <ul className="mt-1 space-y-0.5">
                  {mold.contributing_factors.map((f) => <li key={f} className="text-[11px] text-th-muted">• {f}</li>)}
                </ul>
              </div>
            </div>
            {mold.recommendations.length > 0 && (
              <div className="bg-th-bg-2 rounded-xl p-3 text-xs space-y-1">
                {mold.recommendations.map((r) => <p key={r} className="text-th-text-2">• {r}</p>)}
              </div>
            )}
          </div>
        ) : <div className="skeleton h-20 rounded-lg" />}
      </div>

      {/* Air quality */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-th-text">Air Quality Index</h2>
          {aq?.station_name && (
            <span className="text-[10px] text-th-muted">{aq.station_name} · {aq.distance_km} km</span>
          )}
        </div>
        {!aq ? (
          <div className="skeleton h-20 rounded-lg" />
        ) : aq.aqi === null ? (
          <p className="text-sm text-th-muted">No monitoring station within 25 km.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl border border-th-border bg-th-bg-2">
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
        )}
      </div>

      {/* Car heat — driven by selected date's solar elevation + current weather temp */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Car Interior Heat — {isToday ? "Today" : dateLabel}</SectionTitle>
          {tempC !== undefined && irradiance !== null && (
            <span className="text-[10px] text-th-muted bg-th-bg-2 px-2 py-0.5 rounded-full">
              {tempC}°C · {irradiance} W/m²
            </span>
          )}
        </div>
        {!snapshot || !dailySolar ? (
          <div className="skeleton h-20 rounded-lg" />
        ) : carHeat.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-th-muted">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            Calculating…
          </div>
        ) : (
          <>
            <p className="text-xs text-th-muted mb-3">
              Solar elevation on <strong className="text-th-text">{dateLabel}</strong>: {maxElev !== undefined ? `${Math.round(maxElev)}°` : "—"}.
              Estimated peak irradiance {irradiance !== null ? `${irradiance} W/m²` : "—"},
              outdoor temp {tempC !== undefined ? `${tempC}°C` : "—"}.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {carHeat.map((row) => (
                <div key={row.hours} className="rounded-xl border border-th-border bg-th-bg-2 p-3 text-center">
                  <div className="text-[10px] text-th-muted mb-1">{row.hours}h parked</div>
                  <div className={`text-2xl font-bold ${riskColor[row.risk_level] ?? "text-th-text"}`}>
                    {Math.round(row.interior_temp_c)}°C
                  </div>
                  <div className="text-[10px] text-th-muted">+{Math.round(row.temp_rise_c)}°C above outdoor</div>
                  <div className={`text-[10px] font-semibold mt-1 ${riskColor[row.risk_level] ?? "text-th-text"}`}>
                    {row.risk_level}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Facade heat — dynamic based on selected date's solar angle */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Facade Solar Heat Exposure — {isToday ? "Today" : dateLabel}</SectionTitle>
          {maxElev !== undefined && (
            <span className="text-[10px] text-th-muted bg-th-bg-2 px-2 py-0.5 rounded-full">
              Peak elevation {Math.round(maxElev)}°
            </span>
          )}
        </div>
        {!snapshot || !dailySolar ? (
          <div className="skeleton h-20 rounded-lg" />
        ) : (
          <>
            <p className="text-xs text-th-muted mb-3">
              Solar flux on each wall at peak sun angle on <strong className="text-th-text">{dateLabel}</strong>
              {maxElev !== undefined ? ` (${Math.round(maxElev)}° elevation` : ""}
              {irradiance !== null ? `, ${irradiance} W/m² clear-sky)` : ")."}.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {facadeDirections.map(({ dir, emoji, factor, note }) => {
                const flux = irradiance !== null ? Math.round(irradiance * factor) : null;
                const intensity = flux !== null && flux > 600 ? "text-red-400"
                  : flux !== null && flux > 300 ? "text-orange-400"
                  : flux !== null && flux > 100 ? "text-yellow-400"
                  : "text-emerald-400";
                return (
                  <div key={dir} className="rounded-xl border border-th-border bg-th-bg-2 p-3 text-center">
                    <div className="text-lg mb-0.5">{emoji}</div>
                    <div className="text-xs font-semibold text-th-text">{dir}</div>
                    <div className={`text-lg font-bold mt-1 ${intensity}`}>
                      {flux !== null ? `${flux}` : "—"}
                    </div>
                    <div className="text-[9px] text-th-muted">W/m²</div>
                    <div className="text-[9px] text-th-muted mt-1 leading-tight">{note}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="mt-3">
          <AIInsightCard
            prompt={`What are the main environmental health and climate impact concerns for a property at ${location.formatted_address}? Mention air quality, mold risk, and heat exposure in 3 bullet points.`}
            context={{ lat: location.lat, lon: location.lon, mold_index: mold?.mold_index, aqi: aq?.aqi, irradiance_w_m2: irradiance }}
          />
        </div>
      </div>
    </div>
  );
}


// ── Tab: AI ────────────────────────────────────────────────────────────────────

function AITab({ location }: Readonly<{ location: Location }>) {
  const [suggested, setSuggested] = useState<string[]>([]);
  const [solar,   setSolar]   = useState<SolarData   | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    void fetchJson<{ solar: SolarData; weather: WeatherData }>(
      `${API}/property/snapshot?lat=${location.lat}&lon=${location.lon}`,
    ).then((d) => { if (d) { setSolar(d.solar); setWeather(d.weather); } });
  }, [location]);

  const propertyData = {
    address:          location.formatted_address,
    lat:              location.lat,
    lon:              location.lon,
    city:             location.city,
    state:            location.state,
    peak_sun_hours:   solar?.peak_sun_hours,
    annual_kwh:       solar?.annual_ac_kwh,
    sunrise:          solar?.sunrise,
    sunset:           solar?.sunset,
    day_length_hours: solar?.day_length_hours,
    max_elevation:    solar?.max_elevation_deg,
    temp_c:           weather?.temp_c,
    uv_index:         weather?.uv_index,
    humidity_pct:     weather?.humidity_pct,
    conditions:       weather?.conditions,
    wind_kmh:         weather?.wind_kmh,
  };

  useEffect(() => {
    void fetch(`${API}/ai/suggested-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_data: propertyData }),
    })
      .then((r) => r.json())
      .then((d: { questions?: string[] }) => { if (d.questions) setSuggested(d.questions); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.formatted_address]);

  return (
    <div className="space-y-4">
      {/* Capabilities overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: "☀️", label: "Solar Analysis",   desc: "ROI, orientation, shading" },
          { icon: "🌡️", label: "Climate Risks",    desc: "Heat, frost, humidity" },
          { icon: "🏠", label: "Property Impact",  desc: "Energy, comfort, mold" },
          { icon: "🌙", label: "Moon & Night",     desc: "Visibility, phases, tides" },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="glass-card rounded-xl p-3 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-xs font-semibold text-th-text">{label}</div>
            <div className="text-[10px] text-th-muted mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-5 flex flex-col" style={{ height: 560 }}>
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <span className="text-xl">🤖</span>
          <div>
            <h2 className="font-semibold text-th-text text-sm">HelioNest AI Assistant</h2>
            <p className="text-[11px] text-th-muted">Multi-agent · Solar · Weather · Climate</p>
          </div>
          <span className="badge-moon ml-auto text-[10px]">Claude · Powered</span>
        </div>
        <AIChat
          propertyData={propertyData as Record<string, unknown>}
          suggestedQuestions={suggested}
          className="flex-1 min-h-0"
        />
      </div>
    </div>
  );
}

// ── Tab: 3D View ───────────────────────────────────────────────────────────────

function ThreeDTab({ location }: Readonly<{ location: Location }>) {
  const [mode, setMode] = useState<"3d" | "360">("3d");

  return (
    <div className="space-y-4">
      {/* Mode switcher */}
      <div className="flex items-center gap-2">
        {(["3d", "360"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              mode === m
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "text-th-text-2 border-th-border hover:text-th-text hover:bg-th-bg-2"
            }`}>
            {m === "3d" ? "🌐 3D Scene" : "🔭 360° Sky Dome"}
          </button>
        ))}
      </div>

      <Suspense fallback={
        <div className="h-[480px] rounded-2xl bg-th-bg-2 border border-th-border flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-th-muted">Loading 3D scene…</p>
          </div>
        </div>
      }>
        {mode === "3d" && (
          <div aria-label="3D property model with animated sun and shadows" className="rounded-2xl overflow-hidden border border-th-border">
            <PropertyView3D lat={location.lat} lon={location.lon} />
          </div>
        )}
        {mode === "360" && (
          <div aria-label="360-degree sky dome view" className="rounded-2xl overflow-hidden border border-th-border">
            <PropertyView360 lat={location.lat} lon={location.lon} />
          </div>
        )}
      </Suspense>

      <div className="glass-card rounded-2xl p-4 text-xs text-th-muted space-y-1">
        <p>🛰 Satellite imagery: ESRI World Imagery</p>
        <p>🏢 Buildings: OpenStreetMap contributors</p>
        <p>☀️ Sun position: NOAA solar algorithm</p>
      </div>
    </div>
  );
}

// ── Address header ─────────────────────────────────────────────────────────────

function AddressHeader({ location, loading, error, onShare }: Readonly<{
  location: Location | null; loading: boolean; error: string | null;
  onShare?: () => void;
}>) {
  if (loading) return (
    <div className="px-4 sm:px-6 py-3 border-b border-th-border bg-th-bg">
      <div className="skeleton h-5 w-64 rounded-lg mb-1.5" />
      <div className="skeleton h-3.5 w-44 rounded" />
    </div>
  );
  if (error) return (
    <div className="px-4 sm:px-6 py-4 border-b border-th-border bg-th-bg flex items-center gap-3">
      <p className="text-sm text-th-danger flex-1">{error}</p>
      <Link
        href="/"
        className="text-xs px-3 py-1.5 rounded-lg border border-th-border text-th-text-2 hover:text-th-text hover:bg-th-bg-2 transition-all shrink-0"
      >
        Try another address
      </Link>
    </div>
  );
  if (!location) return null;

  const cityState = [location.city, location.state].filter(Boolean).join(", ");

  return (
    <div className="px-4 sm:px-6 border-b border-th-border bg-th-bg">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] text-th-muted pt-2 pb-1 overflow-x-auto no-scrollbar">
        <Link href="/" className="hover:text-th-text transition-colors shrink-0">Home</Link>
        {cityState && (
          <>
            <span aria-hidden="true" className="shrink-0">›</span>
            <Link
              href={`/?q=${encodeURIComponent(cityState)}`}
              className="hover:text-th-text transition-colors shrink-0"
            >{cityState}</Link>
          </>
        )}
        <span aria-hidden="true" className="shrink-0">›</span>
        <span className="text-th-text-2 truncate">{location.formatted_address}</span>
      </nav>

      {/* Address + share row */}
      <div className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-th-text leading-tight truncate">{location.formatted_address}</h1>
          <p className="text-[11px] text-th-text-2 mt-0.5">
            {location.lat.toFixed(4)}°N · {Math.abs(location.lon).toFixed(4)}°W
            {location.zip && ` · ZIP ${location.zip}`}
          </p>
        </div>
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg border border-th-border bg-th-bg-2 text-th-text-2 hover:text-th-text hover:border-amber-500/40 transition-all flex items-center gap-1.5"
          >
            Share
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PropertyPage({ params }: Readonly<{ params: Promise<{ address: string }> }>) {
  const { address } = use(params);
  const router      = useRouter();
  const decoded     = decodeURIComponent(address);

  const [location,     setLocation]     = useState<Location | null>(null);
  const [activeTab,    setActiveTab]    = useState<Tab>("overview");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [alerts,       setAlerts]       = useState<PropertyAlert[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Restore active tab from URL hash on mount
  useEffect(() => {
    const hash = globalThis.location?.hash?.slice(1) as Tab | undefined;
    if (hash && TABS.find((t) => t.id === hash)) setActiveTab(hash);
  }, []);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    try { globalThis.history?.replaceState(null, "", `#${tab}`); } catch { /* ignore */ }
  }

  function handleShare() {
    const url = globalThis.location?.href ?? "";
    navigator.clipboard.writeText(url)
      .then(() => { showToast("Link copied to clipboard!"); })
      .catch(() => { showToast("Could not copy — try manually."); });
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const loc = await geocodeAddress(decoded);
        setLocation(loc);
        incrementPropertyViews();

        const weather = await fetchJson<WeatherData>(`${API}/weather/current?lat=${loc.lat}&lon=${loc.lon}`);
        if (weather) {
          const built: PropertyAlert[] = [];
          if (weather.temp_c != null && weather.temp_c >= 38)
            built.push({ id: "heat", severity: "danger",  title: "Extreme Heat",  description: `${Math.round(weather.temp_c)}°C — avoid prolonged outdoor exposure.`, icon: "🔥" });
          else if (weather.temp_c != null && weather.temp_c >= 32)
            built.push({ id: "heat", severity: "warning", title: "High Heat",     description: `Temperature is ${Math.round(weather.temp_c)}°C.`, icon: "🌡️" });
          if (weather.uv_index != null && weather.uv_index >= 11)
            built.push({ id: "uv",   severity: "danger",  title: "Extreme UV",   description: `UV index ${weather.uv_index} — skin burns in minutes.`, icon: "☀️" });
          else if (weather.uv_index != null && weather.uv_index >= 8)
            built.push({ id: "uv",   severity: "warning", title: "High UV",      description: `UV index ${weather.uv_index} — wear sunscreen.`, icon: "🕶️" });
          if (weather.temp_c != null && weather.temp_c <= 0)
            built.push({ id: "freeze", severity: "danger", title: "Freeze Risk", description: `${Math.round(weather.temp_c)}°C — black ice and pipe risk.`, icon: "❄️" });
          setAlerts(built);
        }
      } catch {
        setError(
          `Could not find "${decoded}". Try including the city and state — e.g. "1003 Tundra Swan Dr, Charlotte, NC 28277".`
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [decoded]);

  const needsDate = activeTab !== "ai" && activeTab !== "3d";

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-[9999] flex items-center gap-2 bg-gray-900 border border-white/10 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-sm animate-fade-in"
        >
          <span className="text-emerald-400">✓</span>
          {toast}
        </div>
      )}

      <Navbar />

      {/* ── Inline search bar ──────────────────────────────────────────────── */}
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
              defaultValue=""
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
                  { timeout: 10_000 },
                );
              }}
              className="px-3 py-2 rounded-xl border border-th-border bg-th-bg-2 text-th-text-2 hover:text-th-solar hover:border-th-solar/40 transition-all"
            >📍</button>
            <button type="submit" className="btn-solar px-4 py-2 rounded-xl text-sm font-semibold">Go</button>
          </form>
        </div>
      </div>

      <AddressHeader location={location} loading={loading} error={error} onShare={handleShare} />

      {/* ── Hero shadow map ────────────────────────────────────────────────── */}
      {!error && (
        <div className={`w-full border-b border-th-border transition-all ${heroExpanded ? "h-[600px]" : "h-[420px]"}`}>
          {location ? (
            <Suspense fallback={
              <div className="w-full h-full bg-gray-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
              </div>
            }>
              <PropertyMap2D
                lat={location.lat}
                lon={location.lon}
                address={location.formatted_address}
                initialDate={selectedDate}
                className="w-full h-full rounded-none"
              />
            </Suspense>
          ) : (
            <div className="w-full h-full bg-gray-950 animate-pulse" />
          )}
          {/* Expand / collapse toggle */}
          <div className="absolute right-4 z-[1001]" style={{ marginTop: heroExpanded ? -628 : -448 }}>
            <button
              type="button"
              onClick={() => setHeroExpanded((v) => !v)}
              className="bg-black/70 hover:bg-black/90 text-white/70 hover:text-white text-[10px] font-semibold px-2 py-1 rounded border border-white/10 backdrop-blur-sm transition-all"
              title={heroExpanded ? "Collapse map" : "Expand map"}
            >
              {heroExpanded ? "▲ Collapse" : "▼ Expand"}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="border-b border-th-border bg-th-bg sticky top-[calc(3.5rem+2.75rem+1.75rem)] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div
            role="tablist"
            aria-label="Property information tabs"
            tabIndex={-1}
            className="flex gap-0.5 overflow-x-auto no-scrollbar py-1.5"
            onKeyDown={(e) => {
              const idx = TABS.findIndex((t) => t.id === activeTab);
              let next: Tab | null = null;
              if (e.key === "ArrowRight") next = TABS[(idx + 1) % TABS.length].id;
              else if (e.key === "ArrowLeft") next = TABS[(idx - 1 + TABS.length) % TABS.length].id;
              else if (e.key === "Home") next = TABS[0].id;
              else if (e.key === "End")  next = TABS.at(-1)!.id;
              if (next) {
                e.preventDefault();
                handleTabChange(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            {TABS.map(({ id, label, icon }) => {
              const base = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70";
              const isActive = activeTab === id;
              return (
                <button
                  key={id} id={`tab-${id}`} type="button" role="tab"
                  aria-selected={isActive} aria-controls={`panel-${id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => handleTabChange(id)}
                  className={`${base} ${
                    isActive
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "text-th-text-2 border border-transparent hover:text-th-text hover:bg-th-bg-2"
                  }`}
                >
                  <span aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {location && needsDate && (
          <DateBar date={selectedDate} onChange={setSelectedDate} />
        )}

        {loading ? (
          <GridSkeleton count={4} />
        ) : location ? (
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
            {activeTab === "impact"   && <ImpactTab   location={location} selectedDate={selectedDate} />}
            {activeTab === "ai"       && <AITab        location={location} />}
            {activeTab === "3d"       && <ThreeDTab    location={location} />}
          </div>
        ) : null}
      </main>
    </div>
  );
}
