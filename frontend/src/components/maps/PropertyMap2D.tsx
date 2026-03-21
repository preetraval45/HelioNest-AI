"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";

const API = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost"}/api/v1`;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PropertyMap2DProps {
  lat: number;
  lon: number;
  address?: string;
  className?: string;
  initialDate?: Date;
}

interface HourlyShadow {
  hour: number;
  shadow_azimuth_deg: number;
  shadow_length_ratio: number;
  elevation_deg: number;
  is_daytime: boolean;
}

interface BuildingFeature {
  geometry: { type: string; coordinates: number[][][] };
  properties: {
    height?: number;
    "building:levels"?: number;
    levels?: number;
    name?: string;
    building?: string;
  };
}

// ── Shadow math ────────────────────────────────────────────────────────────────

function cross2D(O: number[], A: number[], B: number[]): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

function convexHull(pts: number[][]): number[][] {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: number[][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2D(lower.at(-2)!, lower.at(-1)!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: number[][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2D(upper.at(-2)!, upper.at(-1)!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return [...lower, ...upper];
}

function getBuildingHeight(props: BuildingFeature["properties"]): number {
  if (typeof props.height === "number" && props.height > 0) return props.height;
  const levels = props["building:levels"] ?? props.levels;
  if (typeof levels === "number" && levels > 0) return levels * 3.5;
  return 8; // default 2-storey building
}

function computeShadowPolygon(
  footprint: number[][], // [lon, lat] GeoJSON order
  heightM: number,
  shadowAzDeg: number,
  elevationDeg: number,
  centerLat: number,
): [number, number][] {
  // Use actual sun elevation to compute shadow length: length = height / tan(elevation)
  const tanEl = Math.tan((Math.max(elevationDeg, 2) * Math.PI) / 180);
  const shadowLenM = Math.min(heightM / tanEl, heightM * 30); // cap at 30× height
  if (shadowLenM < 0.5) return footprint.map(([lon, lat]) => [lat, lon]);

  const azRad = (shadowAzDeg * Math.PI) / 180;
  const dLat  = (shadowLenM * Math.cos(azRad)) / 111_320;
  const dLon  = (shadowLenM * Math.sin(azRad)) / (111_320 * Math.cos((centerLat * Math.PI) / 180));
  const tips  = footprint.map(([lon, lat]) => [lon + dLon, lat + dLat]);
  const hull  = convexHull([...footprint, ...tips]);
  return hull.map(([lon, lat]) => [lat, lon] as [number, number]);
}

function interpolateShadow(hourly: HourlyShadow[], hour: number): HourlyShadow | null {
  if (!hourly.length) return null;
  const h0 = Math.floor(hour) % 24;
  const h1 = (h0 + 1) % 24;
  const t  = hour - Math.floor(hour);
  const s0 = hourly[h0];
  const s1 = hourly[h1] ?? s0;
  if (!s0) return null;
  let azDiff = s1.shadow_azimuth_deg - s0.shadow_azimuth_deg;
  if (azDiff > 180)  azDiff -= 360;
  if (azDiff < -180) azDiff += 360;
  return {
    hour: h0,
    shadow_azimuth_deg:  (s0.shadow_azimuth_deg + t * azDiff + 360) % 360,
    shadow_length_ratio: s0.shadow_length_ratio + t * (s1.shadow_length_ratio - s0.shadow_length_ratio),
    elevation_deg:       s0.elevation_deg       + t * (s1.elevation_deg       - s0.elevation_deg),
    is_daytime:          s0.is_daytime || s1.is_daytime,
  };
}

function fmtHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Sun Compass ────────────────────────────────────────────────────────────────

interface CompassData {
  sun_azimuth_deg: number;
  shadow_azimuth_deg: number;
  elevation_deg: number;
  is_daytime: boolean;
}

function azXY(az: number, r: number, cx: number, cy: number) {
  const rad = (az * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function SunCompass({ data, solarNoonHour: _solarNoonHour }: Readonly<{ data: CompassData | null; solarNoonHour: number }>) {
  const cx = 54, cy = 54;
  const isDay  = data?.is_daytime ?? false;
  const elev   = data?.elevation_deg ?? 0;
  const sunPt  = data ? azXY(data.sun_azimuth_deg,    30, cx, cy) : null;
  const shdPt  = data ? azXY(data.shadow_azimuth_deg, 22, cx, cy) : null;
  const ticks  = Array.from({ length: 24 }, (_, i) => i * 15);
  const cards  = [
    { l: "N", az: 0, r: 43 }, { l: "E", az: 90, r: 43 },
    { l: "S", az: 180, r: 43 }, { l: "W", az: 270, r: 43 },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="108" height="108" viewBox="0 0 108 108" aria-label="Sun compass">
        <defs>
          <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#0f172a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.95" />
          </radialGradient>
        </defs>

        {isDay && (
          <circle cx={cx} cy={cy} r="52" fill="none"
            stroke="#f59e0b" strokeWidth="0.5" strokeOpacity="0.25" />
        )}

        <circle cx={cx} cy={cy} r="50" fill="url(#compassBg)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="34" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        {ticks.map((az) => {
          const isMajor = az % 90 === 0;
          const isMed   = az % 45 === 0;
          let innerR = 42;
          if (isMajor) innerR = 38;
          else if (isMed) innerR = 40;
          const inner   = azXY(az, innerR, cx, cy);
          const outer   = azXY(az, 46, cx, cy);
          let tickStroke = "rgba(255,255,255,0.12)";
          if (isMajor) tickStroke = "#f59e0b";
          else if (isMed) tickStroke = "rgba(255,255,255,0.35)";
          const tickWidth = isMajor ? 2 : 0.8;
          return (
            <line key={az}
              x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke={tickStroke}
              strokeWidth={tickWidth}
            />
          );
        })}

        {cards.map(({ l, az, r }) => {
          const pt = azXY(az, r, cx, cy);
          return (
            <text key={l} x={pt.x} y={pt.y + 3.5}
              textAnchor="middle" fontSize={l === "N" ? "8.5" : "7.5"} fontWeight="800"
              fill={l === "N" ? "#f59e0b" : "rgba(255,255,255,0.65)"}>
              {l}
            </text>
          );
        })}

        {isDay && shdPt && (
          <>
            <line x1={cx} y1={cy} x2={shdPt.x} y2={shdPt.y}
              stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round"
              strokeDasharray="3 2" opacity="0.85" />
            <circle cx={shdPt.x} cy={shdPt.y} r="3" fill="#60a5fa" opacity="0.7" />
          </>
        )}

        {isDay && sunPt ? (
          <>
            <line x1={cx} y1={cy} x2={sunPt.x} y2={sunPt.y}
              stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
              const p1 = azXY(a, 7, sunPt.x, sunPt.y);
              const p2 = azXY(a, 10, sunPt.x, sunPt.y);
              return (
                <line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke="#fbbf24" strokeWidth="1" opacity="0.65" />
              );
            })}
            <circle cx={sunPt.x} cy={sunPt.y} r="5.5" fill="#fbbf24" stroke="white" strokeWidth="1.5" />
          </>
        ) : (
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="14" fill="rgba(255,255,255,0.25)">☽</text>
        )}

        <circle cx={cx} cy={cy} r="2.5" fill="rgba(255,255,255,0.6)" />
      </svg>

      <div className="bg-black/80 rounded-lg px-2.5 py-1 border border-white/10 text-center">
        <div className="text-[11px] font-mono font-bold text-white/90">
          {isDay
            ? `El ${Math.round(elev)}° · Az ${Math.round(data?.sun_azimuth_deg ?? 0)}°`
            : "Night"}
        </div>
        <div className="flex gap-2 mt-0.5 justify-center">
          <span className="flex items-center gap-0.5 text-[9px] text-amber-400">
            <span className="w-2 h-0.5 bg-amber-400 rounded inline-block" /> Sun
          </span>
          <span className="flex items-center gap-0.5 text-[9px] text-blue-400">
            <span className="w-2 h-0.5 bg-blue-400 rounded inline-block" /> Shadow
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Tile config ────────────────────────────────────────────────────────────────

const TILES = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "© Esri, Maxar",
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
} as const;
type TStyle = keyof typeof TILES;

const ANIM_SPEEDS = [0.5, 1, 2, 4] as const;

// ── Leaflet shadow map ─────────────────────────────────────────────────────────

function LeafletMap({ lat, lon, address, initialDate }: Readonly<{
  lat: number; lon: number; address?: string; initialDate?: Date;
}>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const containerRef    = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef          = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef            = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shadowLayersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bldgLayersRef   = useRef<any[]>([]);
  const buildingsRef    = useRef<BuildingFeature[]>([]);
  const animRef         = useRef<number | null>(null);
  const animHourRef     = useRef(0);
  const animSpeedRef    = useRef(1);

  const now = new Date();
  const [hour,          setHour]          = useState(now.getHours() + now.getMinutes() / 60);
  const [tileStyle,     setTileStyle]     = useState<TStyle>("satellite");
  const [mapLoaded,     setMapLoaded]     = useState(false);
  const [sweep,         setSweep]         = useState<HourlyShadow[]>([]);
  const [showShadows,   setShowShadows]   = useState(true);
  const [showBldgs,     setShowBldgs]     = useState(true);
  const [isAnimating,   setIsAnimating]   = useState(false);
  const [animSpeed,     setAnimSpeed]     = useState(1);
  const [selectedDate,  setSelectedDate]  = useState<Date>(initialDate ?? new Date());
  const [solarNoon,     setSolarNoon]     = useState(12);
  const [bldgCount,     setBldgCount]     = useState(0);
  const [sweepLoaded,   setSweepLoaded]   = useState(false);
  const [isFullscreen,  setIsFullscreen]  = useState(false);

  // Sync fullscreen state with browser events (Esc key etc.)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    const wrapper = containerRef.current.parentElement;
    if (!wrapper) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrapper.requestFullscreen().catch(() => {});
    }
  }, []);

  const sh = interpolateShadow(sweep, hour);
  const compassData: CompassData | null = sh
    ? {
        sun_azimuth_deg:    (sh.shadow_azimuth_deg + 180) % 360,
        shadow_azimuth_deg: sh.shadow_azimuth_deg,
        elevation_deg:      sh.elevation_deg,
        is_daytime:         sh.is_daytime,
      }
    : null;

  // ── Draw shadows ─────────────────────────────────────────────────────────────

  const drawShadows = useCallback((h: number, sw: HourlyShadow[], show: boolean) => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    shadowLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
    shadowLayersRef.current = [];
    if (!show) return;

    const shadow = interpolateShadow(sw, h);
    if (!shadow || !shadow.is_daytime || shadow.elevation_deg < 1) return;

    const elevFactor = Math.min(1, shadow.elevation_deg / 45);
    const fillOpacity = 0.1 + elevFactor * 0.38;

    for (const building of buildingsRef.current) {
      const ring = building.geometry.coordinates[0];
      if (!ring || ring.length < 3) continue;
      const centerLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
      const footprint = ring.slice(0, -1);
      const heightM   = getBuildingHeight(building.properties);
      const poly = computeShadowPolygon(
        footprint,
        heightM,
        shadow.shadow_azimuth_deg,
        shadow.elevation_deg,
        centerLat,
      );
      if (poly.length < 3) continue;

      const layer = L.polygon(poly, {
        color:       "transparent",
        fillColor:   "#0c1a3a",
        fillOpacity,
        interactive: false,
        pane:        "shadowPane",
      }).addTo(map);
      shadowLayersRef.current.push(layer);
    }
  }, []);

  useEffect(() => {
    drawShadows(hour, sweep, showShadows);
  }, [hour, sweep, showShadows, bldgCount, drawShadows]);

  // Show/hide building outlines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    bldgLayersRef.current.forEach((l) => {
      try { if (showBldgs) { map.addLayer(l); } else { map.removeLayer(l); } }
      catch {}
    });
  }, [showBldgs]);

  // ── Fetch shadow sweep ────────────────────────────────────────────────────────

  useEffect(() => {
    setSweepLoaded(false);
    fetch(`${API}/solar/shadow/sweep?lat=${lat}&lon=${lon}&date=${toDateStr(selectedDate)}`)
      .then((r) => r.json())
      .then((d: { hourly?: HourlyShadow[]; solar_noon_hour?: number }) => {
        setSweep(d.hourly ?? []);
        if (d.solar_noon_hour != null) setSolarNoon(d.solar_noon_hour);
        setSweepLoaded(true);
      })
      .catch(() => { setSweepLoaded(true); });
  }, [lat, lon, selectedDate]);

  // ── Fetch buildings ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapLoaded) return;
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    fetch(`${API}/neighbors?lat=${lat}&lon=${lon}&radius=350`)
      .then((r) => r.json())
      .then((d: { features?: BuildingFeature[] }) => {
        const feats = d.features ?? [];
        buildingsRef.current = feats;
        setBldgCount(feats.length);

        bldgLayersRef.current.forEach((l) => { try { map.removeLayer(l); } catch {} });
        bldgLayersRef.current = [];

        for (const f of feats) {
          const ring = f.geometry.coordinates[0];
          if (!ring || ring.length < 3) continue;
          const heightM = getBuildingHeight(f.properties);
          // Color by height: taller = darker blue-gray
          let fillColor = "#1e293b";
          if (heightM < 10) fillColor = "#64748b";
          else if (heightM < 25) fillColor = "#475569";
          else if (heightM < 50) fillColor = "#334155";
          const latlngs = ring.map(([lon, lat]) => [lat, lon] as [number, number]);
          const outline = L.polygon(latlngs, {
            color:       "#94a3b8",
            weight:      1,
            fillColor,
            fillOpacity: 0.25,
            interactive: false,
            pane:        "buildingPane",
          }).addTo(map);
          bldgLayersRef.current.push(outline);
        }
      })
      .catch(() => {});
  }, [lat, lon, mapLoaded]);

  // ── Init Leaflet ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      if (!containerRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([lat, lon], 17);
      mapRef.current = map;

      map.createPane("shadowPane");
      map.createPane("buildingPane");
      (map.getPane("shadowPane")  as HTMLElement).style.zIndex = "350";
      (map.getPane("buildingPane") as HTMLElement).style.zIndex = "380";

      L.control.zoom({ position: "bottomright" }).addTo(map);
      // Scale bar — shows real-world distance
      L.control.scale({ position: "bottomleft", imperial: true, metric: true }).addTo(map);

      const { url, attr } = TILES.satellite;
      tileLayerRef.current = L.tileLayer(url, { attribution: attr, maxZoom: 20 }).addTo(map);

      // Property marker — amber glowing pin
      const icon = L.divIcon({
        html: `<div style="position:relative;width:20px;height:20px">
          <div style="width:20px;height:20px;background:#f59e0b;border:3px solid white;border-radius:50%;box-shadow:0 0 12px rgba(245,158,11,0.6);position:relative;z-index:2"></div>
        </div>`,
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const popupLabel = address ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      L.marker([lat, lon], { icon })
        .addTo(map)
        .bindPopup(
          `<strong style="font-size:12px;font-family:system-ui">${popupLabel}</strong>`,
          { maxWidth: 220 },
        );

      setMapLoaded(true);
    });

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; tileLayerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  // Swap tile layer
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    const { url, attr } = TILES[tileStyle];
    tileLayerRef.current = L.tileLayer(url, { attribution: attr, maxZoom: 20 }).addTo(mapRef.current);
  }, [tileStyle, mapLoaded]);

  // ── Animation ─────────────────────────────────────────────────────────────────

  const toggleAnimation = useCallback(() => {
    if (isAnimating) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      setIsAnimating(false);
      return;
    }
    setIsAnimating(true);
    animHourRef.current = hour;
    let last = performance.now();

    const step = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.1);
      last = ts;
      animHourRef.current = (animHourRef.current + dt * animSpeedRef.current) % 24;
      setHour(animHourRef.current);
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, [isAnimating, hour]);

  // Keep speed ref in sync
  useEffect(() => { animSpeedRef.current = animSpeed; }, [animSpeed]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  // ── Derived values ────────────────────────────────────────────────────────────

  const daytimeHours = sweep.filter((s) => s.is_daytime).map((s) => s.hour);
  const sunriseH     = daytimeHours.length ? Math.min(...daytimeHours)     : 6;
  const sunsetH      = daytimeHours.length ? Math.max(...daytimeHours) + 1 : 20;
  const isDay        = sh?.is_daytime ?? false;

  const shadowLabel = (() => {
    if (!isDay) return "No shadow (night)";
    const el = sh?.elevation_deg ?? 0;
    if (el < 1) return "Minimal shadow";
    const tanEl = Math.tan((el * Math.PI) / 180);
    const ratio = 1 / tanEl;
    if (ratio < 0.5)  return "Short shadows";
    if (ratio < 2)    return `Medium (${ratio.toFixed(1)}× height)`;
    return `Long (${Math.min(ratio, 30).toFixed(0)}× height)`;
  })();

  return (
    <div className="relative w-full h-full min-h-[400px] bg-gray-950 rounded-xl overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Top-left controls ──────────────────────────────────────────────── */}
      {mapLoaded && (
        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
          {/* Map style toggle */}
          <div className="flex bg-black/80 backdrop-blur-md rounded-lg p-0.5 border border-white/10 shadow-xl gap-0.5">
            {(["satellite", "street"] as TStyle[]).map((s) => (
              <button key={s} type="button" onClick={() => setTileStyle(s)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  tileStyle === s
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-white/50 hover:text-white hover:bg-white/10"
                }`}>
                {s === "satellite" ? "Satellite" : "Street"}
              </button>
            ))}
          </div>

          {/* Layer toggles */}
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => setShowShadows((v) => !v)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all text-left backdrop-blur-md ${
                showShadows
                  ? "bg-blue-900/80 text-blue-300 border-blue-700/50 shadow-md"
                  : "bg-black/70 text-white/35 border-white/10 hover:text-white/60"
              }`}>
              {showShadows ? "Shadows ON" : "Shadows OFF"}
            </button>
            <button type="button" onClick={() => setShowBldgs((v) => !v)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all text-left backdrop-blur-md ${
                showBldgs
                  ? "bg-slate-700/80 text-slate-200 border-slate-500/40"
                  : "bg-black/70 text-white/35 border-white/10 hover:text-white/60"
              }`}>
              {showBldgs ? "Buildings ON" : "Buildings OFF"}
            </button>
          </div>
        </div>
      )}

      {/* ── Top-right: date picker + fullscreen ────────────────────────────── */}
      {mapLoaded && (
        <div className="absolute top-3 right-3 z-[1000] pointer-events-auto flex items-center gap-1.5">
          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="bg-black/80 backdrop-blur-md rounded-lg px-2 py-1.5 border border-white/10 shadow-xl text-white/70 hover:text-white transition-colors text-sm leading-none"
          >
            {isFullscreen ? "✕" : "⛶"}
            <span className="sr-only">{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
          </button>
          <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10 shadow-xl">
            <span className="text-white/40 text-xs">📅</span>
            <input
              type="date"
              value={toDateStr(selectedDate)}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split("-").map(Number);
                if (y && m && d) setSelectedDate(new Date(y, m - 1, d));
              }}
              className="bg-transparent text-white/90 text-xs font-semibold outline-none cursor-pointer"
              style={{ colorScheme: "dark" }}
            />
            <button
              type="button"
              onClick={() => setSelectedDate(new Date())}
              className="text-[10px] text-amber-400 font-bold hover:text-amber-300 transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}

      {/* ── Sun compass ────────────────────────────────────────────────────── */}
      {mapLoaded && (
        <div className="absolute bottom-36 left-3 z-[1000] pointer-events-none">
          <SunCompass data={compassData} solarNoonHour={solarNoon} />
        </div>
      )}

      {/* ── Building + shadow count ────────────────────────────────────────── */}
      {mapLoaded && bldgCount > 0 && (
        <div className="absolute bottom-36 right-3 z-[1000] pointer-events-none">
          <div className="bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-white/10 text-right space-y-0.5">
            <div className="text-[9px] text-white/50">{bldgCount} OSM buildings</div>
            <div className="text-[9px] text-blue-400/80">{shadowLabel}</div>
            {!sweepLoaded && (
              <div className="text-[9px] text-amber-400/70 animate-pulse">Loading shadows…</div>
            )}
          </div>
        </div>
      )}

      {/* ── Time slider HUD ────────────────────────────────────────────────── */}
      {mapLoaded && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] pointer-events-auto">
          <div className="bg-black/85 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10 shadow-2xl">
            {/* Top row: time + status + controls */}
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              {/* Time display */}
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isDay ? "bg-amber-400 shadow-md shadow-amber-400/60" : "bg-indigo-400"
                }`} />
                <span className="font-mono font-bold text-white text-sm tracking-wide">{fmtHour(hour)}</span>
                <span className="text-white/40 text-[11px] hidden sm:block truncate">
                  {isDay
                    ? `El ${Math.round(sh?.elevation_deg ?? 0)}° · Az ${Math.round(compassData?.sun_azimuth_deg ?? 0)}°`
                    : "Below horizon"}
                </span>
              </div>

              <div className="flex-1" />

              {/* Snap-to-hour quick buttons */}
              <div className="flex items-center gap-0.5">
                {[
                  { label: "Rise", h: sunriseH + 0.5 },
                  { label: "9am",  h: 9 },
                  { label: "Noon", h: solarNoon },
                  { label: "3pm",  h: 15 },
                  { label: "Set",  h: sunsetH  - 0.5 },
                ].map(({ label, h }) => (
                  <button key={label} type="button"
                    onClick={() => { if (!isAnimating) setHour(Math.min(23.99, Math.max(0, h))); }}
                    className="px-1.5 py-0.5 text-[10px] text-white/50 hover:text-amber-400 hover:bg-white/5 rounded transition-all">
                    {label}
                  </button>
                ))}
                <div className="w-px h-3.5 bg-white/10 mx-1" />

                {/* Animation speed */}
                {isAnimating && (
                  <div className="flex items-center gap-0.5 mr-1">
                    {ANIM_SPEEDS.map((s) => (
                      <button key={s} type="button"
                        onClick={() => setAnimSpeed(s)}
                        className={`px-1 py-0.5 text-[9px] rounded transition-all ${
                          animSpeed === s ? "text-amber-400 font-bold" : "text-white/35 hover:text-white/60"
                        }`}>
                        {s}×
                      </button>
                    ))}
                  </div>
                )}

                <button type="button" onClick={toggleAnimation}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    isAnimating
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                      : "text-white/55 border-white/15 hover:text-white hover:border-white/30"
                  }`}>
                  {isAnimating ? "Stop" : "Play"}
                </button>
              </div>
            </div>

            {/* Slider with daylight band */}
            <div className="relative h-4 flex items-center">
              <div
                className="absolute h-2 rounded-full bg-amber-500/15 border border-amber-500/20 pointer-events-none"
                style={{
                  left:  `${(sunriseH / 24) * 100}%`,
                  width: `${Math.max(0, (sunsetH - sunriseH) / 24) * 100}%`,
                }}
              />
              <input
                type="range" min={0} max={24} step={0.05} value={hour}
                onChange={(e) => { if (!isAnimating) setHour(Number.parseFloat(e.target.value)); }}
                className="w-full accent-amber-400 cursor-pointer h-1.5 rounded-full relative z-10 bg-transparent"
                aria-label={`Time of day: ${fmtHour(hour)}`}
              />
            </div>

            {/* Hour labels */}
            <div className="flex justify-between mt-1">
              {["0", "3", "6", "9", "12", "15", "18", "21", "24"].map((l) => (
                <span key={l} className="text-[9px] text-white/25">{l}h</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-950 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-sm text-white/40">Loading shadow map…</p>
        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function PropertyMap2D({ lat, lon, address, className = "", initialDate }: Readonly<PropertyMap2DProps>) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapStyle, setMapStyle] = useState<"satellite" | "street">("satellite");
  const [mapLoaded, setMapLoaded] = useState(false);

  const hasMapbox = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!hasMapbox) {
    return (
      <div className={`relative rounded-xl overflow-hidden ${className}`} style={{ minHeight: 400 }}>
        <LeafletMap lat={lat} lon={lon} address={address} initialDate={initialDate} />
      </div>
    );
  }

  // ── Mapbox path (3D buildings, better imagery) ─────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addMapboxBuildings(map: any) {
    fetch(`${API}/neighbors?lat=${lat}&lon=${lon}&radius=350`)
      .then((r) => r.json())
      .then((geojson) => {
        if (!map || map._removed) return;
        map.addSource("neighbor-buildings", { type: "geojson", data: geojson });
        map.addLayer({
          id: "neighbor-buildings-fill", type: "fill-extrusion", source: "neighbor-buildings",
          paint: {
            "fill-extrusion-color": ["interpolate", ["linear"], ["get", "height"],
              0, "#64748b", 20, "#475569", 50, "#334155", 100, "#1e293b"],
            "fill-extrusion-height":  ["get", "height"],
            "fill-extrusion-base":    0,
            "fill-extrusion-opacity": 0.65,
          },
        });
      })
      .catch(() => {});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onMapboxLoad(map: any, mapboxgl: any) {
    setMapLoaded(true);
    new mapboxgl.Marker({ color: "#f59e0b" })
      .setLngLat([lon, lat])
      .setPopup(new mapboxgl.Popup().setHTML(
        `<p style="font-size:12px;font-weight:600">${address ?? "Property"}</p>`,
      ))
      .addTo(map);
    addMapboxBuildings(map);
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;
    import("mapbox-gl").then((mapboxgl) => {
      if (!mapContainerRef.current) return;
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
      map = new mapboxgl.default.Map({
        container: mapContainerRef.current,
        style: mapStyle === "satellite"
          ? "mapbox://styles/mapbox/satellite-streets-v12"
          : "mapbox://styles/mapbox/streets-v12",
        center: [lon, lat],
        zoom: 17,
        pitch: 45,
        bearing: 0,
      });
      map.on("load", () => onMapboxLoad(map, mapboxgl.default));
    }).catch(() => {});
    return () => { if (map) map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, mapStyle, address]);

  return (
    <div className={`relative rounded-xl overflow-hidden min-h-[400px] ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[400px]" />
      <div className="absolute top-3 right-3 z-10 flex gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 shadow">
        {(["satellite", "street"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setMapStyle(s)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mapStyle === s ? "bg-amber-500 text-white" : "text-white/60 hover:text-white hover:bg-white/10"
            }`}>
            {s === "satellite" ? "Satellite" : "Street"}
          </button>
        ))}
      </div>
      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
