"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

interface PropertyView360Props {
  lat?: number;
  lon?: number;
}

// ── Satellite tile loader (ESRI World Imagery, free) ─────────────────────────

const SAT_ZOOM = 17; // zoom 17 ≈ 310m per tile; 3×3 grid ≈ 930m wide
const SAT_GRID = 3;
const TILE_PX  = 256;

function latLonToTile360(lat: number, lon: number, z: number) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  );
  return { x, y };
}

async function loadGroundTexture360(lat: number, lon: number): Promise<THREE.CanvasTexture | null> {
  try {
    const { x: cx, y: cy } = latLonToTile360(lat, lon, SAT_ZOOM);
    const half   = Math.floor(SAT_GRID / 2);
    const canvas = document.createElement("canvas");
    canvas.width  = TILE_PX * SAT_GRID;
    canvas.height = TILE_PX * SAT_GRID;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    await Promise.all(
      Array.from({ length: SAT_GRID * SAT_GRID }, (_, i) => {
        const dy = Math.floor(i / SAT_GRID) - half;
        const dx = (i % SAT_GRID) - half;
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload  = () => { ctx.drawImage(img, (dx + half) * TILE_PX, (dy + half) * TILE_PX, TILE_PX, TILE_PX); resolve(); };
          img.onerror = () => resolve();
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${SAT_ZOOM}/${cy + dy}/${cx + dx}`;
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

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getDayOfYear(m: number, d: number): number {
  let doy = d;
  for (let i = 1; i < m; i++) doy += DAYS_IN_MONTH[i - 1];
  return Math.min(doy, 365);
}

function doyToDeclination(doy: number): number {
  return 23.45 * Math.sin((2 * Math.PI / 365) * (doy - 81));
}

function computeSunPosition(
  lat: number,
  hourOfDay: number,
  declinationDeg: number
): { azimuth: number; elevation: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const latRad = toRad(lat);
  const decRad = toRad(declinationDeg);
  const hourAngleRad = toRad((hourOfDay - 12) * 15);

  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngleRad);
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(elevationRad) + 1e-9);
  let azimuthDeg = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
  if (Math.sin(hourAngleRad) > 0) azimuthDeg = 360 - azimuthDeg;

  return {
    azimuth: azimuthDeg,
    elevation: (elevationRad * 180) / Math.PI,
  };
}

function getSkyColors(hour: number): { top: THREE.Color; horizon: THREE.Color } {
  const keyframes: Array<{ h: number; top: [number, number, number]; horizon: [number, number, number] }> = [
    { h: 0,  top: [0.01, 0.01, 0.05], horizon: [0.02, 0.02, 0.08] },
    { h: 5,  top: [0.05, 0.02, 0.12], horizon: [0.4,  0.15, 0.05] },
    { h: 7,  top: [0.3,  0.5,  0.9],  horizon: [0.97, 0.6,  0.2]  },
    { h: 12, top: [0.2,  0.5,  1.0],  horizon: [0.45, 0.72, 1.0]  },
    { h: 18, top: [0.15, 0.35, 0.8],  horizon: [1.0,  0.4,  0.1]  },
    { h: 20, top: [0.05, 0.05, 0.15], horizon: [0.15, 0.05, 0.08] },
    { h: 24, top: [0.01, 0.01, 0.05], horizon: [0.02, 0.02, 0.08] },
  ];

  let a = keyframes[0], b = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (hour >= keyframes[i].h && hour <= keyframes[i + 1].h) {
      a = keyframes[i];
      b = keyframes[i + 1];
      break;
    }
  }
  const alpha = a.h === b.h ? 0 : (hour - a.h) / (b.h - a.h);
  const lerp = (x: number, y: number) => x + (y - x) * alpha;

  return {
    top: new THREE.Color(
      lerp(a.top[0], b.top[0]),
      lerp(a.top[1], b.top[1]),
      lerp(a.top[2], b.top[2])
    ),
    horizon: new THREE.Color(
      lerp(a.horizon[0], b.horizon[0]),
      lerp(a.horizon[1], b.horizon[1]),
      lerp(a.horizon[2], b.horizon[2])
    ),
  };
}

function azElToVector3(azDeg: number, elDeg: number, radius: number): THREE.Vector3 {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(el) * Math.sin(az),
    radius * Math.sin(el),
    -radius * Math.cos(el) * Math.cos(az),
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PropertyView360({ lat = 35.2, lon: _lon = -80.8 }: PropertyView360Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const sceneRef     = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    sky: THREE.Mesh;
    sun: THREE.Mesh;
    moon: THREE.Mesh;
    stars: THREE.Points;
    ground: THREE.Mesh;
    animId: number;
  } | null>(null);

  const now = new Date();
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [day, setDay]           = useState(now.getDate());
  const [timeOfDay, setTimeOfDay] = useState(12);
  const [sceneReady, setSceneReady] = useState(false); // triggers sky update after init
  const [error, setError]         = useState("");

  const maxDay = DAYS_IN_MONTH[month - 1];

  // Compute sun position from selected date + time
  const declination  = doyToDeclination(getDayOfYear(month, day));
  const { azimuth: solarAzimuth, elevation: solarElevation } = computeSunPosition(lat, timeOfDay, declination);

  const isDragging   = useRef(false);
  const lastMouse    = useRef({ x: 0, y: 0 });
  const cameraAngles = useRef({ yaw: 0, pitch: 0 });

  // Build the Three.js scene — deferred with setTimeout so the canvas has layout
  const initScene = useCallback(async () => {
    if (!canvasRef.current || !containerRef.current) return;

    // Use container dimensions (container has explicit height: 500 from style)
    const w = containerRef.current.offsetWidth  || 800;
    const h = containerRef.current.offsetHeight || 500;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    } catch {
      setError("WebGL is not supported in your browser.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 2000);
    camera.position.set(0, 1.6, 0); // eye level (1.6m above ground)

    // ── Sky dome (inside-out sphere) ──────────────────────────────────────
    const skyGeo = new THREE.SphereGeometry(500, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor:     { value: new THREE.Color(0.2, 0.5, 1.0) },
        horizonColor: { value: new THREE.Color(0.45, 0.72, 1.0) },
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 vPosition;
        void main() {
          float t = clamp(vPosition.y / 400.0, 0.0, 1.0);
          gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // ── Ground plane — satellite imagery (loaded async) ───────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 800, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x3a5a40 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0; // ground at y = 0, camera at y = 1.6
    scene.add(ground);

    // ── Stars ─────────────────────────────────────────────────────────────
    const starPositions: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      starPositions.push(
        450 * Math.sin(phi) * Math.cos(theta),
        450 * Math.cos(phi),
        450 * Math.sin(phi) * Math.sin(theta),
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.8 });
    const stars   = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Sun ───────────────────────────────────────────────────────────────
    const sunGeo = new THREE.SphereGeometry(8, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    const sun    = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sun);

    // ── Moon ─────────────────────────────────────────────────────────────
    const moonGeo = new THREE.SphereGeometry(5, 16, 16);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xddddff });
    const moon    = new THREE.Mesh(moonGeo, moonMat);
    scene.add(moon);

    // ── Animate ───────────────────────────────────────────────────────────
    function animate() {
      const animId = requestAnimationFrame(animate);
      if (sceneRef.current) { sceneRef.current.animId = animId; }
      const { yaw, pitch } = cameraAngles.current;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = { renderer, scene, camera, sky, sun, moon, stars, ground, animId: 0 };
    setSceneReady(true); // signal that sky/sun update effect should now run

    // ── Load satellite ground texture async ───────────────────────────────
    const resolvedLat = lat ?? 35.2;
    const resolvedLon = _lon ?? -80.8;
    const tex = await loadGroundTexture360(resolvedLat, resolvedLon);
    if (tex && sceneRef.current) {
      const mat = sceneRef.current.ground.material as THREE.MeshBasicMaterial;
      mat.map   = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    }
  }, [lat, _lon, setSceneReady]);

  // Init after layout is complete (setTimeout lets the browser paint first)
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

  // Update sky + celestial bodies when date/time changes (also runs on sceneReady)
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;

    const { top, horizon } = getSkyColors(timeOfDay);
    const mat = ref.sky.material as THREE.ShaderMaterial;
    mat.uniforms.topColor.value     = top;
    mat.uniforms.horizonColor.value = horizon;

    // Sun
    const sunPos = azElToVector3(solarAzimuth, solarElevation, 380);
    ref.sun.position.copy(sunPos);
    ref.sun.visible = solarElevation > -5;

    // Moon (roughly opposite the sun in azimuth, appears at night)
    const moonAz  = (solarAzimuth + 180) % 360;
    const moonEl  = Math.max(5, 60 - Math.abs(timeOfDay - 0) * 2);
    const moonPos = azElToVector3(moonAz, moonEl, 360);
    ref.moon.position.copy(moonPos);
    ref.moon.visible = timeOfDay < 6 || timeOfDay > 19;

    // Stars
    const starOpacity = timeOfDay < 6 || timeOfDay > 19 ? 0.9 : timeOfDay < 7 || timeOfDay > 18 ? 0.3 : 0;
    (ref.stars.material as THREE.PointsMaterial).opacity = starOpacity;
  }, [timeOfDay, solarAzimuth, solarElevation, sceneReady]);

  // Resize handler
  useEffect(() => {
    const onResize = () => {
      const ref       = sceneRef.current;
      const container = containerRef.current;
      if (!ref || !container) return;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      ref.camera.aspect = w / h;
      ref.camera.updateProjectionMatrix();
      ref.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Gyroscope (mobile look-around)
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const pitch = ((e.beta - 45) * Math.PI) / 180;
      const yaw   = (e.gamma * Math.PI) / 180;
      cameraAngles.current.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, pitch));
      cameraAngles.current.yaw   = -yaw;
    };

    const requestAndListen = async () => {
      // @ts-expect-error — iOS 13+ non-standard API
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        try {
          // @ts-expect-error — iOS 13+
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== "granted") return;
        } catch { return; }
      }
      window.addEventListener("deviceorientation", handleOrientation, true);
    };

    void requestAndListen();
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, []);

  // Mouse drag look-around
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current  = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    cameraAngles.current.yaw   -= dx * 0.003;
    cameraAngles.current.pitch -= dy * 0.003;
    cameraAngles.current.pitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraAngles.current.pitch));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isDragging.current = false; };

  // Touch look-around
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    isDragging.current = true;
    lastMouse.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastMouse.current.x;
    const dy = e.touches[0].clientY - lastMouse.current.y;
    cameraAngles.current.yaw   -= dx * 0.003;
    cameraAngles.current.pitch -= dy * 0.003;
    cameraAngles.current.pitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraAngles.current.pitch));
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const formatHour = (h: number) => {
    const hh = Math.floor(h).toString().padStart(2, "0");
    const mm = Math.round((h % 1) * 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const resetToToday = () => {
    const t = new Date();
    setMonth(t.getMonth() + 1);
    setDay(t.getDate());
  };

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-2xl bg-th-bg-2 border border-th-border" style={{ height: 500 }}>
        <p className="text-sm text-th-danger">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden bg-black"
      style={{ height: 500 }}
      aria-label="360° panorama — real satellite ground + sky dome with sun and moon"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onMouseUp}
      />

      {/* Compass labels */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-4 sm:gap-6 text-xs text-white/60 pointer-events-none select-none">
        {COMPASS.map((d) => (
          <span key={d} className={d === "N" || d === "S" || d === "E" || d === "W" ? "text-white font-bold" : ""}>
            {d}
          </span>
        ))}
      </div>

      {/* Date picker — top right */}
      <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/65 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
        <span className="text-white/50 text-xs">📅</span>
        <select
          value={month}
          onChange={(e) => {
            const m = +e.target.value;
            setMonth(m);
            setDay(Math.min(day, DAYS_IN_MONTH[m - 1]));
          }}
          className="bg-transparent text-white text-xs font-semibold outline-none cursor-pointer"
          aria-label="Select month"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1} className="bg-gray-900 text-white">{name}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={maxDay}
          value={day}
          onChange={(e) => setDay(Math.max(1, Math.min(+e.target.value, maxDay)))}
          className="w-9 bg-transparent text-white text-xs font-bold text-center outline-none border-b border-white/30 focus:border-amber-400"
          aria-label="Day of month"
        />
        <button
          onClick={resetToToday}
          className="text-[11px] text-amber-400 font-semibold hover:text-amber-300 transition-colors"
          title="Reset to today"
        >
          Today
        </button>
      </div>

      {/* HUD: time slider */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-white/70 text-xs shrink-0 font-mono">🕐 {formatHour(timeOfDay)}</span>
          <input
            type="range"
            min={0}
            max={24}
            step={0.25}
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
            className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
            aria-label={`Time of day: ${formatHour(timeOfDay)}`}
          />
          <span className="text-white/50 text-xs shrink-0">
            {MONTH_NAMES[month - 1]} {day} · ☀ {Math.round(solarElevation)}° elev
          </span>
        </div>
        <p className="text-center text-white/30 text-[11px]">
          Drag to look around · Change date &amp; time above
        </p>
      </div>
    </div>
  );
}
