"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";

// Placeholder saved properties (Phase 2 will wire to real auth + API)
const PLACEHOLDER_PROPERTIES = [
  {
    id: 1,
    nickname: "My Home",
    formatted_address: "123 Main St, Charlotte, NC 28201",
    lat: 35.2271,
    lon: -80.8431,
    solar_score: 78,
    comfort_score: 65,
    risk: "moderate",
  },
  {
    id: 2,
    nickname: "Office",
    formatted_address: "525 N Tryon St, Charlotte, NC 28202",
    lat: 35.2284,
    lon: -80.8437,
    solar_score: 82,
    comfort_score: 58,
    risk: "high",
  },
];

const RISK_STYLES: Record<string, string> = {
  low:       "badge-weather",
  moderate:  "badge-solar",
  high:      "badge-moon",
  very_high: "badge-danger",
  extreme:   "badge-danger",
};

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={RISK_STYLES[risk] ?? "badge-solar"}>
      {risk.replace("_", " ")}
    </span>
  );
}

const QUICK_ADDRESSES = [
  "Empire State Building, New York, NY",
  "1600 Pennsylvania Ave, Washington, DC",
  "Fenway Park, Boston, MA",
];

export default function DashboardPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      <Navbar />

      {/* Background glow orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full bg-th-solar/5 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-72 h-72 rounded-full bg-th-moon/5 blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 relative z-10">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-th-text mb-1">Dashboard</h1>
            <p className="text-th-text-2 text-sm">Your saved properties and climate snapshots</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-th-solar/10 border border-th-solar/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-th-solar animate-pulse" />
            <span className="text-th-solar text-xs font-medium">Auth in Phase 2</span>
          </div>
        </div>

        {/* Quick Search */}
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-th-text mb-3">Quick Analysis</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = searchInput.trim();
              if (trimmed) router.push(`/property/${encodeURIComponent(trimmed)}`);
            }}
            className="flex gap-2"
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter any U.S. address to analyze..."
              className="input-field flex-1 rounded-xl px-4 py-2.5 text-sm"
            />
            <button type="submit" className="btn-solar px-5 py-2.5 rounded-xl text-sm font-medium">
              Analyze
            </button>
          </form>
          {/* Quick examples */}
          <div className="flex flex-wrap gap-2 mt-3">
            {QUICK_ADDRESSES.map((addr) => (
              <button
                key={addr}
                type="button"
                onClick={() => router.push(`/property/${encodeURIComponent(addr)}`)}
                className="px-3 py-1 rounded-lg text-xs text-th-text-2 bg-th-bg-2 border border-th-border hover:border-th-solar/40 hover:text-th-solar transition-all"
              >
                {addr}
              </button>
            ))}
          </div>
        </div>

        {/* Saved Properties */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-th-text">Saved Properties</h2>
            <span className="text-xs text-th-muted">Sample data — sign in to save yours</span>
          </div>

          <div className="grid gap-4">
            {PLACEHOLDER_PROPERTIES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/property/${encodeURIComponent(p.formatted_address)}`)}
                className="glass-card rounded-2xl p-5 hover:border-th-solar/30 transition-all text-left w-full group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-th-text group-hover:text-th-solar transition-colors">
                        {p.nickname}
                      </span>
                      <RiskBadge risk={p.risk} />
                    </div>
                    <p className="text-sm text-th-text-2 truncate">{p.formatted_address}</p>
                    <p className="text-xs text-th-muted mt-1 font-mono">
                      {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                    </p>
                  </div>
                  <div className="flex gap-4 text-center shrink-0">
                    <div>
                      <div className="text-xl font-bold text-th-solar">{p.solar_score}</div>
                      <div className="text-xs text-th-muted">Solar</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-th-weather">{p.comfort_score}</div>
                      <div className="text-xs text-th-muted">Comfort</div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* CTA to sign up */}
          <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center border border-dashed border-th-border rounded-2xl">
            <div className="w-12 h-12 rounded-2xl bg-th-bg-2 border border-th-border flex items-center justify-center text-2xl">
              🔒
            </div>
            <p className="text-th-text font-medium">Sign in to save properties</p>
            <p className="text-sm text-th-text-2">
              Save unlimited properties and get alerts when conditions change
            </p>
            <div className="flex gap-3 mt-1">
              <a href="/register" className="btn-solar px-5 py-2 rounded-lg text-sm font-medium">
                Create Account
              </a>
              <a
                href="/login"
                className="btn-ghost px-5 py-2 rounded-lg text-sm font-medium"
              >
                Login
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
