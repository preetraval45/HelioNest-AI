"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// ─── Solar position math ────────────────────────────────────────────────────

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

/** Day-of-year (1-based) */
function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** Solar declination in degrees */
function solarDeclination(doy: number): number {
  return 23.45 * Math.sin(toRad((360 / 365) * (doy - 81)));
}

/** Equation of time correction (minutes) */
function equationOfTime(doy: number): number {
  const B = toRad((360 / 365) * (doy - 81));
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/** Solar elevation (degrees) for given lat, lon, local hour (0-23.999), date */
function solarElevation(
  lat: number,
  lon: number,
  hour: number,
  date: Date
): number {
  const doy = dayOfYear(date);
  const dec = solarDeclination(doy);
  const eot = equationOfTime(doy);

  // Timezone offset from UTC via lon (rough), then solar time
  const lonCorrection = lon / 15; // hours
  const solarTime = hour + lonCorrection + eot / 60;
  const hourAngle = (solarTime - 12) * 15; // degrees

  const sinElev =
    Math.sin(toRad(lat)) * Math.sin(toRad(dec)) +
    Math.cos(toRad(lat)) * Math.cos(toRad(dec)) * Math.cos(toRad(hourAngle));

  return toDeg(Math.asin(Math.max(-1, Math.min(1, sinElev))));
}

/** Find sunrise/sunset hour (0-24) by binary search */
function findCrossing(
  lat: number,
  lon: number,
  date: Date,
  rising: boolean
): number | null {
  const range = rising ? [0, 12] : [12, 24];
  let lo = range[0];
  let hi = range[1];

  const startElev = solarElevation(lat, lon, lo, date);
  const endElev = solarElevation(lat, lon, hi, date);

  // Check if crossing exists
  if (rising && (startElev >= 0 || endElev <= 0)) return null;
  if (!rising && (startElev <= 0 || endElev >= 0)) return null;

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const midElev = solarElevation(lat, lon, mid, date);
    if (rising) {
      if (midElev < 0) lo = mid;
      else hi = mid;
    } else {
      if (midElev > 0) lo = mid;
      else hi = mid;
    }
    if (hi - lo < 0.001) break;
  }
  return (lo + hi) / 2;
}

