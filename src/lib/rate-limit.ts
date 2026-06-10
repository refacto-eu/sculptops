// Fixed-window in-memory rate limiter — per-process, suitable for single-node deployments.
const buckets = new Map<string, { count: number; resetAt: number }>();

// Prune expired entries once the map gets large, so unauthenticated endpoints
// (login, register) can't grow memory unbounded with unique keys.
const PRUNE_THRESHOLD = 10_000;

/**
 * Records an attempt for `key` and returns true if it is within the limit
 * of `max` attempts per `windowMs` window.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();

  if (buckets.size >= PRUNE_THRESHOLD) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= max) return false;
  entry.count++;
  return true;
}
