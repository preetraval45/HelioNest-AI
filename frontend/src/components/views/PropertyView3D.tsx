"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

// ── Constants ─────────────────────────────────────────────────────────────────

const ZOOM          = 18;            // ESRI tile zoom (≈155m per tile at mid-lat)
const TILE_PX       = 256;           // pixels per tile
const GRID          = 3;             // 3×3 tile grid (9 tiles total)
const GROUND_SIZE   = 60;            // Three.js scene units for the ground plane
const SCENE_SCALE   = 0.10;          // 1m → 0.10 scene units  (so 600m → 60 units)
const BUILD_H_MULT  = 3.5;           // exaggerate building heights for visibility
const ORBIT_R       = 22;
const METERS_PER_DEG_LAT = 111_320;

const API = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost"}/api/v1`;

const MONTH_NAMES   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ── Tile helpers ──────────────────────────────────────────────────────────────

function latLonToTileXY(lat: number, lon: number, z: number) {
  const n   = Math.pow(2, z);
  const tileX = Math.floor(((lon + 180) / 360) * n);
  const latR  = (lat * Math.PI) / 180;
  const tileY = Math.floor(
    ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n
  );
  return { tileX, tileY };
}

/** Load a 3×3 grid of ESRI World Imagery tiles and stitch into a CanvasTexture */
async function buildSatelliteTexture(lat: number, lon: number): Promise<THREE.CanvasTexture | null> {
  try {
    const { tileX: cx, tileY: cy } = latLonToTileXY(lat, lon, ZOOM);
    const half   = Math.floor(GRID / 2);
    const canvas = document.createElement("canvas");
    canvas.width  = TILE_PX * GRID;
    canvas.height = TILE_PX * GRID;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    await Promise.all(
      Array.from({ length: GRID * GRID }, (_, i) => {
        const dy = Math.floor(i / GRID) - half;
        const dx = (i % GRID) - half;
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload  = () => {
            ctx.drawImage(img, (dx + half) * TILE_PX, (dy + half) * TILE_PX, TILE_PX, TILE_PX);
            resolve();
          };
          img.onerror = () => resolve();
          // ESRI uses {z}/{y}/{x} order
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${cy + dy}/${cx + dx}`;
        });
      })
    );

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

// ── Geo → scene coordinate conversion ────────────────────────────────────────

function geoToScene(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  const mPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const x = (lon - lon0) * mPerDegLon * SCENE_SCALE;
  const z = -(lat - lat0) * METERS_PER_DEG_LAT * SCENE_SCALE;
  return [x, z];
}

// ── Sun / date helpers ────────────────────────────────────────────────────────

function getDayOfYear(m: number, d: number): number {
  let doy = d;
  for (let i = 1; i < m; i++) doy += DAYS_IN_MONTH[i - 1];
  return Math.min(doy, 365);
}
function doyToDeclination(doy: number) {
  return 23.45 * Math.sin((2 * Math.PI / 365) * (doy - 81));
}
function computeSunPosition(lat: number, hour: number, decDeg: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const latR  = toRad(lat), decR = toRad(decDeg);
  const haR   = toRad((hour - 12) * 15);
  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  const elR  = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz = (Math.sin(decR) - Math.sin(latR) * sinAlt) / (Math.cos(latR) * Math.cos(elR) + 1e-9);
  let az = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
  if (Math.sin(haR) > 0) az = 360 - az;
  return { azimuth: az, elevation: (elR * 180) / Math.PI };
}

// ── GeoJSON building → Three.js BoxGeometry ───────────────────────────────────

interface GeoFeature {
  geometry?: { coordinates?: number[][][] };
  properties?: { height?: number; building?: string };
}

function featureToMesh(f: GeoFeature, lat0: number, lon0: number): THREE.Mesh | null {
  const ring = f.geometry?.coordinates?.[0];
  if (!ring || ring.length < 3) return null;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of ring) {
    if (c.length < 2) continue;
    const [x, z] = geoToScene(lat0, lon0, c[1], c[0]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const w = Math.max(0.3, maxX - minX);
  const d = Math.max(0.3, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const hM = typeof f.properties?.height === "number" ? f.properties.height : 8;
  const h  = Math.max(0.4, hM * SCENE_SCALE * BUILD_H_MULT);

  const geo  = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
  );
  mesh.position.set(cx, h / 2, cz);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── Camera presets ─────────────────────────────────────────────────────────────

type CamPreset = "iso" | "bird" | "street";
const CAM_PRESETS: Record<CamPreset, { t: number; p: number }> = {
  iso:    { t: Math.PI * 0.75, p: Math.PI / 3.5  },
  bird:   { t: Math.PI * 0.75, p: 0.12            },
  street: { t: Math.PI * 0.75, p: Math.PI / 2.1  },
};
const CAM_LABELS: Record<CamPreset, string> = {
  iso:    "3D View",
  bird:   "Bird's Eye",
  street: "Street Level",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface PropertyView3DProps { lat: number; lon: number }

export default function PropertyView3D({ lat, lon }: PropertyView3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    camera:   THREE.PerspectiveCamera;
    scene:    THREE.Scene;
    sunLight: THREE.DirectionalLight;
    ground:   THREE.Mesh;
    animId:   number;
  } | null>(null);

  const now = new Date();
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  const [day,       setDay]       = useState(now.getDate());
  const [hourOfDay, setHourOfDay] = useState(12);
  const [camPreset, setCamPreset] = useState<CamPreset>("iso");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(true);
  const [tileMsg,   setTileMsg]   = useState("Loading satellite imagery…");

  const theta      = useRef(Math.PI * 0.75);
  const phi        = useRef(Math.PI / 3.5);
  const isDragging = useRef(false);
  const lastMouse  = useRef({ x: 0, y: 0 });

  const decl  = doyToDeclination(getDayOfYear(month, day));
  const { azimuth: sunAz, elevation: sunEl } = computeSunPosition(lat, hourOfDay, decl);

  // Update sun light + sky colour
  const updateSun = useCallback((az: number, el: number) => {
    const r = sceneRef.current;
    if (!r) return;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dist = 40;
    r.sunLight.position.set(
      Math.sin(toRad(az)) * Math.cos(toRad(el)) * dist,
      Math.max(Math.sin(toRad(el)) * dist, 0.5),
      Math.cos(toRad(az)) * Math.cos(toRad(el)) * dist,
    );
    r.sunLight.target.position.set(0, 0, 0);
    r.sunLight.target.updateMatrixWorld();
    r.sunLight.intensity = el > 0 ? 1.8 : 0.1;

    r.scene.background = el > 10
      ? new THREE.Color(0.15, 0.45, 0.90)
      : el > 0
      ? new THREE.Color(0.50, 0.30, 0.12)
      : new THREE.Color(0.01, 0.01, 0.06);
  }, []);

  useEffect(() => { updateSun(sunAz, sunEl); }, [sunAz, sunEl, updateSun]);

  // Build Three.js scene + load async data
  const initScene = useCallback(async () => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = container.offsetWidth || 800;
    const h = 480;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setError("WebGL is not available in your browser.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled     = true;
    renderer.shadowMap.type        = THREE.PCFSoftShadowMap;
    renderer.toneMapping           = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure   = 1.2;

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0.15, 0.45, 0.90);
    scene.fog        = new THREE.Fog(0x87ceeb, 40, 120);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 400);

    // Lights
    scene.add(new THREE.AmbientLight(0xb0c4de, 0.4));
    const sunLight = new THREE.DirectionalLight(0xfff8e1, 1.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near   = 0.5;
    sunLight.shadow.camera.far    = 100;
    sunLight.shadow.camera.left   = -35;
    sunLight.shadow.camera.right  =  35;
    sunLight.shadow.camera.top    =  35;
    sunLight.shadow.camera.bottom = -35;
    scene.add(sunLight, sunLight.target);

    // Ground plane — initially flat green; satellite texture applied async
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x3a5a40 })
    );
    ground.rotation.x    = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Property marker — amber glowing pillar
    const markerMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 2.5, 16),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.7,
      })
    );
    markerMesh.position.set(0, 1.25, 0);
    scene.add(markerMesh);

    // Marker halo ring at ground level
    const haloMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.y = 0.01;
    scene.add(haloMesh);

    // Animate
    function animate() {
      const id = requestAnimationFrame(animate);
      if (sceneRef.current) sceneRef.current.animId = id;
      const x = ORBIT_R * Math.sin(phi.current) * Math.cos(theta.current);
      const y = ORBIT_R * Math.cos(phi.current);
      const z = ORBIT_R * Math.sin(phi.current) * Math.sin(theta.current);
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = { renderer, camera, scene, sunLight, ground, animId: 0 };
    updateSun(sunAz, sunEl);
    setLoading(false);

    // ── Async: satellite tiles ────────────────────────────────────────────
    setTileMsg("Loading ESRI satellite imagery…");
    const tex = await buildSatelliteTexture(lat, lon);
    if (tex && sceneRef.current) {
      const mat = sceneRef.current.ground.material as THREE.MeshLambertMaterial;
      mat.map   = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      setTileMsg("🛰 ESRI World Imagery");
    } else {
      setTileMsg("⚠ Satellite imagery unavailable");
    }

    // ── Async: OSM buildings from /neighbors ─────────────────────────────
    try {
      const res = await fetch(`${API}/neighbors?lat=${lat}&lon=${lon}&radius=250`);
      if (res.ok) {
        const gj = (await res.json()) as { features?: GeoFeature[] };
        if (sceneRef.current) {
          for (const f of gj.features ?? []) {
            const mesh = featureToMesh(f, lat, lon);
            if (mesh) sceneRef.current.scene.add(mesh);
          }
        }
      }
    } catch { /* OSM unavailable — scene still works */ }
  }, [lat, lon, updateSun, sunAz, sunEl]);

  // Init with 50ms defer so container has dimensions
  useEffect(() => {
    const id = setTimeout(() => { void initScene(); }, 50);
    return () => {
      clearTimeout(id);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animId);
        sceneRef.current.renderer.dispose();
        sceneRef.current = null;
      }
    };
  }, [initScene]);

  // Camera preset
  useEffect(() => {
    const { t, p } = CAM_PRESETS[camPreset];
    theta.current = t;
    phi.current   = p;
  }, [camPreset]);

  // Resize
  useEffect(() => {
    const onResize = () => {
      const r = sceneRef.current;
      const c = containerRef.current;
      if (!r || !c) return;
      const w = c.offsetWidth;
      r.camera.aspect = w / 480;
      r.camera.updateProjectionMatrix();
      r.renderer.setSize(w, 480);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Pointer / touch drag → orbit
  const onMouseDown  = (e: React.MouseEvent)  => { isDragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove  = (e: React.MouseEvent)  => {
    if (!isDragging.current) return;
    theta.current -= (e.clientX - lastMouse.current.x) * 0.012;
    phi.current    = Math.max(0.05, Math.min(Math.PI / 2.05, phi.current + (e.clientY - lastMouse.current.y) * 0.012));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp    = () => { isDragging.current = false; };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    isDragging.current = true;
    lastMouse.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove  = (e: React.TouchEvent) => {
    if (!isDragging.current || e.touches.length !== 1) return;
    theta.current -= (e.touches[0].clientX - lastMouse.current.x) * 0.012;
    phi.current    = Math.max(0.05, Math.min(Math.PI / 2.05, phi.current + (e.touches[0].clientY - lastMouse.current.y) * 0.012));
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const fmtHour = (h: number) =>
    `${Math.floor(h).toString().padStart(2, "0")}:${Math.round((h % 1) * 60).toString().padStart(2, "0")}`;

  if (error) return (
    <div className="flex items-center justify-center h-[480px] rounded-xl bg-th-bg-2 border border-th-border">
      <p className="text-sm text-th-danger">{error}</p>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden"
      style={{ height: 480 }}
      aria-label="3D satellite view of property with real ESRI imagery and OSM buildings"
    >
      {loading && (
        <div className="absolute inset-0 bg-gray-950 flex items-center justify-center z-20">
          <div className="text-center">
            <div className="w-8 h-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-white/70">Building 3D scene…</p>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}    onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
      />

      {/* HUD */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Top-left: date picker */}
        <div className="absolute top-3 left-3 pointer-events-auto flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
          <span className="text-white/50 text-xs">📅</span>
          <select
            value={month}
            onChange={(e) => { const m = +e.target.value; setMonth(m); setDay(Math.min(day, DAYS_IN_MONTH[m - 1])); }}
            className="bg-transparent text-white text-xs font-semibold outline-none cursor-pointer"
          >
            {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1} className="bg-gray-900">{n}</option>)}
          </select>
          <input
            type="number" min={1} max={DAYS_IN_MONTH[month - 1]} value={day}
            onChange={(e) => setDay(Math.max(1, Math.min(+e.target.value, DAYS_IN_MONTH[month - 1])))}
            className="w-9 bg-transparent text-white text-xs font-bold text-center outline-none border-b border-white/30 focus:border-amber-400"
          />
          <button
            onClick={() => { const t = new Date(); setMonth(t.getMonth() + 1); setDay(t.getDate()); }}
            className="text-[11px] text-amber-400 font-semibold hover:text-amber-300 transition-colors"
          >Today</button>
        </div>

        {/* Top-right: camera presets */}
        <div className="absolute top-3 right-3 pointer-events-auto flex gap-1">
          {(["iso", "bird", "street"] as CamPreset[]).map((p) => (
            <button key={p} onClick={() => setCamPreset(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                camPreset === p
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  : "bg-black/60 text-white/70 border-white/10 hover:text-white hover:border-white/30"
              }`}
            >{CAM_LABELS[p]}</button>
          ))}
        </div>

        {/* Satellite label */}
        {!loading && (
          <div className="absolute top-12 left-3 bg-black/60 text-white/60 text-[10px] px-2 py-0.5 rounded-md">
            {tileMsg}
          </div>
        )}

        {/* Bottom centre: time slider */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-md px-4">
          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/80">{sunEl > 0 ? "☀ Daytime" : "☽ Night"}</span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {fmtHour(hourOfDay)} · {MONTH_NAMES[month - 1]} {day}
              </span>
              <span className="text-xs text-white/50">Az {Math.round(sunAz)}° El {Math.round(sunEl)}°</span>
            </div>
            <input
              type="range" min={0} max={24} step={0.25} value={hourOfDay}
              onChange={(e) => setHourOfDay(parseFloat(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer h-1.5 rounded-full"
              aria-label={`Time of day: ${fmtHour(hourOfDay)}`}
            />
            <div className="flex justify-between mt-1">
              {["0h", "6h", "12h", "18h", "24h"].map((l) => (
                <span key={l} className="text-[10px] text-white/40">{l}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom-left: info badge */}
        <div className="absolute bottom-4 left-3 pointer-events-none">
          <div className="bg-black/65 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-white/10 text-[10px] space-y-0.5">
            <div className="flex items-center gap-1.5 text-white/70">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              Property location
            </div>
            <div className="text-white/40">Buildings: OpenStreetMap</div>
            <div className="text-white/40">Imagery: ESRI World</div>
          </div>
        </div>

        {/* Drag hint — fades after interaction */}
        {!isDragging.current && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] text-white/20 select-none">Drag to rotate</span>
          </div>
        )}

      </div>
    </div>
  );
}
