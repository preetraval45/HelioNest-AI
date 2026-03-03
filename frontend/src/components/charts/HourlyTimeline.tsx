"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface HourlyTimelineProps {
  hourlyTemps: number[];         // 24 values (°C)
  hourlyUV: number[];            // 24 values (0–11+)
  hourlySolarElevation: number[]; // 24 values (degrees, negative = below horizon)
  date?: Date;
}

function uvColor(uv: number): string {
  if (uv < 3)  return "#34d399"; // green
  if (uv < 6)  return "#fbbf24"; // amber
  if (uv < 8)  return "#f97316"; // orange
  if (uv < 11) return "#f87171"; // red
  return "#c084fc";              // purple
}

export function HourlyTimeline({ hourlyTemps, hourlyUV, hourlySolarElevation, date }: HourlyTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ hour: number; temp: number; uv: number; elev: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const margin = { top: 16, right: 48, bottom: 32, left: 48 };
    const W = svgRef.current.clientWidth || 600;
    const H = 180;
    const width  = W  - margin.left - margin.right;
    const height = H - margin.top  - margin.bottom;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const hours = d3.range(24);
    const xScale = d3.scaleLinear().domain([0, 23]).range([0, width]);

    const tempMin = d3.min(hourlyTemps) ?? 0;
    const tempMax = d3.max(hourlyTemps) ?? 40;
    const yTemp   = d3.scaleLinear().domain([tempMin - 2, tempMax + 2]).range([height, 0]);
    const yUV     = d3.scaleLinear().domain([0, 12]).range([height, 0]);
    const yElev   = d3.scaleLinear().domain([-10, 90]).range([height, 0]);

    // ── Dangerous UV shading ──────────────────────────────────────────────
    hours.forEach((h) => {
      if (hourlyUV[h] > 7) {
        g.append("rect")
          .attr("x", xScale(h))
          .attr("width", xScale(1) - xScale(0))
          .attr("y", 0)
          .attr("height", height)
          .attr("fill", "rgba(248, 113, 113, 0.07)");
      }
    });

    // ── Temperature area ───────────────────────────────────────────────────
    const tempArea = d3.area<number>()
      .x((_, i) => xScale(i))
      .y0(height)
      .y1((d) => yTemp(d))
      .curve(d3.curveCatmullRom);

    g.append("defs").append("linearGradient")
      .attr("id", "tempGrad")
      .attr("gradientTransform", "rotate(90)")
      .call((grad) => {
        grad.append("stop").attr("offset", "0%").attr("stop-color", "#fbbf24").attr("stop-opacity", 0.45);
        grad.append("stop").attr("offset", "100%").attr("stop-color", "#fbbf24").attr("stop-opacity", 0.03);
      });

    g.append("path")
      .datum(hourlyTemps)
      .attr("fill", "url(#tempGrad)")
      .attr("stroke", "#fbbf24")
      .attr("stroke-width", 2)
      .attr("d", tempArea);

    // ── Solar elevation line ───────────────────────────────────────────────
    const elevLine = d3.line<number>()
      .x((_, i) => xScale(i))
      .y((d) => yElev(d))
      .curve(d3.curveCatmullRom);

    g.append("path")
      .datum(hourlySolarElevation)
      .attr("fill", "none")
      .attr("stroke", "#818cf8")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 3")
      .attr("d", elevLine);

    // ── UV dots ────────────────────────────────────────────────────────────
    hours.forEach((h) => {
      if (hourlyUV[h] > 0) {
        g.append("circle")
          .attr("cx", xScale(h))
          .attr("cy", yUV(hourlyUV[h]))
          .attr("r", 4)
          .attr("fill", uvColor(hourlyUV[h]))
          .attr("stroke", "rgba(0,0,0,0.2)")
          .attr("stroke-width", 0.5);
      }
    });

    // ── "Now" line ─────────────────────────────────────────────────────────
    const now = date ?? new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    if (currentHour >= 0 && currentHour <= 23) {
      g.append("line")
        .attr("x1", xScale(currentHour))
        .attr("x2", xScale(currentHour))
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "rgba(255,255,255,0.3)")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "3 3");

      g.append("text")
        .attr("x", xScale(currentHour) + 4)
        .attr("y", 10)
        .attr("fill", "rgba(255,255,255,0.5)")
        .attr("font-size", 9)
        .text("now");
    }

    // ── Axes ────────────────────────────────────────────────────────────────
    // X axis — every 3 hours
    const xAxis = d3.axisBottom(xScale)
      .tickValues([0, 3, 6, 9, 12, 15, 18, 21, 23])
      .tickFormat((d) => `${d}h`);

    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis)
      .call((ax) => ax.select(".domain").remove())
      .call((ax) => ax.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)"))
      .call((ax) => ax.selectAll("text").attr("fill", "currentColor").attr("font-size", 10));

    // Y left — temperature
    const yAxisLeft = d3.axisLeft(yTemp).ticks(4).tickFormat((d) => `${d}°`);
    g.append("g")
      .call(yAxisLeft)
      .call((ax) => ax.select(".domain").remove())
      .call((ax) => ax.selectAll(".tick line").remove())
      .call((ax) => ax.selectAll("text").attr("fill", "#fbbf24").attr("font-size", 10));

    // Y right — UV
    const yAxisRight = d3.axisRight(yUV).ticks(4);
    g.append("g")
      .attr("transform", `translate(${width},0)`)
      .call(yAxisRight)
      .call((ax) => ax.select(".domain").remove())
      .call((ax) => ax.selectAll(".tick line").remove())
      .call((ax) => ax.selectAll("text").attr("fill", "#34d399").attr("font-size", 10));

    // ── Invisible hit-area for tooltip ────────────────────────────────────
    const bisect = d3.bisector((_, i: number) => i).left;
    g.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .on("mousemove", (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        const hour = Math.round(xScale.invert(mx));
        const clampedH = Math.max(0, Math.min(23, hour));
        const svgRect = svgRef.current!.getBoundingClientRect();
        setTooltip({
          hour: clampedH,
          temp: Math.round(hourlyTemps[clampedH]),
          uv: Math.round(hourlyUV[clampedH] * 10) / 10,
          elev: Math.round(hourlySolarElevation[clampedH]),
          x: event.clientX - svgRect.left,
          y: event.clientY - svgRect.top,
        });
        void bisect; // suppress unused warning
      })
      .on("mouseleave", () => setTooltip(null));

  }, [hourlyTemps, hourlyUV, hourlySolarElevation, date]);

  return (
    <div className="space-y-2 text-th-text">
      <div className="w-full relative">
        <svg ref={svgRef} role="img" aria-label="Hourly temperature, UV index, and solar elevation chart" className="w-full" height={180} />

        {tooltip && (
          <div
            className="absolute pointer-events-none glass-card rounded-lg px-3 py-2 text-xs space-y-0.5 z-10"
            style={{ left: tooltip.x + 12, top: Math.max(0, tooltip.y - 60) }}
          >
            <div className="font-semibold text-th-text">{tooltip.hour}:00</div>
            <div className="text-amber-400">🌡️ {tooltip.temp}°C</div>
            <div style={{ color: uvColor(tooltip.uv) }}>☀️ UV {tooltip.uv}</div>
            <div className="text-indigo-400">📐 Elev {tooltip.elev}°</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-th-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-amber-400 inline-block rounded" />
          Temperature
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
          UV Index
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-indigo-400 inline-block rounded border-dashed border-b border-indigo-400" />
          Sun Elevation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-red-500/20 inline-block rounded" />
          High UV danger
        </span>
      </div>
    </div>
  );
}
