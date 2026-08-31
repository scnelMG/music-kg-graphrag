import type { NextRequest } from "next/server";

type RateBucket = Readonly<{ count: number; resetAt: number }>;

const maxBuckets = 1_024;
const buckets = new Map<string, RateBucket>();

function clientKey(request: NextRequest, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded && forwarded.length > 0 ? forwarded : "unknown";
  return `${scope}:${address}`;
}

function discardExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= maxBuckets) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) return;
    buckets.delete(oldest);
  }
}

export function rateLimit(request: NextRequest, scope: string, limit: number, windowMs: number): number | null {
  const now = Date.now();
  discardExpired(now);
  const key = clientKey(request, scope);
  const current = buckets.get(key);
  if (current === undefined || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (current.count >= limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
  buckets.set(key, { ...current, count: current.count + 1 });
  return null;
}

export function clearRateLimit(request: NextRequest, scope: string): void {
  buckets.delete(clientKey(request, scope));
}

export function resetRateLimitsForTest(): void {
  buckets.clear();
}
