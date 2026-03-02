import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Space / Night sky ─────────────────────────────────
        space: {
          950: "#020617",
          900: "#060d24",
          800: "#0a1628",
          700: "#0f1f3d",
          600: "#162444",
          500: "#1e3158",
          400: "#2d4a7a",
          300: "#3d6199",
          200: "#5a84c0",
          100: "#93b4e0",
          50:  "#dce8f5",
        },
        // ── Solar / Amber ─────────────────────────────────────
        solar: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
        // ── Moon / Indigo-Blue ────────────────────────────────
        moon: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        // ── Weather / Emerald ─────────────────────────────────
        weather: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        // ── Danger / Risk Red ─────────────────────────────────
        danger: {
          50:  "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
        },
        // ── Semantic theme tokens (reference CSS custom properties) ──
        // Adapts automatically between dark/light via CSS variables.
        // Usage: text-th-text, bg-th-card, border-th-border, text-th-solar, etc.
        "th-bg":       "rgb(var(--bg-primary) / <alpha-value>)",
        "th-bg-2":     "rgb(var(--bg-secondary) / <alpha-value>)",
        "th-bg-card":  "rgb(var(--bg-card) / <alpha-value>)",
        "th-border":   "rgb(var(--border-color) / <alpha-value>)",
        "th-text":     "rgb(var(--text-primary) / <alpha-value>)",
        "th-text-2":   "rgb(var(--text-secondary) / <alpha-value>)",
        "th-muted":    "rgb(var(--text-muted) / <alpha-value>)",
        "th-solar":    "rgb(var(--accent-solar) / <alpha-value>)",
        "th-moon":     "rgb(var(--accent-moon) / <alpha-value>)",
        "th-weather":  "rgb(var(--accent-weather) / <alpha-value>)",
        "th-danger":   "rgb(var(--accent-danger) / <alpha-value>)",
        // ── Brand amber (legacy) ──────────────────────────────
        brand: {
          50:  "#fff8e1",
          100: "#ffecb3",
          200: "#ffe082",
          300: "#ffd54f",
          400: "#ffca28",
          500: "#ffc107",
          600: "#ffb300",
          700: "#ffa000",
          800: "#ff8f00",
          900: "#ff6f00",
        },
      },
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "gradient-hero":   "radial-gradient(ellipse 80% 60% at 50% 0%, #162444 0%, #020617 100%)",
        "gradient-card":   "linear-gradient(135deg, rgba(22,36,68,0.7) 0%, rgba(9,22,40,0.85) 100%)",
        "gradient-solar":  "linear-gradient(135deg, #ff8f00 0%, #ffc107 60%, #fff8e1 100%)",
        "gradient-aurora": "linear-gradient(135deg, #020617 0%, #0f1f3d 40%, #2d4a7a 70%, #4f46e5 100%)",
      },
      boxShadow: {
        "glow-solar": "0 0 24px rgba(251,191,36,0.35), 0 0 60px rgba(251,191,36,0.12)",
        "glow-moon":  "0 0 24px rgba(99,102,241,0.35), 0 0 60px rgba(99,102,241,0.12)",
        "glow-green": "0 0 24px rgba(52,211,153,0.3),  0 0 60px rgba(52,211,153,0.10)",
        "card-dark":  "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        "card-hover": "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        "input":      "0 0 0 1px rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.3)",
        "input-focus":"0 0 0 2px rgba(251,191,36,0.5), 0 4px 16px rgba(0,0,0,0.3)",
      },
      animation: {
        "sun-pulse":  "sunPulse 4s ease-in-out infinite",
        "slow-spin":  "spin 30s linear infinite",
        "float":      "float 6s ease-in-out infinite",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
        "shimmer":    "shimmer 2s linear infinite",
        "fade-in":    "fadeIn 0.5s ease-out forwards",
        "slide-up":   "slideUp 0.4s ease-out forwards",
        "twinkle":    "twinkle 3s ease-in-out infinite",
      },
      keyframes: {
        sunPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(251,191,36,0.4), 0 0 60px rgba(251,191,36,0.1)" },
          "50%":      { boxShadow: "0 0 40px rgba(251,191,36,0.7), 0 0 100px rgba(251,191,36,0.2)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-10px)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.5" },
          "50%":      { opacity: "1" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.2", transform: "scale(1)" },
          "50%":      { opacity: "1",   transform: "scale(1.4)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
