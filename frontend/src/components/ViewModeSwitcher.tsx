"use client";

import { useEffect } from "react";
import { trackEvent } from "@/components/PostHogProvider";

export type ViewMode = "2d" | "3d" | "360";

interface ViewModeSwitcherProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { key: ViewMode; label: string; icon: string; kbd: string }[] = [
  { key: "2d",  label: "2D Map",  icon: "🗺️",  kbd: "2" },
  { key: "3d",  label: "3D View", icon: "🏗️",  kbd: "3" },
  { key: "360", label: "360° Sky",icon: "🔭",  kbd: "0" },
];

export function ViewModeSwitcher({ mode, onChange }: Readonly<ViewModeSwitcherProps>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "2") onChange("2d");
      if (e.key === "3") onChange("3d");
      if (e.key === "0") onChange("360");
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [onChange]);

  return (
    <fieldset className="m-0 inline-flex items-center rounded-xl border border-th-border bg-th-bg-2 p-1 gap-1">
      <legend className="sr-only">Property view mode</legend>
      {MODES.map(({ key, label, icon, kbd }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={`${label} (press ${kbd})${active ? " — active" : ""}`}
            onClick={() => { onChange(key); trackEvent("view_mode_switched", { mode: key }); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 ${
              active
                ? "bg-th-solar/10 text-th-solar border border-th-solar/30"
                : "text-th-text-2 hover:text-th-text hover:bg-th-bg border border-transparent"
            }`}
          >
            <span aria-hidden="true">{icon}</span>
            <span className="hidden sm:inline">{label}</span>
            <kbd aria-hidden="true" className="hidden sm:inline text-[10px] px-1 py-0.5 rounded bg-th-bg border border-th-border text-th-muted font-mono">
              {kbd}
            </kbd>
          </button>
        );
      })}
    </fieldset>
  );
}
