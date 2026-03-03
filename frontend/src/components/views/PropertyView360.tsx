"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

interface PropertyView360Props {
  solarAzimuth?: number;
  solarElevation?: number;
  moonAzimuth?: number;
  moonElevation?: number;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function getSkyColors(hour: number): { top: THREE.Color; horizon: THREE.Color } {
  // hour 0–24


  const keyframes: Array<{ h: number; top: [number, number, number]; horizon: [number, number, number] }> = [
    { h: 0,  top: [0.01, 0.01, 0.05], horizon: [0.02, 0.02, 0.08] }, // midnight
    { h: 5,  top: [0.05, 0.02, 0.12], horizon: [0.4, 0.15, 0.05]  }, // pre-dawn
    { h: 7,  top: [0.3, 0.5, 0.9],    horizon: [0.97, 0.6, 0.2]   }, // sunrise
    { h: 12, top: [0.2, 0.5, 1.0],    horizon: [0.45, 0.72, 1.0]  }, // noon
    { h: 18, top: [0.15, 0.35, 0.8],  horizon: [1.0, 0.4, 0.1]    }, // sunset
    { h: 20, top: [0.05, 0.05, 0.15], horizon: [0.15, 0.05, 0.08] }, // dusk
    { h: 24, top: [0.01, 0.01, 0.05], horizon: [0.02, 0.02, 0.08] }, // midnight
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
    top: new THREE.Color(lerp(a.top[0], b.top[0]), lerp(a.top[1], b.top[1]), lerp(a.top[2], b.top[2])),
    horizon: new THREE.Color(lerp(a.horizon[0], b.horizon[0]), lerp(a.horizon[1], b.horizon[1]), lerp(a.horizon[2], b.horizon[2])),
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

export function PropertyView360({ solarAzimuth = 180, solarElevation = 45, moonAzimuth = 0, moonElevation = 30 }: PropertyView360Props) {
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
    animId: number;
  } | null>(null);

  const [timeOfDay, setTimeOfDay] = useState(12);
  const isDragging = useRef(false);
  const lastMouse  = useRef({ x: 0, y: 0 });
  const cameraAngles = useRef({ yaw: 0, pitch: 0 });

  const initScene = useCallback(() => {
    if (!canvasRef.current) return;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 2000);
    camera.position.set(0, 0, 0);

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

      // Apply camera look
      const { yaw, pitch } = cameraAngles.current;
      camera.rotation.set(pitch, yaw, 0, "YXZ");

      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = { renderer, scene, camera, sky, sun, moon, stars, animId: 0 };
  }, []);

  // Update sky + celestial bodies when timeOfDay changes
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;

    const { top, horizon } = getSkyColors(timeOfDay);
    const mat = ref.sky.material as THREE.ShaderMaterial;
    mat.uniforms.topColor.value     = top;
    mat.uniforms.horizonColor.value = horizon;

    // Sun position
    const dynamicAz  = solarAzimuth  + (timeOfDay - 12) * 15;
    const dynamicEl  = solarElevation - Math.abs(timeOfDay - 12) * 4;
    const sunPos     = azElToVector3(dynamicAz, dynamicEl, 380);
    ref.sun.position.copy(sunPos);
    ref.sun.visible  = dynamicEl > -5;

    // Moon — visible at night
    const moonPos = azElToVector3(moonAzimuth, moonElevation, 360);
    ref.moon.position.copy(moonPos);
    ref.moon.visible = timeOfDay < 6 || timeOfDay > 19;

    // Stars fade in at night
    const starOpacity = timeOfDay < 6 || timeOfDay > 19 ? 0.9 : timeOfDay < 7 || timeOfDay > 18 ? 0.3 : 0;
    (ref.stars.material as THREE.PointsMaterial).opacity = starOpacity;
  }, [timeOfDay, solarAzimuth, solarElevation, moonAzimuth, moonElevation]);

  // Init on mount
  useEffect(() => {
    initScene();
    return () => {
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animId);
        sceneRef.current.renderer.dispose();
        sceneRef.current = null;
      }
    };
  }, [initScene]);

  // Resize handler
  useEffect(() => {
    const onResize = () => {
      const ref = sceneRef.current;
      const canvas = canvasRef.current;
      if (!ref || !canvas) return;
      ref.camera.aspect = canvas.clientWidth / canvas.clientHeight;
      ref.camera.updateProjectionMatrix();
      ref.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Gyroscope / device orientation (mobile look-around)
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      // Map device tilt to camera pitch/yaw
      // beta: front-back tilt (−180 to 180) → pitch
      // gamma: left-right tilt (−90 to 90) → yaw
      const pitch = ((e.beta - 45) * Math.PI) / 180;  // 45° = phone held upright
      const yaw   = (e.gamma * Math.PI) / 180;
      cameraAngles.current.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, pitch));
      cameraAngles.current.yaw   = -yaw;
    };

    // iOS 13+ requires permission
    const requestAndListen = async () => {
      // @ts-expect-error — requestPermission exists on iOS 13+
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        try {
          // @ts-expect-error — requestPermission is non-standard iOS 13+ API
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== "granted") return;
        } catch {
          return;
        }
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
    cameraAngles.current.pitch  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, cameraAngles.current.pitch));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { isDragging.current = false; };

  const formatHour = (h: number) => {
    const hh = Math.floor(h).toString().padStart(2, "0");
    const mm = Math.round((h % 1) * 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };

  return (
    <div ref={containerRef} className="relative rounded-2xl overflow-hidden bg-black" style={{ height: 500 }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />

      {/* Compass overlay */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-6 text-xs text-white/60 pointer-events-none">
        {COMPASS.map((d) => (
          <span key={d} className={d === "N" || d === "S" || d === "E" || d === "W" ? "text-white font-bold" : ""}>
            {d}
          </span>
        ))}
      </div>

      {/* HUD */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-xs shrink-0">🕐 {formatHour(timeOfDay)}</span>
          <input
            type="range"
            min={0}
            max={24}
            step={0.25}
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
            className="flex-1 accent-amber-400 h-1.5 cursor-pointer"
          />
          <span className="text-white/50 text-xs shrink-0">
            ☀️ {Math.round(solarElevation - Math.abs(timeOfDay - 12) * 4)}° elev
          </span>
        </div>
        <p className="text-center text-white/30 text-xs mt-1">Drag to look around · Scroll to zoom</p>
      </div>
    </div>
  );
}
