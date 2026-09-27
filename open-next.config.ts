import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config: this app doesn't lean on Next's built-in ISR/data cache —
// every page that reads live sheet data already opts out via
// `dynamic = "force-dynamic"` and does its own caching through
// src/lib/shared-cache.ts (Upstash Redis), so there's no incremental-cache
// override to wire up here. Revisit if a future page adds real ISR.
export default defineCloudflareConfig();
