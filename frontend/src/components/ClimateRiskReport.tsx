"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface YearlyTrend {
  year: number;
  avg_temp_c: number;
  total_precip_mm: number;
  max_wind_kmh: number;
}

interface ClimateData {
  years: number;
  yearly: YearlyTrend[];
  temp_trend_per_decade: number;
  precip_trend_pct_per_decade: number;
  wind_trend_per_decade: number;
  hottest_year: number;
  coldest_year: number;
  wettest_year: number;
  driest_year: number;
  monthly_avg_temp_c: number[];
}

interface Props {
  lat: number;
  lon: number;
}

// Simple D3-free SVG line chart
function TrendLineChart({ data, label, color }: {
  data: { x: number; y: number }[];
  label: string;
  color: string;
}) {
  if (data.length < 2) return null;
  const W = 280, H = 80, PAD = { t: 8, r: 8, b: 20, l: 36 };
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;

  const px = (x: number) => PAD.l + ((x - minX) / (maxX - minX || 1)) * (W - PAD.l - PAD.r);
  const py = (y: number) => PAD.t + (1 - (y - minY) / rangeY) * (H - PAD.t - PAD.b);

  const pts = data.map((d) => `${px(d.x)},${py(d.y)}`).join(" ");

  // Trend line endpoints
  const slope = (ys[ys.length - 1] - ys[0]) / (xs.length - 1);
  const t1y = ys[0];
  const t2y = t1y + slope * (xs.length - 1);

  return (
    <div>
      <p className="text-[10px] text-th-muted mb-1">{label}</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
        {/* Y axis label */}
        <text x={2} y={PAD.t + 4} fontSize="7" fill="currentColor" className="text-th-muted" opacity="0.6">
          {maxY.toFixed(1)}
        </text>
        <text x={2} y={H - PAD.b + 4} fontSize="7" fill="currentColor" className="text-th-muted" opacity="0.6">
          {minY.toFixed(1)}
        </text>
        {/* Grid lines */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.l} y1={PAD.t + f * (H - PAD.t - PAD.b)}
            x2={W - PAD.r} y2={PAD.t + f * (H - PAD.t - PAD.b)}
            stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.8"
            className="text-th-border"
          />
        ))}
        {/* Trend line */}
        <line
          x1={px(xs[0])} y1={py(t1y)}
          x2={px(xs[xs.length - 1])} y2={py(t2y)}
          stroke={color} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 3"
        />
        {/* Data line */}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Data points */}
        {data.map((d, i) => (
          <circle key={i} cx={px(d.x)} cy={py(d.y)} r="2.5" fill={color} opacity="0.8" />
        ))}
        {/* X axis year labels */}
        {data.filter((_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 4) === 0).map((d) => (
          <text key={d.x} x={px(d.x)} y={H - 4} fontSize="7" textAnchor="middle" fill="currentColor" className="text-th-muted" opacity="0.6">
            {d.x}
          </text>
        ))}
      </svg>
    </div>
  );
}

function trendLabel(val: number, unit: string, positive = "warming") {
  if (Math.abs(val) < 0.05) return { text: "Stable", color: "text-emerald-500" };
  const dir = val > 0 ? positive : positive === "warming" ? "cooling" : "drying";
  const color = val > 0 && positive === "warming" ? "text-orange-400" : val > 0 ? "text-blue-400" : "text-emerald-400";
  return { text: `${Math.abs(val).toFixed(2)} ${unit}/decade ${dir}`, color };
}

export default function ClimateRiskReport({ lat, lon }: Props) {
  const [data, setData] = useState<ClimateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API}/weather/climate?lat=${lat}&lon=${lon}&years=10`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [lat, lon]);

  if (loading) return (
    <div className="glass-card p-5 flex items-center gap-3 text-sm text-th-muted">
      <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      Loading 10-year climate data…
    </div>
  );

  if (error || !data) return (
    <div className="glass-card p-5 text-sm text-th-muted text-center">
      Climate data unavailable for this location.
    </div>
  );

  const tempTrend = trendLabel(data.temp_trend_per_decade, "°C");
  const precipTrend = trendLabel(data.precip_trend_pct_per_decade, "%", "wetter");

  const tempPoints = data.yearly.map((y) => ({ x: y.year, y: y.avg_temp_c }));
  const precipPoints = data.yearly.map((y) => ({ x: y.year, y: y.total_precip_mm }));

  return (
    <div className="glass-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-th-text">Climate Risk — {data.years}-Year Trends</h3>
        <span className="text-[10px] text-th-muted bg-th-bg-2 px-2 py-0.5 rounded-full">Open-Meteo Archive</span>
      </div>

      {/* Risk badges */}
      <div className="flex flex-wrap gap-2">
        <div className={`text-xs px-3 py-1.5 rounded-full font-medium bg-th-bg-2 border border-th-border ${tempTrend.color}`}>
          🌡 {tempTrend.text}
        </div>
        <div className={`text-xs px-3 py-1.5 rounded-full font-medium bg-th-bg-2 border border-th-border ${precipTrend.color}`}>
          🌧 {precipTrend.text}
        </div>
        {Math.abs(data.wind_trend_per_decade) > 0.5 && (
          <div className="text-xs px-3 py-1.5 rounded-full font-medium bg-th-bg-2 border border-th-border text-blue-400">
            💨 {Math.abs(data.wind_trend_per_decade).toFixed(1)} km/h/decade {data.wind_trend_per_decade > 0 ? "windier" : "calmer"}
          </div>
        )}
      </div>

      {/* Temperature trend chart */}
      <TrendLineChart
        data={tempPoints}
        label="Annual avg temperature (°C)"
        color="#f59e0b"
      />

      {/* Precipitation trend chart */}
      <TrendLineChart
        data={precipPoints}
        label="Annual precipitation (mm)"
        color="#60a5fa"
      />

      {/* Extremes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          { icon: "🔥", label: "Hottest year", value: data.hottest_year },
          { icon: "❄️", label: "Coldest year", value: data.coldest_year },
          { icon: "🌊", label: "Wettest year", value: data.wettest_year },
          { icon: "🏜", label: "Driest year",  value: data.driest_year  },
        ].map((s) => (
          <div key={s.label} className="bg-th-bg-2 border border-th-border rounded-lg p-2 text-center">
            <div className="text-base mb-0.5">{s.icon}</div>
            <div className="font-bold text-th-text">{s.value}</div>
            <div className="text-th-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
