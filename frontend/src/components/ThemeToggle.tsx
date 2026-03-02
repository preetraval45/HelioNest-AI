"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-solar-400 ${
        isDark
          ? "bg-space-600 border border-space-400"
          : "bg-slate-200 border border-slate-300"
      } ${className}`}
    >
      {/* Track icons */}
      <span className="absolute left-1 text-[10px] select-none">{isDark ? "🌙" : ""}</span>
      <span className="absolute right-1 text-[10px] select-none">{isDark ? "" : "☀️"}</span>

      {/* Thumb */}
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full shadow-md transition-transform duration-300 flex items-center justify-center text-xs ${
          isDark
            ? "translate-x-6 bg-solar-400"
            : "translate-x-0.5 bg-white"
        }`}
      />
    </button>
  );
}
