"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";

const FEATURES = [
  {
    icon: "☀️", label: "Solar", labelClass: "badge-solar",
    title: "Solar Intelligence",
    desc: "Sunrise/sunset, animated sun path arc, seasonal irradiance, peak solar hours, and UV index — specific to your address.",
  },
  {
    icon: "🌡️", label: "Weather", labelClass: "badge-weather",
    title: "Climate & Weather",
    desc: "Real-time conditions, 7-day forecast, monthly climate norms, heat index, wind chill, and outdoor comfort scores (0–100).",
  },
  {
    icon: "🏠", label: "Impact", labelClass: "badge-solar",
    title: "Property Heat Impact",
    desc: "Facade solar load by direction (N/S/E/W), car interior heat risk model, and an annual outdoor living score.",
  },
  {
    icon: "🤖", label: "AI", labelClass: "badge-moon",
    title: "Multi-Agent AI",
    desc: "Ask anything about your property. Specialist Claude AI agents for solar, weather, heat impact, and future climate risk.",
  },
  {
    icon: "🗺️", label: "3D / 360°", labelClass: "badge-weather",
    title: "2D · 3D · 360° Views",
    desc: "Satellite map with sun compass, 3D building model with shadow sweep, and a full 360° sky dome with live sun & moon placement.",
  },
  {
    icon: "🌙", label: "Moon", labelClass: "badge-moon",
    title: "Moon Intelligence",
    desc: "Lunar phase, illumination, moonrise/moonset, night-sky visibility score, and a full lunar calendar for any date.",
  },
];

const STATS = [
  { value: "300+", label: "Data points / property" },
  { value: "Free",  label: "No account required" },
  { value: "AI",    label: "Claude-powered" },
  { value: "U.S.", label: "All U.S. addresses" },
];

const EXAMPLES = [
  "1600 Pennsylvania Ave NW, Washington, DC",
  "350 Fifth Ave, New York, NY",
  "1 Infinite Loop, Cupertino, CA",
];

export default function HomePage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [error, setError]   = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const v = address.trim();
    if (!v || v.length < 5) { setError("Please enter a full U.S. address."); return; }
    setError("");
    router.push(`/property/${encodeURIComponent(v)}`);
  }

  function tryExample(addr: string) {
    setAddress(addr);
    router.push(`/property/${encodeURIComponent(addr)}`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center px-4 pt-20 pb-24 text-center overflow-hidden">
        {/* Glow orbs — purely decorative, use allowed inline style for dynamic gradient */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full blur-3xl opacity-20 pointer-events-none bg-th-solar" />
        <div className="absolute top-24 right-1/4 w-[250px] h-[250px] rounded-full blur-3xl opacity-10 pointer-events-none bg-th-moon" />

        {/* Live badge */}
        <div className="badge-solar mb-6">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block bg-th-solar" />
          AI-Powered · Free · All U.S. Addresses
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-5 max-w-3xl text-balance text-th-text">
          Know Your Property&apos;s{" "}
          <span className="text-gradient-hero">Climate Story</span>
        </h1>

        <p className="text-base sm:text-lg max-w-xl mb-10 leading-relaxed text-th-text-2">
          Enter any U.S. address — instantly get solar, weather, and environmental
          intelligence explained by AI.
        </p>

        {/* Search */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl">
          <div className="flex gap-2 p-1.5 rounded-2xl shadow-lg border bg-th-bg-card border-th-border">
            <input
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError(""); }}
              placeholder="123 Main St, Charlotte, NC 28201"
              className="flex-1 px-4 py-3 text-sm bg-transparent outline-none text-th-text placeholder:text-th-muted"
            />
            <button type="submit" className="btn-solar px-6 py-3 rounded-xl text-sm font-semibold shrink-0">
              Analyze →
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-th-danger">{error}</p>}
        </form>

        {/* Example pills */}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <span className="text-xs self-center text-th-muted">Try:</span>
          {EXAMPLES.map((addr) => (
            <button
              key={addr}
              type="button"
              onClick={() => tryExample(addr)}
              className="text-xs px-2.5 py-1 rounded-full border transition-all hover:-translate-y-0.5 duration-150 text-th-text-2 border-th-border bg-th-bg-2"
            >
              {addr.split(",")[0]}
            </button>
          ))}
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────── */}
      <section className="border-y border-th-border py-8">
        <div className="max-w-3xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-bold text-gradient-solar">{s.value}</div>
              <div className="text-xs mt-1 text-th-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-20 w-full">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-th-text">
            Everything about your property&apos;s climate
          </h2>
          <p className="text-sm text-th-text-2">
            Six intelligence modules, powered by real data and Claude AI
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{f.icon}</span>
                <span className={f.labelClass}>{f.label}</span>
              </div>
              <h3 className="font-semibold text-sm mb-2 text-th-text">{f.title}</h3>
              <p className="text-sm leading-relaxed text-th-text-2">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="py-20 border-t border-th-border bg-th-bg-2">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-10 text-th-text">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Enter Address",  desc: "Type any U.S. street address." },
              { step: "2", title: "Data Fetched",   desc: "Solar, weather, moon & climate data pulled in real time." },
              { step: "3", title: "AI Explains",    desc: "Claude translates raw numbers into actionable insights." },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border bg-th-solar/10 border-th-solar/30 text-th-solar">
                  {item.step}
                </div>
                <h3 className="font-semibold text-sm text-th-text">{item.title}</h3>
                <p className="text-xs leading-relaxed text-th-text-2">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-xl mx-auto rounded-3xl p-10 border bg-th-bg-card border-th-border">
          <div className="text-4xl mb-4">🏠</div>
          <h2 className="text-2xl font-bold mb-3 text-th-text">
            Ready to understand your property?
          </h2>
          <p className="text-sm mb-6 text-th-text-2">
            No account needed. Enter any address and get your full climate report instantly.
          </p>
          <button
            type="button"
            onClick={() => (document.querySelector("input") as HTMLElement)?.focus()}
            className="btn-solar px-8 py-3 rounded-xl text-sm font-semibold"
          >
            Analyze My Property →
          </button>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-th-border py-6 px-4 text-xs text-th-muted">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span>© 2026 HelioNest AI</span>
          <span>Next.js · FastAPI · PostgreSQL / PostGIS · Claude AI</span>
          <div className="flex gap-4">
            <a href="/login"    className="hover:underline text-th-text-2">Login</a>
            <a href="/register" className="hover:underline text-th-text-2">Sign up</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
