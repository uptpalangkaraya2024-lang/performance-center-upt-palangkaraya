import "server-only";

import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

import type { PresentationSlide, SavedPresentation, SavedPresentationSummary } from "@/types";

// Persists user-saved Presentasi decks — NOT the same role as
// src/lib/shared-cache.ts, which is a best-effort, never-throws CACHE for
// read-only spreadsheet data (losing it just means a slower re-fetch next
// time). This is the opposite: content the user explicitly asked to keep,
// so a Redis failure here has to surface as a real, visible error — silently
// swallowing it would mean "Simpan" lies about having saved anything.
//
// All saved presentations live in ONE Redis hash (field = presentation id,
// value = the full SavedPresentation record) rather than one key per
// presentation — this dashboard is single-tenant with no user accounts, so
// there's no need to shard by user, and a hash gives O(1) list-all
// (HGETALL), get-one (HGET), upsert (HSET), and delete (HDEL) without a
// separate id-list key that could drift out of sync with the data itself.
const REDIS_KEY = "presentasi:saved";

let redisClient: Redis | null | undefined; // undefined = not checked yet
function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

function requireRedis(): Redis {
  const client = getRedisClient();
  if (!client) {
    throw new Error(
      "Penyimpanan presentasi belum dikonfigurasi di server (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum diatur).",
    );
  }
  return client;
}

function toSummary(p: SavedPresentation): SavedPresentationSummary {
  return { id: p.id, name: p.name, slideCount: p.slides.length, createdAt: p.createdAt, updatedAt: p.updatedAt };
}

/** Newest-updated first — a returning user almost always wants the
 *  presentation they were last working on, not an alphabetical list. */
export async function listSavedPresentations(): Promise<SavedPresentationSummary[]> {
  const client = requireRedis();
  const all = await client.hgetall<Record<string, SavedPresentation>>(REDIS_KEY);
  if (!all) return [];
  return Object.values(all)
    .map(toSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSavedPresentation(id: string): Promise<SavedPresentation | null> {
  const client = requireRedis();
  const record = await client.hget<SavedPresentation>(REDIS_KEY, id);
  return record ?? null;
}

/** Create (no `id`) or update in place (existing `id`) — same endpoint
 *  either way since the only real difference is whether `createdAt` carries
 *  forward from the existing record or is freshly stamped. */
export async function upsertSavedPresentation(input: {
  id?: string;
  name: string;
  slides: PresentationSlide[];
}): Promise<SavedPresentation> {
  const client = requireRedis();
  const now = new Date().toISOString();
  const existing = input.id ? await client.hget<SavedPresentation>(REDIS_KEY, input.id) : null;

  const record: SavedPresentation = {
    id: input.id ?? randomUUID(),
    name: input.name,
    slides: input.slides,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await client.hset(REDIS_KEY, { [record.id]: record });
  return record;
}

export async function deleteSavedPresentation(id: string): Promise<void> {
  const client = requireRedis();
  await client.hdel(REDIS_KEY, id);
}
