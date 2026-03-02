import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["api.mapbox.com"],
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
