import type { NextConfig } from "next";

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
};

export default nextConfig;
