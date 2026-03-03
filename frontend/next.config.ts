import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    domains: ["api.mapbox.com"],
  },
  experimental: {
    typedRoutes: true,
  },
};

// next-pwa 5.x uses CommonJS — wrap after defining nextConfig
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Cache strategies for key asset types
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
      handler: "CacheFirst",
      options: { cacheName: "mapbox-cache", expiration: { maxEntries: 50, maxAgeSeconds: 86400 } },
    },
    {
      urlPattern: /^https:\/\/archive-api\.open-meteo\.com\/.*/i,
      handler: "NetworkFirst",
      options: { cacheName: "climate-api", networkTimeoutSeconds: 10 },
    },
    {
      urlPattern: /\/api\/v1\/(solar|weather|moon|property)\/.*/i,
      handler: "NetworkFirst",
      options: { cacheName: "helionest-api", networkTimeoutSeconds: 8 },
    },
  ],
});

export default withBundleAnalyzer(withPWA(nextConfig));
