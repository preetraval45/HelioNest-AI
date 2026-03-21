"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

// ── Constants ─────────────────────────────────────────────────────────────────

const ZOOM          = 18;            // ESRI tile zoom (≈155m per tile at mid-lat)
const TILE_PX       = 256;           // pixels per tile
const GRID          = 5;             // 5×5 tile grid (25 tiles — wider satellite coverage)
const GROUND_SIZE   = 80;            // Three.js scene units for the ground plane
const SCENE_SCALE   = 0.1;           // 1m → 0.1 scene units  (600m → 60 units)
const ORBIT_R_MIN   = 5;
const ORBIT_R_MAX   = 80;
const ORBIT_R_INIT  = 22;
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

/** Load a 5×5 grid of ESRI World Imagery tiles and stitch into a CanvasTexture */
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

// ── GeoJSON building → Three.js ExtrudeGeometry ───────────────────────────────

interface GeoFeature {
  geometry?: { coordinates?: number[][][] };
  properties?: { height?: number; "building:levels"?: number; levels?: number; building?: string };
}

function getBuildingHeight(props: GeoFeature["properties"]): number {
  if (!props) return 8;
  if (typeof props.height === "number" && props.height > 0) return props.height;
  const levels = props["building:levels"] ?? props.levels;
  if (typeof levels === "number" && levels > 0) return levels * 3.5;
  return 8;
}

function buildingColor(heightM: number): number {
  if (heightM < 10) return 0xb0bec5;
  if (heightM < 20) return 0x90a4ae;
  if (heightM < 40) return 0x64748b;
  if (heightM < 80) return 0x475569;
  return 0x334155;
}

function featureToMesh(f: GeoFeature, lat0: number, lon0: number): THREE.Mesh | null {
  const ring = f.geometry?.coordinates?.[0];
  if (!ring || ring.length < 3) return null;

  const heightM = getBuildingHeight(f.properties);
  const h = Math.max(0.4, heightM * SCENE_SCALE);

  // Build a THREE.Shape from the actual polygon footprint (accurate shape, not box)
  const shape = new THREE.Shape();
  let first = true;
  for (const c of ring) {
    if (c.length < 2) continue;
    const [x, z] = geoToScene(lat0, lon0, c[1], c[0]);
    // Use (x, -z) so that after rotateX(-PI/2) the building lands at correct (x, z) in scene
    if (first) { shape.moveTo(x, -z); first = false; }
    else shape.lineTo(x, -z);
  }
  if (first) return null; // no valid coordinates

  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // extrusion now goes along scene Y (up)

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: buildingColor(heightM) })
  );
  mesh.position.y = 0; // base at ground level
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

