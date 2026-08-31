import type { NextConfig } from "next";

const exposedBackendSecrets = [
  process.env.NEXT_PUBLIC_BACKEND_BFF_SHARED_SECRET,
  process.env.NEXT_PUBLIC_BACKEND_SHARED_SECRET
];

if (exposedBackendSecrets.some((secret) => secret !== undefined && secret.length > 0)) {
  throw new Error("NEXT_PUBLIC backend credentials are forbidden: backend credentials must remain server-only.");
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  htmlLimitedBots: /.*/,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86_400,
    remotePatterns: [
      { hostname: "coverartarchive.org", pathname: "/**", protocol: "https" },
      { hostname: "*.mzstatic.com", pathname: "/**", protocol: "https" }
    ]
  },
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
