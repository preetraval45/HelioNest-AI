"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    // Auth endpoint wired in Phase 2 (Task 2.7)
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setError("Authentication not yet available — coming in Phase 2.");
  }

  return (
    <div className="min-h-screen flex flex-col bg-th-bg">
      <Navbar />

      {/* Background glow orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full bg-th-solar/5 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full bg-th-moon/5 blur-3xl" />
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-md">
          <div className="glass-card rounded-3xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-th-solar/10 border border-th-solar/20 flex items-center justify-center text-3xl mx-auto mb-4">
                ☀️
              </div>
              <h1 className="text-2xl font-bold text-th-text">Welcome back</h1>
              <p className="text-th-text-2 text-sm mt-1">Sign in to access your saved properties</p>
            </div>

            {/* Coming Soon Banner */}
            <div className="mb-6 px-4 py-3 bg-th-solar/10 border border-th-solar/20 rounded-xl text-center">
              <p className="text-th-solar text-xs font-medium">
                Authentication coming in Phase 2 — you can still analyze addresses without an account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-th-text-2 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-field w-full rounded-xl px-4 py-2.5 text-sm"
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-th-text-2 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field w-full rounded-xl px-4 py-2.5 text-sm"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-th-danger/10 border border-th-danger/20">
                  <p className="text-th-danger text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-solar w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Signing in...</span>
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-th-text-2">
              Don&apos;t have an account?{" "}
              <a href="/register" className="text-th-solar hover:underline font-medium">
                Create one
              </a>
            </div>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-sm text-th-muted hover:text-th-text-2 transition-colors"
              >
                ← Continue without account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