export default function PropertyView3D({ lat, lon }: Readonly<PropertyView3DProps>) {
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
  const [hasDragged, setHasDragged] = useState(false);

  const theta      = useRef(Math.PI * 0.75);
  const phi        = useRef(Math.PI / 3.5);
  const orbitR     = useRef(ORBIT_R_INIT);
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

    if (el <= 0) {
      r.sunLight.intensity = 0;
      r.sunLight.color.setRGB(0.1, 0.1, 0.2);
      r.scene.background = new THREE.Color(0.01, 0.01, 0.06);
    } else if (el < 5) {
      r.sunLight.intensity = 0.5;
      r.sunLight.color.setRGB(1, 0.45, 0.1);
      r.scene.background = new THREE.Color(0.55, 0.22, 0.05);
    } else if (el < 15) {
      r.sunLight.intensity = 1.2;
      r.sunLight.color.setRGB(1, 0.75, 0.35);
      r.scene.background = new THREE.Color(0.7, 0.42, 0.18);
    } else {
      r.sunLight.intensity = 2;
      r.sunLight.color.setRGB(1, 0.97, 0.87);
      r.scene.background = new THREE.Color(0.15, 0.47, 0.92);
    }
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
    renderer.toneMappingExposure   = 1.3;

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0.15, 0.45, 0.9);
    scene.fog        = new THREE.FogExp2(0x87ceeb, 0.006);

    const camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 500);

    scene.add(new THREE.AmbientLight(0xc8d8f0, 0.55));
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5a40, 0.4);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4d0, 2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(4096, 4096);
    sunLight.shadow.camera.near   = 0.5;
    sunLight.shadow.camera.far    = 120;
    sunLight.shadow.camera.left   = -35;
    sunLight.shadow.camera.right  =  35;
    sunLight.shadow.camera.top    =  35;
    sunLight.shadow.camera.bottom = -35;
    sunLight.shadow.bias          = -0.0005;
    sunLight.shadow.normalBias    =  0.02;
    scene.add(sunLight, sunLight.target);

    // Ground plane — satellite texture applied async
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
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.7 })
    );
    markerMesh.position.set(0, 1.25, 0);
    scene.add(markerMesh);

    const haloMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.y = 0.01;
    scene.add(haloMesh);

    function animate() {
      const id = requestAnimationFrame(animate);
      if (sceneRef.current) sceneRef.current.animId = id;
      const r = orbitR.current;
      const x = r * Math.sin(phi.current) * Math.cos(theta.current);
      const y = r * Math.cos(phi.current);
      const z = r * Math.sin(phi.current) * Math.sin(theta.current);
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = { renderer, camera, scene, sunLight, ground, animId: 0 };
    updateSun(sunAz, sunEl);
    setLoading(false);
    void loadSceneData();
  }, [lat, lon, updateSun, sunAz, sunEl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Extracted so initScene stays under cognitive-complexity limit
  const loadSceneData = useCallback(async () => {
    setTileMsg("Loading ESRI satellite imagery…");
    const tex = await buildSatelliteTexture(lat, lon);
    if (tex && sceneRef.current) {
      const mat = sceneRef.current.ground.material as THREE.MeshLambertMaterial;
      mat.map   = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      setTileMsg("ESRI World Imagery");
    } else {
      setTileMsg("Satellite imagery unavailable");
    }
    try {
      const res = await fetch(`${API}/neighbors?lat=${lat}&lon=${lon}&radius=300`);
      if (res.ok) {
        const gj = (await res.json()) as { features?: GeoFeature[] };
        if (sceneRef.current) {
          for (const f of gj.features ?? []) {
            const mesh = featureToMesh(f, lat, lon);
            if (mesh) sceneRef.current.scene.add(mesh);
          }
        }
      }
    } catch { /* OSM unavailable */ }
  }, [lat, lon]);

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

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitR.current = Math.max(ORBIT_R_MIN, Math.min(ORBIT_R_MAX, orbitR.current + e.deltaY * 0.04));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Pointer / touch drag → orbit
  const onMouseDown  = (e: React.MouseEvent)  => {
    isDragging.current = true;
    lastMouse.current  = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove  = (e: React.MouseEvent)  => {
    if (!isDragging.current) return;
    setHasDragged(true);
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
    setHasDragged(true);
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

        {/* Satellite + scroll hint label */}
        {!loading && (
          <div className="absolute top-12 left-3 flex flex-col gap-1">
            <div className="bg-black/60 text-white/60 text-[10px] px-2 py-0.5 rounded-md">{tileMsg}</div>
            <div className="bg-black/60 text-white/40 text-[10px] px-2 py-0.5 rounded-md">Scroll to zoom</div>
          </div>
        )}

        {/* Bottom centre: time slider */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-md px-4">
          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/80">{sunEl > 0 ? "Daytime" : "Night"}</span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {fmtHour(hourOfDay)} · {MONTH_NAMES[month - 1]} {day}
              </span>
              <span className="text-xs text-white/50">Az {Math.round(sunAz)}° El {Math.round(sunEl)}°</span>
            </div>
            <input
              type="range" min={0} max={24} step={0.25} value={hourOfDay}
              onChange={(e) => setHourOfDay(Number.parseFloat(e.target.value))}
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
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
              <span>Property location</span>
            </div>
            <div className="text-white/40">Buildings: OpenStreetMap</div>
            <div className="text-white/40">Imagery: ESRI World</div>
          </div>
        </div>

        {/* Drag hint — disappears after first drag */}
        {!hasDragged && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] text-white/25 select-none bg-black/30 px-3 py-1 rounded-full">
              Drag to rotate · Scroll to zoom
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
