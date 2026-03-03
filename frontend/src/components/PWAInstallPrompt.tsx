"use client";

import { useEffect, useState } from "react";

const VIEWS_KEY = "hn-property-views";
const DISMISSED_KEY = "hn-pwa-dismissed";
const VIEWS_THRESHOLD = 2;

// Augment window type for PWA install prompt
declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function incrementPropertyViews() {
  try {
    const current = parseInt(localStorage.getItem(VIEWS_KEY) ?? "0", 10);
    localStorage.setItem(VIEWS_KEY, String(current + 1));
  } catch {
    // localStorage unavailable
  }
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const views = parseInt(localStorage.getItem(VIEWS_KEY) ?? "0", 10);
    if (views < VIEWS_THRESHOLD) return;

    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ok */ }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Install HelioNest app"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 glass-card border border-amber-500/30 shadow-2xl animate-slide-up"
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 text-white text-lg font-bold shadow">
          ☀
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-th-text">Add HelioNest to Home Screen</p>
          <p className="text-xs text-th-muted mt-0.5">
            Get instant access to property climate insights — works offline.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleInstall}
              className="btn-solar text-xs px-3 py-1.5 rounded-lg"
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="btn-ghost text-xs px-3 py-1.5 rounded-lg"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="text-th-muted hover:text-th-text transition-colors shrink-0 -mt-0.5"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
