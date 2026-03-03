"use client";

import { useEffect, useRef } from "react";

export interface SunPathPoint {
  timestamp: string;
  azimuth_deg: number;
  elevation_deg: number;
  is_daytime: boolean;
}

interface SunPathChartProps {
  data: SunPathPoint[];
  currentAzimuth?: number;
  currentElevation?: number;
  className?: string;
}

const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

function formatHour(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
}

export default function SunPathChart({
  data,
  currentAzimuth,
  currentElevation,
  className = "",
}: SunPathChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const svg = svgRef.current;
    const totalWidth = svg.clientWidth || 600;
    const totalHeight = svg.clientHeight || 260;
    const width = totalWidth - MARGIN.left - MARGIN.right;
    const height = totalHeight - MARGIN.top - MARGIN.bottom;

    // Clear previous
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Create main group
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${MARGIN.left},${MARGIN.top})`);
    svg.appendChild(g);

    // Data bounds
    const elevations = data.map((d) => d.elevation_deg);
    const minElev = Math.min(...elevations, -5);
    const maxElev = Math.max(...elevations, 5);

    const xScale = (i: number) => (i / (data.length - 1)) * width;
    const yScale = (elev: number) => height - ((elev - minElev) / (maxElev - minElev)) * height;

    // Horizon line
    const horizonY = yScale(0);
    const horizonLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    horizonLine.setAttribute("x1", "0");
    horizonLine.setAttribute("y1", String(horizonY));
    horizonLine.setAttribute("x2", String(width));
    horizonLine.setAttribute("y2", String(horizonY));
    horizonLine.setAttribute("stroke", "#e5e7eb");
    horizonLine.setAttribute("stroke-width", "1");
    horizonLine.setAttribute("stroke-dasharray", "4,4");
    g.appendChild(horizonLine);

    // Daytime fill
    const dayPoints = data.filter((d) => d.elevation_deg > 0);
    if (dayPoints.length > 1) {
      const firstDayIdx = data.findIndex((d) => d.elevation_deg > 0);
      const lastDayIdx = data.map((d) => d.elevation_deg > 0).lastIndexOf(true);

      const areaPoints = [
        `${xScale(firstDayIdx)},${horizonY}`,
        ...data
          .slice(firstDayIdx, lastDayIdx + 1)
          .map((d, i) => `${xScale(firstDayIdx + i)},${yScale(d.elevation_deg)}`),
        `${xScale(lastDayIdx)},${horizonY}`,
      ].join(" ");

      const dayFill = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      dayFill.setAttribute("points", areaPoints);
      dayFill.setAttribute("fill", "#fef3c7");
      dayFill.setAttribute("opacity", "0.6");
      g.appendChild(dayFill);
    }

    // Sun path line
    const pathData = data
      .map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(d.elevation_deg)}`)
      .join(" ");
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", pathData);
    pathEl.setAttribute("fill", "none");
    pathEl.setAttribute("stroke", "#f59e0b");
    pathEl.setAttribute("stroke-width", "2");
    pathEl.setAttribute("stroke-linejoin", "round");
    g.appendChild(pathEl);

    // Current sun position marker
    if (currentElevation !== undefined && currentAzimuth !== undefined) {
      // Find closest data point
      type Indexed = SunPathPoint & { idx: number };
      const closest = data.reduce<Indexed>((prev, curr, i) => {
        const prevDelta = Math.abs(prev.azimuth_deg - currentAzimuth);
        const currDelta = Math.abs(curr.azimuth_deg - currentAzimuth);
        return currDelta < prevDelta ? { ...curr, idx: i } : prev;
      }, { ...data[0], idx: 0 });

      const cx = xScale(closest.idx ?? 0);
      const cy = yScale(currentElevation);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", currentElevation > 0 ? "#f59e0b" : "#94a3b8");
      circle.setAttribute("stroke", "white");
      circle.setAttribute("stroke-width", "2");
      g.appendChild(circle);
    }

    // X-axis labels (every 3 hours)
    const labelEvery = Math.floor(data.length / 8);
    for (let i = 0; i < data.length; i += labelEvery) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(xScale(i)));
      label.setAttribute("y", String(height + 25));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", "#9ca3af");
      label.textContent = formatHour(data[i].timestamp);
      g.appendChild(label);
    }

    // Y-axis labels
    const yTicks = [0, 30, 60, 90].filter((v) => v <= maxElev + 5);
    for (const tick of yTicks) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", "-8");
      label.setAttribute("y", String(yScale(tick) + 4));
      label.setAttribute("text-anchor", "end");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", "#9ca3af");
      label.textContent = `${tick}°`;
      g.appendChild(label);
    }
  }, [data, currentAzimuth, currentElevation]);

  if (!data.length) {
    return (
      <div className={`flex items-center justify-center h-48 bg-gray-50 rounded-xl ${className}`}>
        <p className="text-gray-400 text-sm">No sun path data</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Sun Path — Elevation vs. Time</h3>
        <span className="text-xs text-gray-400">UTC</span>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: 220 }} />
    </div>
  );
}
