"use client";

import { useRef, useState, useEffect, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sky, Environment, Html } from "@react-three/drei";
import * as THREE from "three";

// ── Sun position helpers ──────────────────────────────────────────────────────

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Convert solar azimuth (degrees from North clockwise) + elevation → Three.js direction */
function sunDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = degToRad(azimuthDeg);
  const el = degToRad(elevationDeg);
  // Three.js: +X = East, +Y = Up, +Z = South
  const x = Math.sin(az) * Math.cos(el);
  const y = Math.sin(el);
  const z = Math.cos(az) * Math.cos(el);
  return new THREE.Vector3(x, y, z).normalize();
}

/**
 * Approximate solar azimuth + elevation for a given latitude and hour of day.
 * Uses a simple declination estimate for the selected date scenario.
 */
function computeSunPosition(
  lat: number,
  hourOfDay: number,
  dateModeDeclinationDeg: number
): { azimuth: number; elevation: number } {
  const latRad = degToRad(lat);
  const decRad = degToRad(dateModeDeclinationDeg);
  // Hour angle: solar noon = 0
  const hourAngleRad = degToRad((hourOfDay - 12) * 15);

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

// ── Facade heat colors ────────────────────────────────────────────────────────

const FACADE_COLORS: Record<string, string> = {
  N: "#60a5fa", // cool blue
  S: "#f59e0b", // warm amber
  E: "#fbbf24", // warm-light
  W: "#fcd34d", // warm-light
};

// ── House mesh ────────────────────────────────────────────────────────────────

interface HouseProps {
  sunDir: THREE.Vector3;
}

function House({ sunDir }: HouseProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    if (!lightRef.current) return;
    const dist = 18;
    lightRef.current.position.set(
      sunDir.x * dist,
      Math.max(sunDir.y * dist, 0.5),
      sunDir.z * dist
    );
    lightRef.current.target.position.set(0, 0, 0);
    lightRef.current.target.updateMatrixWorld();
  }, [sunDir]);

  // Roof geometry — isoceles triangle prism
  const roofShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-2.2, 0);
    shape.lineTo(0, 1.5);
    shape.lineTo(2.2, 0);
    shape.closePath();
    return shape;
  }, []);

  const extrudeSettings = useMemo<THREE.ExtrudeGeometryOptions>(
    () => ({ depth: 4.4, bevelEnabled: false }),
    []
  );

  return (
    <group>
      {/* Directional sun light */}
      <directionalLight
        ref={lightRef}
        intensity={1.6}
        color="#fff8e1"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0005}
      />

      {/* Ambient fill */}
      <ambientLight intensity={0.35} color="#b0c4de" />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshLambertMaterial color="#3a5a40" />
      </mesh>

      {/* -- House body walls -- */}
      {/* North face (Z = -2) */}
      <mesh position={[0, 1.25, -2.01]} castShadow receiveShadow>
        <planeGeometry args={[4, 2.5]} />
        <meshLambertMaterial color={FACADE_COLORS.N} side={THREE.FrontSide} />
      </mesh>

      {/* South face (Z = +2) */}
      <mesh
        position={[0, 1.25, 2.01]}
        rotation={[0, Math.PI, 0]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[4, 2.5]} />
        <meshLambertMaterial color={FACADE_COLORS.S} side={THREE.FrontSide} />
      </mesh>

      {/* East face (X = +2) */}
      <mesh
        position={[2.01, 1.25, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[4, 2.5]} />
        <meshLambertMaterial color={FACADE_COLORS.E} side={THREE.FrontSide} />
      </mesh>

      {/* West face (X = -2) */}
      <mesh
        position={[-2.01, 1.25, 0]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[4, 2.5]} />
        <meshLambertMaterial color={FACADE_COLORS.W} side={THREE.FrontSide} />
      </mesh>

      {/* Main box body (interior volume for shadow casting) */}
      <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 2.5, 4]} />
        <meshLambertMaterial color="#d4a96a" transparent opacity={0} />
      </mesh>

      {/* Roof prism */}
      <mesh
        position={[-2.2, 2.5, 2.2]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <extrudeGeometry args={[roofShape, extrudeSettings]} />
        <meshLambertMaterial color="#7f1d1d" />
      </mesh>

      {/* Compass labels */}
      {(["N", "S", "E", "W"] as const).map((dir) => {
        const pos: Record<string, [number, number, number]> = {
          N: [0, 0.05, -3.5],
          S: [0, 0.05, 3.5],
          E: [3.5, 0.05, 0],
          W: [-3.5, 0.05, 0],
        };
        return (
          <Html key={dir} position={pos[dir]} center>
            <span
              className="text-xs font-bold pointer-events-none select-none"
              style={{ color: FACADE_COLORS[dir], textShadow: "0 1px 3px #000" }}
            >
              {dir}
            </span>
          </Html>
        );
      })}
    </group>
  );
}

