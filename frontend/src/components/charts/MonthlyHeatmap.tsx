"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface MonthlyDataPoint {
  month: string;  // "Jan", "Feb", …
  value: number;  // 0–100
  label: string;  // e.g. "72 comfort score"
}

interface MonthlyHeatmapProps {
  data: MonthlyDataPoint[];
  metric: "comfort" | "uv" | "heat" | "irradiance";
  title: string;
}

const MONTH_ORDER = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Returns an HSL color string: green→yellow→red (0=green, 100=red) or inverted. */
function metricColor(value: number, metric: MonthlyHeatmapProps["metric"]): string {
  // comfort: high = good (green). uv/heat/irradiance: high = bad (red)
  const pct = metric === "comfort" ? 1 - value / 100 : value / 100;
  // hue: 120 (green) → 60 (yellow) → 0 (red)
  const hue = Math.round(120 - pct * 120);
  return `hsl(${hue}, 75%, 45%)`;
}

function metricBg(value: number, metric: MonthlyHeatmapProps["metric"]): string {
  const pct = metric === "comfort" ? 1 - value / 100 : value / 100;
  const hue = Math.round(120 - pct * 120);
  return `hsl(${hue}, 60%, 18%)`;
}

const METRIC_LABELS: Record<string, string> = {
  comfort: "Comfort Score",
  uv:      "UV Index",
  heat:    "Heat Score",
  irradiance: "Solar Irradiance",
};

export function MonthlyHeatmap({ data, metric, title }: MonthlyHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ month: string; value: number; label: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Build a lookup map so ordering is always Jan–Dec
  const lookup: Record<string, MonthlyDataPoint> = {};
  data.forEach((d) => { lookup[d.month] = d; });

  const sorted = MONTH_ORDER.map((m) => lookup[m] ?? { month: m, value: 0, label: "No data" });

  // Apply dynamic colors imperatively to avoid inline style JSX attributes
  useLayoutEffect(() => {
    if (!gridRef.current) return;
    sorted.forEach((d) => {
      const btn = gridRef.current!.querySelector<HTMLButtonElement>(`[data-month="${d.month}"]`);
      if (!btn) return;
      btn.style.backgroundColor = metricBg(d.value, metric);
      const valEl = btn.querySelector<HTMLElement>("[data-value]");
      if (valEl) valEl.style.color = metricColor(d.value, metric);
    });
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-th-text">{title}</h3>
        <span className="text-xs text-th-muted">{METRIC_LABELS[metric]}</span>
      </div>

      {/* 4×3 grid */}
      <div ref={gridRef} className="grid grid-cols-4 gap-2">
        {sorted.map((d) => (
          <button
            key={d.month}
            data-month={d.month}
            type="button"
            aria-label={`${d.month}: ${d.label}`}
            className="relative rounded-xl p-3 text-center transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70"
            onMouseEnter={() => setTooltip(d)}
            onMouseLeave={() => setTooltip(null)}
          >
            <div className="text-xs text-th-muted mb-1">{d.month}</div>
            <div data-value className="text-lg font-bold tabular-nums">
              {d.value}
            </div>
          </button>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="glass-card rounded-xl px-4 py-2 text-sm text-center">
          <span className="font-semibold text-th-text">{tooltip.month}</span>
          <span className="text-th-muted ml-2">—</span>
          <span className="text-th-text-2 ml-2">{tooltip.label}</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-xs text-th-muted">Low</span>
        <div className="flex-1 h-2 rounded-full heatmap-legend-gradient" />
        <span className="text-xs text-th-muted">High</span>
      </div>
    </div>
  );
}
