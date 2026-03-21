"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { reverseGeocode } from "@/lib/api/addressApi";

const RECENT_KEY = "helionest_recent_addresses";
const MAX_RECENT = 5;

function navigate(addr: string) {
  globalThis.location.href = `/property/${encodeURIComponent(addr)}`;
}

function getRecentAddresses(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentAddress(addr: string) {
  try {
    const prev = getRecentAddresses().filter((a) => a !== addr);
    localStorage.setItem(RECENT_KEY, JSON.stringify([addr, ...prev].slice(0, MAX_RECENT)));
  } catch { /* localStorage may be unavailable */ }
}

interface NominatimResult {
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
}

function formatNominatimAddress(r: NominatimResult): string {
  const a = r.address;
  const parts: string[] = [];
  if (a.house_number && a.road) parts.push(`${a.house_number} ${a.road}`);
  else if (a.road) parts.push(a.road);
  if (a.city) parts.push(a.city);
  if (a.state) parts.push(a.state);
  if (a.postcode) parts.push(a.postcode);
  return parts.join(", ") || r.display_name;
}

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
    desc: "Satellite shadow map with sun compass, 3D building scene with real OSM footprints, and a 360° sky dome with live sun placement.",
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
  const [address, setAddress]       = useState("");
  const [error, setError]           = useState("");
  const [locating, setLocating]     = useState(false);
  const [locError, setLocError]     = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentAddresses(getRecentAddresses());
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 5) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=us&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        if (!res.ok) return;
        const data: NominatimResult[] = await res.json();
        setSuggestions(data.map(formatNominatimAddress));
        setShowDropdown(true);
        setHighlightIdx(-1);
      } catch { /* ignore network errors */ }
    }, 450);
  }, []);

  function handleAddressChange(val: string) {
    setAddress(val);
    setError("");
    if (val.trim().length >= 5) {
      fetchSuggestions(val);
    } else {
      setSuggestions([]);
      setShowDropdown(val.length === 0 && recentAddresses.length > 0);
    }
  }

  function handleSelectSuggestion(addr: string) {
    setAddress(addr);
    setShowDropdown(false);
    setSuggestions([]);
    saveRecentAddress(addr);
    navigate(addr);
  }

  function handleSubmit() {
    const v = address.trim();
    if (!v || v.length < 5) { setError("Please enter a full U.S. address."); return; }
    setError("");
    // If there are autocomplete suggestions and the user typed without selecting one,
    // use the first suggestion (which has the full city/state) for better geocoding.
    const best = suggestions.length > 0 ? suggestions[0] : v;
    saveRecentAddress(best);
    navigate(best);
  }

  function tryExample(addr: string) {
    setAddress(addr);
    saveRecentAddress(addr);
    navigate(addr);
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setLocError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const loc = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          saveRecentAddress(loc.formatted_address);
          navigate(loc.formatted_address);
        } catch {
          setLocError("Could not identify your address. Are you in the US?");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocError("Location access denied. Please allow location access in your browser settings.");
        } else {
          setLocError("Could not get your location. Please enter your address manually.");
        }
      },
      { timeout: 12000, maximumAge: 60000 }
    );
  }

  let dropdownItems: { label: string; isRecent?: boolean }[] = [];
  if (suggestions.length > 0) {
    dropdownItems = suggestions.map((s) => ({ label: s }));
  } else if (showDropdown && recentAddresses.length > 0) {
    dropdownItems = recentAddresses.map((s) => ({ label: s, isRecent: true }));
  }

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center px-4 pt-20 pb-24 text-center overflow-hidden">
        {/* Glow orbs — purely decorative */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full blur-3xl opacity-20 pointer-events-none bg-th-solar" />
        <div className="absolute top-24 right-1/4 w-[250px] h-[250px] rounded-full blur-3xl opacity-10 pointer-events-none bg-th-moon" />

        {/* Live badge */}
        <div className="badge-solar mb-6">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block bg-th-solar" />{" "}
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

        {/* Search with autocomplete */}
        <div className="w-full max-w-2xl relative">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <div className="flex gap-2 p-1.5 rounded-2xl shadow-lg border bg-th-bg-card border-th-border">
              <input
                ref={inputRef}
                type="text"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => {
                  setShowDropdown(
                    address.length === 0 ? recentAddresses.length > 0 : suggestions.length > 0
                  );
                }}
                onKeyDown={(e) => {
                  if (!showDropdown || dropdownItems.length === 0) return;
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightIdx((i) =>
                      e.key === "ArrowDown"
                        ? Math.min(i + 1, dropdownItems.length - 1)
                        : Math.max(i - 1, -1)
                    );
                  } else if (e.key === "Enter" && highlightIdx >= 0) {
                    e.preventDefault();
                    handleSelectSuggestion(dropdownItems[highlightIdx].label);
                  } else if (e.key === "Escape") {
                    setShowDropdown(false);
                    setHighlightIdx(-1);
                  }
                }}
                placeholder="Enter any U.S. street address…"
                className="flex-1 px-4 py-3 text-sm bg-transparent outline-none text-th-text placeholder:text-th-muted"
                autoComplete="off"
                aria-label="Street address"
                aria-autocomplete="list"
              />
              <button type="submit" className="btn-solar px-6 py-3 rounded-xl text-sm font-semibold shrink-0">
                Analyze →
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-th-danger">{error}</p>}
          </form>

          {/* Autocomplete / Recent dropdown */}
          {showDropdown && dropdownItems.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1.5 bg-th-bg-card border border-th-border rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              {dropdownItems[0].isRecent && (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-th-muted uppercase tracking-wide border-b border-th-border flex items-center justify-between">
                  <span>Recent searches</span>
                  <button
                    type="button"
                    onClick={() => { localStorage.removeItem(RECENT_KEY); setRecentAddresses([]); setShowDropdown(false); }}
                    className="text-th-muted hover:text-th-danger transition-colors"
                  >Clear</button>
                </div>
              )}
              {dropdownItems.map((item, idx) => (
                <button
                  key={item.label}
                  type="button"
                  aria-current={idx === highlightIdx ? "true" : undefined}
                  onClick={() => handleSelectSuggestion(item.label)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                    idx === highlightIdx
                      ? "bg-amber-500/10 text-amber-400"
                      : "text-th-text hover:bg-th-bg-2"
                  }`}
                >
                  <span className="shrink-0 text-th-muted">{item.isRecent ? "🕐" : "📍"}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GPS + Example pills */}
        <div className="flex flex-wrap justify-center items-center gap-2 mt-4">
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={locating}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all hover:-translate-y-0.5 duration-150 disabled:opacity-60 disabled:cursor-not-allowed border-th-solar/40 text-th-solar bg-th-solar/8 hover:bg-th-solar/15"
          >
            {locating
              ? <span className="w-3 h-3 rounded-full border border-t-th-solar border-th-solar/20 animate-spin" />
              : <span>📍</span>
            }
            {locating ? "Locating…" : "Use my location"}
          </button>

          <span className="text-xs text-th-muted">or try:</span>
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
        {locError && <p className="mt-2 text-xs text-th-danger text-center max-w-sm">{locError}</p>}
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
              { step: "1", title: "Enter Address",  desc: "Type any U.S. street address — autocomplete suggests matches instantly." },
              { step: "2", title: "Data Fetched",   desc: "Solar, weather, moon & climate data pulled in real time from multiple sources." },
              { step: "3", title: "AI Explains",    desc: "Claude translates raw numbers into actionable insights for your property." },
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
            onClick={() => inputRef.current?.focus()}
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