// ── Camera preset helper ──────────────────────────────────────────────────────

type CameraPreset = "street" | "topdown" | "isometric";

const CAMERA_PRESETS: Record<
  CameraPreset,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  street:     { position: [8,  3,  10], target: [0, 1, 0] },
  topdown:    { position: [0,  18,  0], target: [0, 0, 0] },
  isometric:  { position: [10, 10, 10], target: [0, 1, 0] },
};

interface CameraControllerProps {
  preset: CameraPreset;
}

function CameraController({ preset }: CameraControllerProps) {
  const { camera } = useThree();
  const p = CAMERA_PRESETS[preset];

  useEffect(() => {
    camera.position.set(...p.position);
    camera.lookAt(...p.target);
  }, [camera, p]);

  return null;
}

// ── Sky wrapper that syncs with sun elevation ─────────────────────────────────

interface DynamicSkyProps {
  azimuth: number;
  elevation: number;
}

function DynamicSky({ azimuth, elevation }: DynamicSkyProps) {
  const turbidity = elevation > 10 ? 6 : elevation > 0 ? 12 : 20;
  const rayleigh = elevation > 10 ? 2 : elevation > 0 ? 3 : 0.5;
  // Three.js Sky uses azimuth 0=West, PI=East. Convert from North-clockwise.
  const threeAzimuth = (azimuth - 180) / 180;
  const inclination = Math.max(0, (90 - elevation) / 180);

  return (
    <Sky
      turbidity={turbidity}
      rayleigh={rayleigh}
      mieCoefficient={0.005}
      mieDirectionalG={0.8}
      sunPosition={[
        Math.sin(degToRad(azimuth)) * Math.cos(degToRad(elevation)),
        Math.sin(degToRad(elevation)),
        Math.cos(degToRad(azimuth)) * Math.cos(degToRad(elevation)),
      ]}
      inclination={inclination}
      azimuth={threeAzimuth}
    />
  );
}

// ── Date presets ──────────────────────────────────────────────────────────────

type DatePreset = "today" | "summer" | "winter";

const DATE_DECLINATIONS: Record<DatePreset, number> = {
  today:  0,    // ~equinox
  summer: 23.5, // summer solstice
  winter: -23.5,// winter solstice
};

// ── Main component ────────────────────────────────────────────────────────────

interface PropertyView3DProps {
  lat: number;
  lon: number;
  solarAzimuth?: number;
  solarElevation?: number;
}

