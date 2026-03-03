"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ROIData {
  system_kw: number;
  roof_area_sqm: number;
  rate_per_kwh: number;
  annual_kwh: number;
  system_cost_usd: number;
  annual_savings_usd: number;
  payback_years: number;
  ten_year_savings_usd: number;
  twenty_year_savings_usd: number;
  co2_offset_kg: number;
  co2_offset_trees: number;
  monthly_production_kwh: number[];
  irradiance_source: string | null;
}

interface Props {
  lat: number;
  lon: number;
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function MonthlyBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="mt-4">
      <p className="text-xs text-th-muted mb-2">Monthly Production (kWh)</p>
      <div className="flex items-end gap-1 h-20">
        {data.map((val, i) => {
          const pct = (val / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div
                className="w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-400 transition-all"
                style={{ height: `${pct}%` }}
              />
              {/* Tooltip */}
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                {fmt(val)} kWh
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {MONTHS.map((m) => (
          <div key={m} className="flex-1 text-center text-[8px] text-th-muted">{m}</div>
        ))}
      </div>
    </div>
  );
}

export default function SolarROICalculator({ lat, lon }: Props) {
  const [roofArea, setRoofArea] = useState(50);
  const [systemKw, setSystemKw] = useState(6);
  const [rate, setRate] = useState(0.13);
  const [data, setData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(
        `${API}/solar/roi?lat=${lat}&lon=${lon}&roof_area_sqm=${roofArea}&system_kw=${systemKw}&rate_per_kwh=${rate}`
      )
        .then((r) => r.json())
        .then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [lat, lon, roofArea, systemKw, rate]);

  const paybackOk = data && data.payback_years < 15;

  return (
    <div className="glass-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-th-text">Solar ROI Calculator</h3>
        {data?.irradiance_source && (
          <span className="text-[10px] text-th-muted bg-th-bg-2 px-2 py-0.5 rounded-full">
            Data: {data.irradiance_source}
          </span>
        )}
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <label htmlFor="roi-roof" className="text-th-muted">Roof Area</label>
            <span className="text-th-solar font-medium">{roofArea} m²</span>
          </div>
          <input
            id="roi-roof"
            type="range"
            min={10} max={200} step={5}
            value={roofArea}
            onChange={(e) => setRoofArea(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
            aria-label="Roof area in square metres"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label htmlFor="roi-kw" className="text-th-muted">System Size</label>
            <span className="text-th-solar font-medium">{systemKw} kW</span>
          </div>
          <input
            id="roi-kw"
            type="range"
            min={1} max={20} step={0.5}
            value={systemKw}
            onChange={(e) => setSystemKw(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
            aria-label="Solar system size in kilowatts"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <label htmlFor="roi-rate" className="text-th-muted">Electricity Rate</label>
            <span className="text-th-solar font-medium">${rate.toFixed(2)}/kWh</span>
          </div>
          <input
            id="roi-rate"
            type="range"
            min={0.05} max={0.40} step={0.01}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
            aria-label="Local electricity rate in dollars per kilowatt hour"
          />
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-th-muted">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          Calculating…
        </div>
      )}

      {data && !loading && (
        <>
          {/* Stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Annual Output", value: `${fmt(data.annual_kwh)} kWh`, icon: "⚡" },
              {
                label: "Payback Period",
                value: data.payback_years >= 99 ? "N/A" : `${data.payback_years} yrs`,
                icon: "📅",
                highlight: paybackOk,
              },
              { label: "10-Yr Savings", value: `$${fmt(data.ten_year_savings_usd)}`, icon: "💰", highlight: data.ten_year_savings_usd > 0 },
              { label: "CO₂ Offset", value: `${fmt(data.co2_offset_kg)} kg/yr`, icon: "🌱" },
            ].map((s) => (
              <div
                key={s.label}
                className={`rounded-lg p-3 text-center border ${
                  s.highlight
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-th-border bg-th-bg-2"
                }`}
              >
                <div className="text-xl mb-1">{s.icon}</div>
                <div className={`text-sm font-bold ${s.highlight ? "text-th-solar" : "text-th-text"}`}>
                  {s.value}
                </div>
                <div className="text-[10px] text-th-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Secondary metrics */}
          <div className="flex flex-wrap gap-4 text-sm text-th-muted">
            <span>System cost: <strong className="text-th-text">${fmt(data.system_cost_usd)}</strong></span>
            <span>Annual savings: <strong className="text-th-text">${fmt(data.annual_savings_usd)}</strong></span>
            <span>20-yr savings: <strong className="text-th-text">${fmt(data.twenty_year_savings_usd)}</strong></span>
            <span>≈ <strong className="text-th-text">{data.co2_offset_trees}</strong> trees/yr</span>
          </div>

          {/* Monthly chart */}
          {data.monthly_production_kwh.length === 12 && (
            <MonthlyBarChart data={data.monthly_production_kwh} />
          )}
        </>
      )}
    </div>
  );
}
