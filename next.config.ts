import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Lets `next dev` reach the same Cloudflare bindings (env vars, etc.) that
// production Workers gets, instead of only ever seeing them for real when
// running `wrangler dev`/`opennextjs-cloudflare preview`.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // ABO/4DX/CE/AHI moved out of /dashboard/kpi/* to /dashboard/* directly —
  // the "kpi" grouping was dropped from the sidebar nav a while back
  // (flattened into "Performance"), so the URL kept a segment that no
  // longer means anything in the UI. Permanent redirects keep any existing
  // bookmarks/links (including the one in the 4DX WA recap) working.
  async redirects() {
    return [
      { source: "/dashboard/kpi/abo", destination: "/dashboard/abo", permanent: true },
      { source: "/dashboard/kpi/4dx", destination: "/dashboard/4dx", permanent: true },
      { source: "/dashboard/kpi/ce", destination: "/dashboard/ce", permanent: true },
      { source: "/dashboard/kpi/ahi", destination: "/dashboard/ahi", permanent: true },
    ];
  },
  // Cloudflare Workers deployment (OpenNext) — the app only ever renders one
  // small static logo (36x36) via next/image, so Next's server-side image
  // optimization endpoint isn't worth the extra Cloudflare Images binding it
  // would need; serving the original file straight from /public is simpler
  // and just as fast for something this small.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
