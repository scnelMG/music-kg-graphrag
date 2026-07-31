import type { NextConfig } from "next";

const exposedBackendSecret = process.env.NEXT_PUBLIC_BACKEND_SHARED_SECRET;

if (exposedBackendSecret !== undefined && exposedBackendSecret.length > 0) {
  throw new Error("NEXT_PUBLIC_BACKEND_SHARED_SECRET is forbidden: backend credentials must remain server-only.");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
