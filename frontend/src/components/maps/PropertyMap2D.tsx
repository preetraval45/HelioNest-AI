"use client";

import { useEffect, useRef, useState } from "react";

interface PropertyMap2DProps {
  lat: number;
  lon: number;
  address?: string;
  className?: string;
}

type MapStyle = "satellite" | "street";

export default function PropertyMap2D({ lat, lon, address, className = "" }: PropertyMap2DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Note: Full Mapbox integration requires NEXT_PUBLIC_MAPBOX_TOKEN
  // This component shows a placeholder when token is not set,
  // and the full Mapbox map when it is configured.
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapError(true);
      return;
    }

    // Dynamic import to avoid SSR issues
    import("mapbox-gl").then((mapboxgl) => {
      if (!mapContainerRef.current) return;

      mapboxgl.default.accessToken = token;
      const map = new mapboxgl.default.Map({
        container: mapContainerRef.current,
        style: mapStyle === "satellite"
          ? "mapbox://styles/mapbox/satellite-streets-v12"
          : "mapbox://styles/mapbox/streets-v12",
        center: [lon, lat],
        zoom: 17,
      });

      map.on("load", () => {
        setMapLoaded(true);
        // Add marker
        new mapboxgl.default.Marker({ color: "#f59e0b" })
          .setLngLat([lon, lat])
          .setPopup(new mapboxgl.default.Popup().setHTML(`<p class="text-xs">${address || "Property"}</p>`))
          .addTo(map);
      });

      return () => map.remove();
    }).catch(() => setMapError(true));
  }, [lat, lon, mapStyle, address]);

  if (mapError) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gradient-to-br from-sky-50 to-blue-100 rounded-xl ${className}`} style={{ minHeight: 300 }}>
        <div className="text-5xl mb-3">🗺️</div>
        <p className="text-gray-700 font-medium text-sm mb-1">2D Map View</p>
        <p className="text-gray-400 text-xs text-center max-w-xs px-4">
          Add <code className="bg-white px-1 py-0.5 rounded text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your <code className="bg-white px-1 py-0.5 rounded text-xs">.env.local</code> file to enable the interactive map.
        </p>
        <div className="mt-4 text-xs text-gray-400">
          📍 {lat.toFixed(5)}, {lon.toFixed(5)}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`} style={{ minHeight: 300 }}>
      <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: 300 }} />

      {/* Style toggle */}
      <div className="absolute top-3 right-3 z-10 flex gap-1 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow">
        {(["satellite", "street"] as MapStyle[]).map((s) => (
          <button
            key={s}
            onClick={() => setMapStyle(s)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mapStyle === s ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {s === "satellite" ? "Satellite" : "Street"}
          </button>
        ))}
      </div>

      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
