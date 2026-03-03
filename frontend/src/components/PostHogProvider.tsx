"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Lazy-load PostHog — only initialise when the key is configured
let posthog: { capture: (event: string, props?: Record<string, unknown>) => void; init: (key: string, opts: Record<string, unknown>) => void } | null = null;

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

async function loadPostHog() {
  if (posthog || !POSTHOG_KEY) return;
  const ph = await import("posthog-js");
  ph.default.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,  // We handle pageviews manually
    persistence: "localStorage",
    autocapture: false,
  });
  posthog = ph.default as unknown as typeof posthog;
}

/** Track a custom PostHog event. No-op when PostHog is not configured. */
export function trackEvent(event: string, props?: Record<string, unknown>) {
  posthog?.capture(event, props);
}

/** Initialise PostHog and track automatic page views. Add once to root layout. */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    void loadPostHog();
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    void loadPostHog().then(() => {
      posthog?.capture("$pageview", {
        $current_url: window.location.href,
        pathname,
        search: searchParams.toString(),
      });
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
