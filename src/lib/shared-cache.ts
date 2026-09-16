import "server-only";

import { Redis } from "@upstash/redis";

export interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

// undefined = not checked yet, null = checked and not configured — avoids
// re-reading env vars (and re-constructing a client) on every single call.
let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

// Per-process memory — checked first since it's free (no network hop) and
// covers the common case of several requests landing on the same warm
// serverless instance within the same minute. Keyed globally (not per
// SharedCache instance) since each instance already namespaces its own keys.
const local = new Map<string, CacheEntry<unknown>>();

/**
 * Two-tier cache: an in-process Map (L1, instant) backed by Upstash Redis
 * (L2, shared across every serverless instance) when UPSTASH_REDIS_REST_URL
 * / UPSTASH_REDIS_REST_TOKEN are set. Without those env vars this behaves
 * exactly like the plain in-memory cache it replaces — safe to ship before
 * the Upstash database exists, and safe to keep running if Redis ever
 * becomes unreachable (every Redis call is best-effort, never throws).
 *
 * Freshness is judged by the caller comparing `fetchedAt` against its own
 * TTL (same as the in-memory-only cache this replaces) — Redis itself is
 * given a generous 24h expiry only as a safety net against dead keys
 * piling up forever, not as the real freshness signal. This matters
 * because a stale-but-present entry is still useful as a fallback when a
 * live upstream read fails (see src/lib/data-connector.ts) — a hard Redis
 * TTL at the "real" freshness window would delete that fallback exactly
 * when it's needed most.
 */
export class SharedCache<T> {
  constructor(private readonly namespace: string) {}

  private fullKey(key: string): string {
    return `${this.namespace}::${key}`;
  }

  async get(key: string): Promise<CacheEntry<T> | null> {
    const k = this.fullKey(key);
    const cached = local.get(k) as CacheEntry<T> | undefined;
    if (cached) return cached;

    const client = getRedisClient();
    if (!client) return null;
    try {
      const remote = await client.get<CacheEntry<T>>(k);
      if (remote) {
        local.set(k, remote);
        return remote;
      }
    } catch {
      // Redis unreachable — treat as a miss, caller falls back to a live fetch.
    }
    return null;
  }

  async set(key: string, value: T): Promise<void> {
    const k = this.fullKey(key);
    const entry: CacheEntry<T> = { value, fetchedAt: Date.now() };
    local.set(k, entry);

    const client = getRedisClient();
    if (!client) return;
    try {
      await client.set(k, entry, { ex: 60 * 60 * 24 });
    } catch {
      // Best-effort — the in-process copy above already has it.
    }
  }
}