export default function PropertyView3D({
  lat,
  solarAzimuth,
  solarElevation,
}: PropertyView3DProps) {
  const [hourOfDay, setHourOfDay] = useState(12);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("isometric");

  // Compute sun position from slider unless overridden by props
  const { azimuth, elevation } = useMemo(() => {
    if (solarAzimuth !== undefined && solarElevation !== undefined && hourOfDay === 12) {
      return { azimuth: solarAzimuth, elevation: solarElevation };
    }
    return computeSunPosition(lat, hourOfDay, DATE_DECLINATIONS[datePreset]);
  }, [lat, hourOfDay, datePreset, solarAzimuth, solarElevation]);

  const sunDir = useMemo(() => sunDirection(azimuth, elevation), [azimuth, elevation]);

  const formatHour = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const isDaytime = elevation > 0;

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden" style={{ minHeight: 420 }}>
      {/* Three.js Canvas */}
      <Canvas
        shadows
        camera={{ position: [10, 10, 10], fov: 50, near: 0.1, far: 200 }}
        className="w-full h-full"
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
      >
        <Suspense fallback={null}>
          <DynamicSky azimuth={azimuth} elevation={elevation} />
          <Environment preset="city" />
          <House sunDir={sunDir} />
          <CameraController preset={cameraPreset} />
          <OrbitControls
            makeDefault
            minDistance={4}
            maxDistance={40}
            target={[0, 1, 0]}
            enableDamping
            dampingFactor={0.08}
          />
        </Suspense>
      </Canvas>

      {/* ── HUD Overlay ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Top-left: Date preset */}
        <div className="absolute top-3 left-3 pointer-events-auto flex gap-1.5">
          {(["today", "summer", "winter"] as DatePreset[]).map((d) => (
            <button
              key={d}
              onClick={() => setDatePreset(d)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                datePreset === d
                  ? "bg-th-solar/10 text-th-solar border-th-solar/30"
                  : "glass-card text-th-text-2 border-th-border hover:text-th-text hover:bg-th-bg-2"
              }`}
            >
              {d === "today" ? "Today" : d === "summer" ? "Summer" : "Winter"}
            </button>
          ))}
        </div>

        {/* Top-right: Camera presets */}
        <div className="absolute top-3 right-3 pointer-events-auto flex flex-col gap-1.5">
          {(["street", "topdown", "isometric"] as CameraPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setCameraPreset(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all duration-200 whitespace-nowrap ${
                cameraPreset === p
                  ? "bg-th-solar/10 text-th-solar border-th-solar/30"
                  : "glass-card text-th-text-2 border-th-border hover:text-th-text hover:bg-th-bg-2"
              }`}
            >
              {p === "street" ? "Street" : p === "topdown" ? "Top-Down" : "Isometric"}
            </button>
          ))}
        </div>

        {/* Bottom: Time slider */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-md px-4">
          <div className="glass-card rounded-xl px-4 py-3 border-th-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-th-text">
                {isDaytime ? "Daytime" : "Nighttime"}
              </span>
              <span className="text-xs font-mono font-bold text-th-solar">
                {formatHour(hourOfDay)}
              </span>
              <span className="text-xs text-th-text-2">
                Az {Math.round(azimuth)}° El {Math.round(elevation)}°
              </span>
            </div>

            {/* Custom slider */}
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={hourOfDay}
              onChange={(e) => setHourOfDay(parseFloat(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer h-1.5 rounded-full"
            />

            <div className="flex justify-between mt-1">
              {["0h", "6h", "12h", "18h", "24h"].map((l) => (
                <span key={l} className="text-xs text-th-muted">{l}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom-left: Facade legend */}
        <div className="absolute bottom-4 left-3 pointer-events-none">
          <div className="glass-card rounded-lg px-2 py-1.5 border-th-border space-y-0.5">
            <p className="text-xs font-semibold text-th-text mb-1">Facade Heat</p>
            {(["S", "E", "W", "N"] as const).map((dir) => (
              <div key={dir} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{ background: FACADE_COLORS[dir] }}
                />
                <span className="text-xs text-th-text-2">
                  {dir === "N" ? "North — Cool" : dir === "S" ? "South — Hot" : `${dir === "E" ? "East" : "West"} — Warm`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Drag hint */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs text-th-muted bg-black/40 rounded px-2 py-1">
            Drag to rotate
          </span>
        </div>
      </div>
    </div>
  );
}
