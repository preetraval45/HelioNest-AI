"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── State solar incentive table ────────────────────────────────────────────────
// Federal ITC: 30% through 2032 (Inflation Reduction Act)
const FEDERAL_ITC_PCT = 30;

type Incentive = { state_pct: number; note: string };
const STATE_INCENTIVES: Record<string, Incentive> = {
  CA: { state_pct: 0,  note: "Net metering + SGIP battery rebate up to $1,000/kWh" },
  NY: { state_pct: 25, note: "NY-Sun Megawatt Block + 25% state tax credit (max $5,000)" },
  MA: { state_pct: 15, note: "SMART program + 15% state tax credit" },
  NJ: { state_pct: 0,  note: "Transition Renewable Energy Certificates (TRECs) + net metering" },
  TX: { state_pct: 0,  note: "Property tax exemption on added home value from solar" },
  FL: { state_pct: 0,  note: "Sales tax exemption (6%) on solar equipment purchase" },
  AZ: { state_pct: 25, note: "25% state tax credit (max $1,000)" },
  CO: { state_pct: 0,  note: "Xcel Energy Solar*Rewards — up to $0.05/kWh produced" },
  NC: { state_pct: 0,  note: "Duke/Dominion net metering + Renewable Energy Property Tax credit" },
  WA: { state_pct: 0,  note: "Sales & use tax exemption on solar equipment" },
  OR: { state_pct: 0,  note: "Oregon Residential Energy Tax Credit + Energy Trust rebates" },
  IL: { state_pct: 0,  note: "Illinois Shines incentive program (SREC payments)" },
  MN: { state_pct: 0,  note: "Made in MN Solar Incentive program rebates" },
  VA: { state_pct: 0,  note: "Dominion/Appalachian net metering + land use tax exemption" },
  OH: { state_pct: 0,  note: "Ohio property tax exemption on solar installations" },
  PA: { state_pct: 0,  note: "Pennsylvania SREC market + net metering" },
  GA: { state_pct: 0,  note: "Georgia net metering + potential utility rebates" },
  NV: { state_pct: 0,  note: "NV Energy net metering + property tax exemption" },
  HI: { state_pct: 35, note: "35% Hawaii state tax credit (max $5,000 per system)" },
  MD: { state_pct: 0,  note: "Residential Clean Energy Rebate $1,000 + net metering" },
  CT: { state_pct: 0,  note: "Green Bank low-interest loans + residential solar incentive" },
  MO: { state_pct: 0,  note: "Ameren/KCP&L net metering available" },
  SC: { state_pct: 25, note: "25% state tax credit (max $3,500/yr, up to $35,000)" },
  UT: { state_pct: 25, note: "25% state tax credit (max $2,000)" },
};

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
  state?: string; // 2-letter abbreviation e.g. "CA"
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function MonthlyBarChart({ data }: Readonly<{ data: number[] }>) {
  const max = Math.max(...data, 1);
  return (
    <div className="mt-4">
      <p className="text-xs text-th-muted mb-2">Monthly Production (kWh)</p>
      <div className="flex items-end gap-1 h-20">
        {data.map((val, i) => {
          const pct = (val / max) * 100;
          const month = MONTHS[i] ?? String(i + 1);
          return (
            <div key={month} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div
                className="w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-400 transition-all"
                style={{ height: `${pct}%` }}
              />
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

// ── 20-year degradation chart ──────────────────────────────────────────────────
const DEGRADATION = 0.005; // 0.5% per year (industry standard)

function TwentyYearChart({ annualKwh, annualSavings, systemCost, paybackYears }: Readonly<{
  annualKwh: number; annualSavings: number; systemCost: number; paybackYears: number;
}>) {
  const years = Array.from({ length: 20 }, (_, i) => {
    const yr = i + 1;
    const kwh = annualKwh * Math.pow(1 - DEGRADATION, i);
    const savings = annualSavings * Math.pow(1 - DEGRADATION, i);
    return { yr, kwh, savings };
  });

  const maxKwh = Math.max(...years.map((y) => y.kwh), 1);
  const cumulativeSavings = years.map((y, i) => ({
    yr: y.yr,
    cumNet: years.slice(0, i + 1).reduce((s, r) => s + r.savings, 0) - systemCost,
  }));
  const maxCum = Math.max(...cumulativeSavings.map((c) => Math.abs(c.cumNet)), 1);

  return (
    <div className="mt-4 space-y-4">
      {/* Production bar chart */}
      <div>
        <p className="text-xs text-th-muted mb-2">Annual Production (kWh) — 0.5%/yr degradation</p>
        <div className="flex items-end gap-0.5 h-16">
          {years.map(({ yr, kwh }) => {
            const pct = (kwh / maxKwh) * 100;
            const isPayback = yr === Math.ceil(paybackYears);
            return (
              <div key={yr} className="flex-1 flex flex-col items-center group relative">
                <div
                  className={`w-full rounded-t transition-all ${isPayback ? "bg-emerald-500" : "bg-gradient-to-t from-amber-700 to-amber-500"}`}
                  style={{ height: `${pct}%` }}
                />
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  Yr {yr}: {fmt(kwh)} kWh
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-0.5 mt-1">
          {years.map(({ yr }) => (
            <div key={yr} className="flex-1 text-center text-[7px] text-th-muted">{yr}</div>
          ))}
        </div>
        <p className="text-[9px] text-th-muted mt-0.5">Year 1–20  ·  green bar = payback year</p>
      </div>

      {/* Cumulative net savings chart */}
      <div>
        <p className="text-xs text-th-muted mb-2">Cumulative Net Savings (after system cost)</p>
        <div className="relative flex items-end gap-0.5 h-16">
          {/* Zero line */}
          <div
            className="absolute left-0 right-0 border-t border-dashed border-th-border/60"
            style={{ bottom: `${(systemCost / maxCum) * 50}%` }}
          />
          {cumulativeSavings.map(({ yr, cumNet }) => {
            const isPos = cumNet >= 0;
            const heightPct = (Math.abs(cumNet) / maxCum) * 100;
            return (
              <div key={yr} className="flex-1 flex flex-col items-center group relative">
                {isPos ? (
                  <div className="w-full flex flex-col justify-end" style={{ height: "100%" }}>
                    <div
                      className="w-full rounded-t bg-emerald-500/80 transition-all"
                      style={{ height: `${Math.min(heightPct, 100)}%` }}
                    />
                  </div>
                ) : (
                  <div className="w-full flex flex-col justify-end" style={{ height: "50%" }}>
                    <div
                      className="w-full rounded-b bg-red-500/60 transition-all"
                      style={{ height: `${Math.min(heightPct * 2, 100)}%` }}
                    />
                  </div>
                )}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  Yr {yr}: {cumNet >= 0 ? "+" : ""}{fmt(cumNet)} USD
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-0.5 mt-1">
          {cumulativeSavings.map(({ yr }) => (
            <div key={yr} className="flex-1 text-center text-[7px] text-th-muted">{yr}</div>
          ))}
        </div>
        <p className="text-[9px] text-th-muted mt-0.5">Green = net profit  ·  Red = pre-payback investment</p>
      </div>
    </div>
  );
}

// ── Solar Incentive Card ───────────────────────────────────────────────────────
function IncentiveCard({ stateCode, systemCost }: Readonly<{ stateCode: string | undefined; systemCost: number }>) {
  const federal = Math.round(systemCost * FEDERAL_ITC_PCT / 100);
  const stateData = stateCode ? STATE_INCENTIVES[stateCode.toUpperCase()] : undefined;
  const stateCredit = stateData ? Math.round(systemCost * stateData.state_pct / 100) : 0;
  const totalSavings = federal + stateCredit;

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-emerald-400">Available Tax Incentives</p>
        <span className="text-lg font-bold text-emerald-400">${fmt(totalSavings)} off</span>
      </div>

      <div className="space-y-2">
        {/* Federal ITC */}
        <div className="flex items-start justify-between gap-2 text-xs">
          <div>
            <p className="text-th-text font-medium">Federal ITC (30%)</p>
            <p className="text-th-muted text-[10px]">Inflation Reduction Act — valid through 2032</p>
          </div>
          <span className="text-emerald-400 font-bold shrink-0">${fmt(federal)}</span>
        </div>

        {/* State incentive */}
        {stateData && (
          <div className="flex items-start justify-between gap-2 text-xs">
            <div>
              <p className="text-th-text font-medium">{stateCode?.toUpperCase()} State ({stateData.state_pct > 0 ? `${stateData.state_pct}%` : "Rebate"})</p>
              <p className="text-th-muted text-[10px]">{stateData.note}</p>
            </div>
            {stateData.state_pct > 0 && (
              <span className="text-emerald-400 font-bold shrink-0">${fmt(stateCredit)}</span>
            )}
          </div>
        )}

        {!stateData && stateCode && (
          <p className="text-[10px] text-th-muted">
            Check your state energy office for additional rebates and net metering policies.
          </p>
        )}

        {!stateCode && (
          <p className="text-[10px] text-th-muted">
            Enter a US address with state to see state-specific incentives.
          </p>
        )}
      </div>

      <p className="text-[9px] text-th-muted border-t border-th-border/50 pt-2">
        Estimates only. Consult a tax professional. Federal ITC applies as a dollar-for-dollar
        reduction of income tax owed.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SolarROICalculator({ lat, lon, state }: Readonly<Props>) {
  const [roofArea, setRoofArea] = useState(50);
  const [systemKw, setSystemKw] = useState(6);
  const [rate, setRate] = useState(0.16);
  const [data, setData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLongTerm, setShowLongTerm] = useState(false);
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
            min={0.05} max={0.4} step={0.01}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
            aria-label="Local electricity rate in dollars per kilowatt hour"
          />
        </div>
      </div>

      {/* Loading */}
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
            <span>≈ <strong className="text-th-text">{data.co2_offset_trees}</strong> trees/yr equivalent</span>
            <span>Est. panels: <strong className="text-th-text">~{Math.ceil(data.roof_area_sqm / 2)}</strong> panels</span>
          </div>

          {/* Incentives */}
          <IncentiveCard stateCode={state} systemCost={data.system_cost_usd} />

          {/* Monthly chart */}
          {data.monthly_production_kwh.length === 12 && (
            <MonthlyBarChart data={data.monthly_production_kwh} />
          )}

          {/* 20-year toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowLongTerm((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors border border-amber-500/20 hover:border-amber-500/40 rounded-lg px-3 py-1.5 bg-amber-500/5"
            >
              {showLongTerm ? "▲ Hide" : "▼ Show"} 20-Year Production &amp; Savings Forecast
            </button>
            {showLongTerm && (
              <TwentyYearChart
                annualKwh={data.annual_kwh}
                annualSavings={data.annual_savings_usd}
                systemCost={data.system_cost_usd}
                paybackYears={data.payback_years}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
