import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { LoadingScreen } from "@/components/dashboard/loading-screen";
import { AboPageShell } from "@/components/abo/abo-page-shell";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import type { AboSnapshot } from "@/types";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

// Same streaming fix as the homepage/Laporan Eksekutif/4DX: both fetches
// kicked off here (not awaited) so the page shell streams immediately
// instead of blocking on both ABO files before any html goes out.
// AboPageShell itself (its tabs + PageHero) is a Client Component that
// needs both snapshots already resolved as props, so the whole thing is
// wrapped in one Suspense boundary rather than split further.
export default function AboPage() {
  const proteksiPromise = getAboProteksiSnapshot();
  const hargiPromise = getAboHargiSnapshot();

  return (
    <Suspense fallback={<AboFallback />}>
      <AboBody proteksiPromise={proteksiPromise} hargiPromise={hargiPromise} />
    </Suspense>
  );
}

function AboFallback() {
  return (
    <Card>
      <CardContent className="py-6">
        <LoadingScreen />
      </CardContent>
    </Card>
  );
}

async function AboBody({
  proteksiPromise,
  hargiPromise,
}: {
  proteksiPromise: Promise<AboSnapshot>;
  hargiPromise: Promise<AboSnapshot>;
}) {
  const [proteksi, hargi] = await Promise.all([proteksiPromise, hargiPromise]);
  return <AboPageShell proteksi={proteksi} hargi={hargi} />;
}