function hourToTimeStr(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Solstice helpers ────────────────────────────────────────────────────────

type DatePreset = "today" | "summer" | "winter";

function presetDate(preset: DatePreset, baseYear: number): Date {
  if (preset === "summer") return new Date(baseYear, 5, 21);
  if (preset === "winter") return new Date(baseYear, 11, 21);
  return new Date();
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SunArcVisualizationProps {
  lat: number;
  lon: number;
  date?: Date;
}

const W = 400;
const H = 220;
const MARGIN = { top: 24, right: 24, bottom: 40, left: 44 };
const INNER_W = W - MARGIN.left - MARGIN.right;
const INNER_H = H - MARGIN.top - MARGIN.bottom;

const HOUR_STEPS = 144; // every 10 minutes

export default function SunArcVisualization({
  lat,
  lon,
  date,
}: SunArcVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [preset, setPreset] = useState<DatePreset>("today");
  const [now, setNow] = useState(new Date());

  // Update clock every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const resolvedDate = date ?? presetDate(preset, new Date().getFullYear());

  const buildChart = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Generate elevation curve
    const hours = d3.range(0, 24, 24 / HOUR_STEPS);
    const elevData = hours.map((h) => ({
      hour: h,
      elev: solarElevation(lat, lon, h, resolvedDate),
    }));

    const sunrise = findCrossing(lat, lon, resolvedDate, true);
    const sunset = findCrossing(lat, lon, resolvedDate, false);

    // Scales
    const xScale = d3.scaleLinear().domain([0, 24]).range([0, INNER_W]);
    const yScale = d3.scaleLinear().domain([-20, 90]).range([INNER_H, 0]);

    // Clear
    d3.select(svg).selectAll("*").remove();

    const root = d3
      .select(svg)
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Defs: gradients ──────────────────────────────────────────────────────
    const defs = d3.select(svg).append("defs");

    // Golden fill under above-horizon curve
    const gradId = "sun-arc-fill";
    const grad = defs
      .append("linearGradient")
      .attr("id", gradId)
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#fbbf24").attr("stop-opacity", 0.45);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#fbbf24").attr("stop-opacity", 0.0);

    // Night fill
    const nightGradId = "sun-arc-night";
    const nightGrad = defs
      .append("linearGradient")
      .attr("id", nightGradId)
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1");
    nightGrad.append("stop").attr("offset", "0%").attr("stop-color", "#818cf8").attr("stop-opacity", 0.15);
    nightGrad.append("stop").attr("offset", "100%").attr("stop-color", "#818cf8").attr("stop-opacity", 0.0);

    // ── Background grid ──────────────────────────────────────────────────────
    // Elevation grid lines
    [0, 30, 60, 90].forEach((deg) => {
      const y = yScale(deg);
      root
        .append("line")
        .attr("x1", 0)
        .attr("x2", INNER_W)
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", deg === 0 ? 0.35 : 0.12)
        .attr("stroke-width", deg === 0 ? 1.5 : 1)
        .attr("stroke-dasharray", deg === 0 ? "none" : "4,4");
    });

    // ── Horizon zone fill (night) ────────────────────────────────────────────
    const horizonY = yScale(0);
    root
      .append("rect")
      .attr("x", 0)
      .attr("y", horizonY)
      .attr("width", INNER_W)
      .attr("height", INNER_H - horizonY)
      .attr("fill", "#818cf8")
      .attr("fill-opacity", 0.06);

    // ── Area under above-horizon curve ───────────────────────────────────────
    const areaAbove = d3
      .area<{ hour: number; elev: number }>()
      .x((d) => xScale(d.hour))
      .y0(horizonY)
      .y1((d) => yScale(Math.max(0, d.elev)))
      .curve(d3.curveCatmullRom.alpha(0.5));

    root
      .append("path")
      .datum(elevData)
      .attr("d", areaAbove)
      .attr("fill", `url(#${gradId})`);

    // ── Full elevation line ──────────────────────────────────────────────────
    const lineBelow = d3
      .line<{ hour: number; elev: number }>()
      .x((d) => xScale(d.hour))
      .y((d) => yScale(d.elev))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // Night/below-horizon segments (dimmed)
    root
      .append("path")
      .datum(elevData)
      .attr("d", lineBelow)
      .attr("fill", "none")
      .attr("stroke", "#818cf8")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.5)
      .attr("stroke-dasharray", "4,4");

    // Day/above-horizon segments (bright gold)
    const aboveData = elevData.filter((d) => d.elev >= 0);
    if (aboveData.length > 1) {
      root
        .append("path")
        .datum(aboveData)
        .attr("d", lineBelow)
        .attr("fill", "none")
        .attr("stroke", "#fbbf24")
        .attr("stroke-width", 2.5);
    }

    // ── Sunrise / sunset dashed lines ────────────────────────────────────────
    const addEventLine = (hour: number, label: string) => {
      const x = xScale(hour);
      root
        .append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 0)
        .attr("y2", INNER_H)
        .attr("stroke", "#fbbf24")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,3");

      root
        .append("text")
        .attr("x", x)
        .attr("y", -6)
        .attr("text-anchor", "middle")
        .attr("font-size", 9)
        .attr("fill", "#fbbf24")
        .attr("fill-opacity", 0.85)
        .text(label);
    };

    if (sunrise != null) addEventLine(sunrise, `↑ ${hourToTimeStr(sunrise)}`);
    if (sunset != null) addEventLine(sunset, `↓ ${hourToTimeStr(sunset)}`);

    // ── Current time animated dot ────────────────────────────────────────────
    if (preset === "today") {
      const currentHour =
        now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      const currentElev = solarElevation(lat, lon, currentHour, resolvedDate);

      const cx = xScale(currentHour);
      const cy = yScale(currentElev);
      const isAbove = currentElev > 0;

      // Pulse ring
      const pulse = root
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 8)
        .attr("fill", "none")
        .attr("stroke", isAbove ? "#fbbf24" : "#818cf8")
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.6);

      // Animate pulse
      function animatePulse() {
        pulse
          .attr("r", 6)
          .attr("stroke-opacity", 0.8)
          .transition()
          .duration(1500)
          .ease(d3.easeSinInOut)
          .attr("r", 14)
          .attr("stroke-opacity", 0)
          .on("end", animatePulse);
      }
      animatePulse();

      root
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 5)
        .attr("fill", isAbove ? "#fbbf24" : "#818cf8")
        .attr("stroke", "white")
        .attr("stroke-width", 1.5);
    }

    // ── X-axis ───────────────────────────────────────────────────────────────
    const xTicks = [6, 9, 12, 15, 18];
    xTicks.forEach((h) => {
      const x = xScale(h);
      root
        .append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", INNER_H)
        .attr("y2", INNER_H + 4)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.4);

      root
        .append("text")
        .attr("x", x)
        .attr("y", INNER_H + 16)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.55)
        .text(h === 12 ? "12:00" : `${h}:00`);
    });

    // X-axis label
    root
      .append("text")
      .attr("x", INNER_W / 2)
      .attr("y", INNER_H + 34)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.35)
      .text("Local Solar Time");

    // ── Y-axis ───────────────────────────────────────────────────────────────
    [0, 30, 60, 90].forEach((deg) => {
      root
        .append("text")
        .attr("x", -8)
        .attr("y", yScale(deg) + 4)
        .attr("text-anchor", "end")
        .attr("font-size", 9)
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.5)
        .text(`${deg}°`);
    });

    // Y-axis label
    root
      .append("text")
      .attr("transform", `rotate(-90)`)
      .attr("x", -(INNER_H / 2))
      .attr("y", -32)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.35)
      .text("Elevation");
  }, [lat, lon, resolvedDate, preset, now]);

  useEffect(() => {
    buildChart();
  }, [buildChart]);

  const presets: { key: DatePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "summer", label: "Summer Solstice" },
    { key: "winter", label: "Winter Solstice" },
  ];

  return (
    <div className="text-th-text bg-th-bg-card border border-th-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-th-text">
          Sun Elevation Arc
        </h3>
        <div className="flex gap-1">
          {presets.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-current={preset === key ? "true" : undefined}
              onClick={() => setPreset(key)}
              className={[
                "px-2 py-0.5 rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70",
                preset === key
                  ? "bg-solar-400 text-space-950"
                  : "bg-th-bg-2 text-th-muted hover:text-th-text",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Sun elevation arc chart for ${preset === "today" ? "today" : preset === "summer" ? "summer solstice" : "winter solstice"} at latitude ${lat.toFixed(2)}°`}
        className="w-full h-auto"
      />

      <div className="flex items-center gap-4 mt-2 text-xs text-th-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 rounded bg-amber-400" />
          Above horizon
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 rounded opacity-50 bg-indigo-400 border-t border-dashed border-indigo-400" />
          Below horizon
        </span>
        {preset === "today" && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            Current position
          </span>
        )}
      </div>
    </div>
  );
}
