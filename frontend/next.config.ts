import type { NextConfig } from "next";

const exposedBackendSecrets = [
  process.env.NEXT_PUBLIC_BACKEND_BFF_SHARED_SECRET,
  process.env.NEXT_PUBLIC_BACKEND_SHARED_SECRET
];

if (exposedBackendSecrets.some((secret) => secret !== undefined && secret.length > 0)) {
  throw new Error("NEXT_PUBLIC backend credentials are forbidden: backend credentials must remain server-only.");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
