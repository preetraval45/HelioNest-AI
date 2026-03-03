"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface PropertyMap2DProps {
  lat: number;
  lon: number;
  address?: string;
  className?: string;
}

type MapStyle = "satellite" | "street";

interface ShadowData {
  azimuth_deg: number;
  elevation_deg: number;
  shadow_azimuth_deg: number;
  shadow_length_ratio: number;
  is_daytime: boolean;
}

// ── Sun Compass SVG overlay ────────────────────────────────────────────────────

function azToXY(azDeg: number, r: number, cx: number, cy: number) {
  const rad = (azDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function SunCompass({ shadow }: { shadow: ShadowData | null }) {
  const cx = 50, cy = 50;
  const ticks = [0, 45, 90, 135, 180, 225, 270, 315];
  const cardinals = [
    { label: "N", x: cx, y: 9 },
    { label: "S", x: cx, y: 94 },
    { label: "E", x: 94, y: cy + 3 },
    { label: "W", x: 6,  y: cy + 3 },
  ];

  const sunPt    = shadow ? azToXY(shadow.azimuth_deg,        30, cx, cy) : null;
  const shadowPt = shadow ? azToXY(shadow.shadow_azimuth_deg, 24, cx, cy) : null;
  const isDay    = shadow?.is_daytime ?? false;
  const elev     = shadow?.elevation_deg.toFixed(0) ?? "--";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100" className="drop-shadow-lg">
        {/* Background */}
        <circle cx={cx} cy={cy} r="46" fill="rgba(0,0,0,0.82)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

        {/* Tick marks */}
        {ticks.map((az) => {
          const inner = azToXY(az, 38, cx, cy);
          const outer = azToXY(az, 43, cx, cy);
          return (
            <line
              key={az}
              x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={az % 90 === 0 ? 1.5 : 0.8}
            />
          );
        })}

        {/* Cardinal labels */}
        {cardinals.map((c) => (
          <text
            key={c.label}
            x={c.x} y={c.y}
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill={c.label === "N" ? "#f59e0b" : "rgba(255,255,255,0.75)"}
          >
            {c.label}
          </text>
        ))}

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r="43" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {isDay && shadowPt && (
          /* Shadow direction line (blue) */
          <line
            x1={cx} y1={cy} x2={shadowPt.x} y2={shadowPt.y}
            stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" opacity="0.85"
          />
        )}

        {isDay && sunPt ? (
          /* Sun direction arrow (amber) */
          <>
            <line
              x1={cx} y1={cy} x2={sunPt.x} y2={sunPt.y}
              stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"
            />
            <circle cx={sunPt.x} cy={sunPt.y} r="4.5" fill="#f59e0b" />
          </>
        ) : (
          /* Night indicator */
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.4)">
            ☽
          </text>
        )}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="2.5" fill="white" opacity="0.5" />
      </svg>

      {/* Elevation label */}
      <div className="text-[10px] leading-none bg-black/75 text-white/80 rounded px-2 py-0.5 font-mono">
        {isDay ? `☀ ${elev}° elev` : "Night"}
      </div>

      {/* Legend */}
      <div className="flex gap-2 text-[9px] text-white/70">
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-2 h-0.5 bg-amber-400 rounded" /> Sun
        </span>
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-2 h-0.5 bg-blue-300 rounded" /> Shadow
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PropertyMap2D({ lat, lon, address, className = "" }: PropertyMap2DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [shadow, setShadow] = useState<ShadowData | null>(null);
  const [showCompass, setShowCompass] = useState(true);

  // Fetch sun/shadow data
  useEffect(() => {
    fetch(`${API}/solar/shadow?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => setShadow(d))
      .catch(() => {/* silently fail */});
  }, [lat, lon]);

  // Initialise Mapbox map
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapError(true);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    import("mapbox-gl").then((mapboxgl) => {
      if (!mapContainerRef.current) return;

      mapboxgl.default.accessToken = token;
      map = new mapboxgl.default.Map({
        container: mapContainerRef.current,
        style:
          mapStyle === "satellite"
            ? "mapbox://styles/mapbox/satellite-streets-v12"
            : "mapbox://styles/mapbox/streets-v12",
        center: [lon, lat],
        zoom: 17,
        pitch: 30,
      });

      map.on("load", () => {
        setMapLoaded(true);

        // Property marker
        new mapboxgl.default.Marker({ color: "#f59e0b" })
          .setLngLat([lon, lat])
          .setPopup(
            new mapboxgl.default.Popup().setHTML(
              `<p class="text-xs font-medium">${address || "Property"}</p>`
            )
          )
          .addTo(map);

        // Load OSM neighbor buildings as GeoJSON fill-extrusion layer
        fetch(`${API}/neighbors?lat=${lat}&lon=${lon}&radius=150`)
          .then((r) => r.json())
          .then((geojson) => {
            if (!map || map._removed) return;
            map.addSource("neighbor-buildings", { type: "geojson", data: geojson });

            // Filled footprints (always visible from top-down)
            map.addLayer({
              id: "neighbor-buildings-fill",
              type: "fill-extrusion",
              source: "neighbor-buildings",
              paint: {
                "fill-extrusion-color": "#4b5563",
                "fill-extrusion-height": ["get", "height"],
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.55,
              },
            });

            // Outline for footprints
            map.addLayer({
              id: "neighbor-buildings-outline",
              type: "line",
              source: "neighbor-buildings",
              paint: {
                "line-color": "#9ca3af",
                "line-width": 0.8,
                "line-opacity": 0.6,
              },
            });
          })
          .catch(() => {/* Overpass unavailable – map still works */});
      });

      return () => {
        if (map) map.remove();
      };
    }).catch(() => setMapError(true));

    return () => {
      if (map) map.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, mapStyle, address]);

  // ── Error / no-token placeholder ──────────────────────────────────────────────
  if (mapError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-sky-50 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-xl min-h-[300px] ${className}`}
      >
        <div className="text-5xl mb-3">🗺️</div>
        <p className="text-gray-700 dark:text-gray-300 font-medium text-sm mb-1">2D Map View</p>
        <p className="text-gray-400 text-xs text-center max-w-xs px-4">
          Add{" "}
          <code className="bg-white dark:bg-gray-700 px-1 py-0.5 rounded text-xs">
            NEXT_PUBLIC_MAPBOX_TOKEN
          </code>{" "}
          to your <code className="bg-white dark:bg-gray-700 px-1 py-0.5 rounded text-xs">.env.local</code> to
          enable the interactive map.
        </p>
        <div className="mt-4 text-xs text-gray-400">
          📍 {lat.toFixed(5)}, {lon.toFixed(5)}
        </div>

        {/* Still show the compass even without the map */}
        {shadow && (
          <div className="mt-4">
            <SunCompass shadow={shadow} />
          </div>
        )}
      </div>
    );
  }

  // ── Full map view ──────────────────────────────────────────────────────────────
  return (
    <div className={`relative rounded-xl overflow-hidden min-h-[300px] ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[300px]" />

      {/* Map style toggle */}
      <div className="absolute top-3 right-3 z-10 flex gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow">
        {(["satellite", "street"] as MapStyle[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setMapStyle(s)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mapStyle === s
                ? "bg-amber-500 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {s === "satellite" ? "Satellite" : "Street"}
          </button>
        ))}
      </div>

      {/* Sun compass toggle */}
      <button
        type="button"
        onClick={() => setShowCompass((v) => !v)}
        className="absolute top-3 left-3 z-10 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm transition-colors"
        title={showCompass ? "Hide compass" : "Show sun compass"}
      >
        {showCompass ? "☀ Hide" : "☀ Compass"}
      </button>

      {/* Sun compass overlay */}
      {showCompass && (
        <div className="absolute bottom-3 left-3 z-10">
          <SunCompass shadow={shadow} />
        </div>
      )}

      {/* N/S/E/W corner labels */}
      {mapLoaded && (
        <>
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 text-[10px] font-bold text-white/70 bg-black/40 rounded px-1 pointer-events-none">
            N
          </div>
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 text-[10px] font-bold text-white/70 bg-black/40 rounded px-1 pointer-events-none">
            S
          </div>
          <div className="absolute top-1/2 right-3 -translate-y-1/2 z-10 text-[10px] font-bold text-white/70 bg-black/40 rounded px-1 pointer-events-none">
            E
          </div>
          <div className="absolute top-1/2 left-3 -translate-y-1/2 z-10 text-[10px] font-bold text-white/70 bg-black/40 rounded px-1 pointer-events-none hidden">
            {/* W is hidden — overlaps with compass */}
          </div>
        </>
      )}

      {/* Loading spinner */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
