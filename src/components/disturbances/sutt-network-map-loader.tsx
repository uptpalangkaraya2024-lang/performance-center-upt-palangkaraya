"use client";

// Thin client-only wrapper around the dynamic import — in this Next.js
// version `ssr: false` is rejected when passed to next/dynamic from a
// Server Component (see node_modules/next/dist/docs/01-app/02-guides/
// lazy-loading.md's own "Note" on this), so the ssr:false call has to live
// in a Client Component instead; the actual page (a Server Component)
// just renders this wrapper.
import nextDynamic from "next/dynamic";
import type { SuttNetworkMapData } from "@/lib/sutt-map";

const SuttNetworkMap = nextDynamic(
  () => import("@/components/disturbances/sutt-network-map").then((m) => m.SuttNetworkMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">Memuat peta...</div>
    ),
  },
);

export function SuttNetworkMapLoader({ data }: { data: SuttNetworkMapData }) {
  return <SuttNetworkMap data={data} />;
}
