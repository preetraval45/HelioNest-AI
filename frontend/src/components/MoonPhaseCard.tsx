"use client";

interface MoonPhase {
  phase_name: string;
  illumination_pct: number;
  emoji: string;
  phase_angle: number;
}

interface RiseSet {
  moonrise: string | null;
  moonset: string | null;
  is_up_all_day: boolean;
  is_down_all_day: boolean;
}

interface NightVisibility {
  score: number;
  level: string;
  moon_impact: string;
}

interface MoonPhaseCardProps {
  phase: MoonPhase;
  riseSet: RiseSet;
  visibility: NightVisibility;
  positionElevation?: number;
  className?: string;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function VisibilityBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 70 ? "#34d399" :
    pct >= 45 ? "#fbbf24" :
    "#f87171";

  return (
    <div className="w-full h-2 rounded-full bg-th-bg-2 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// SVG moon disk showing illumination phase
function MoonDisk({ illumination, phaseAngle, size = 64 }: { illumination: number; phaseAngle: number; size?: number }) {
  const r = size / 2;
  const waxing = phaseAngle < 180;

  // The lit fraction determines the width of the ellipse on the lit side
  const frac = illumination / 100;
  // rx for the inner ellipse — ranges from -r (new) to +r (full)
  const innerRx = Math.abs(2 * frac - 1) * r;
  const litOnRight = waxing;

  // Build the SVG path:
  // Outer circle = full disk
  // Lit region = right or left half circle + inner ellipse sweep
  const leftArc  = `M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${size}`;
  const rightArc = `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${size}`;

  let litPath: string;
  if (frac <= 0.01) {
    litPath = ""; // new moon — all dark
  } else if (frac >= 0.99) {
    litPath = `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${size} A ${r} ${r} 0 0 1 ${r} 0`; // full circle
  } else if (litOnRight) {
    // right half + inner ellipse sweeping left
    litPath = `${rightArc} A ${innerRx} ${r} 0 0 ${frac > 0.5 ? 0 : 1} ${r} 0`;
  } else {
    // left half + inner ellipse sweeping right
    litPath = `${leftArc} A ${innerRx} ${r} 0 0 ${frac > 0.5 ? 1 : 0} ${r} 0`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {/* Dark disk */}
      <circle cx={r} cy={r} r={r - 1} fill="#1e2a3a" stroke="#334155" strokeWidth="1" />
      {/* Lit region */}
      {litPath && (
        <path d={litPath} fill="#f0d060" opacity="0.9" />
      )}
      {/* Subtle surface texture rings */}
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
    </svg>
  );
}

export function MoonPhaseCard({ phase, riseSet, visibility, positionElevation, className = "" }: MoonPhaseCardProps) {
  const isAboveHorizon = (positionElevation ?? 0) > 0;

  return (
    <div className={`stat-card rounded-2xl p-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-th-text">Moon Intelligence</h3>
        <span className="badge-moon">Tonight</span>
      </div>

      {/* Moon disk + phase info */}
      <div className="flex items-center gap-5 mb-5">
        <div className="shrink-0 drop-shadow-lg animate-float">
          <MoonDisk illumination={phase.illumination_pct} phaseAngle={phase.phase_angle} size={72} />
        </div>
        <div>
          <div className="text-base font-bold text-th-text">{phase.phase_name}</div>
          <div className="text-sm text-th-text-2 mt-0.5">
            {phase.illumination_pct.toFixed(0)}% illuminated
          </div>
          {positionElevation !== undefined && (
            <div className={`text-xs mt-1 font-medium ${isAboveHorizon ? "text-th-weather" : "text-th-muted"}`}>
              {isAboveHorizon ? "▲ Above horizon" : "▼ Below horizon"}
            </div>
          )}
        </div>
      </div>

      {/* Rise / Set */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-3 bg-th-bg-2 border border-th-border text-center">
          <div className="text-xs text-th-muted mb-1">Moonrise</div>
          <div className="text-sm font-semibold text-th-moon">
            {riseSet.is_down_all_day ? "Doesn't rise" : fmt(riseSet.moonrise)}
          </div>
        </div>
        <div className="rounded-xl p-3 bg-th-bg-2 border border-th-border text-center">
          <div className="text-xs text-th-muted mb-1">Moonset</div>
          <div className="text-sm font-semibold text-th-moon">
            {riseSet.is_up_all_day ? "Doesn't set" : fmt(riseSet.moonset)}
          </div>
        </div>
      </div>

      {/* Night visibility score */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-th-muted">Night-sky visibility</span>
          <span className="text-xs font-semibold text-th-text">
            {visibility.score}/100 — {visibility.level}
          </span>
        </div>
        <VisibilityBar score={visibility.score} />
        <p className="text-xs text-th-text-2 mt-2 leading-relaxed">{visibility.moon_impact}</p>
      </div>
    </div>
  );
}
