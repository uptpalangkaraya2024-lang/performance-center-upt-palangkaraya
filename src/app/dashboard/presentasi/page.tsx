import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { PageHero } from "@/components/dashboard/page-hero";
import { PresentationBuilderView } from "@/components/presentation/presentation-builder-view";
import { getPresentationMateriCatalog } from "@/services/presentation-materi";
import { listSavedPresentations } from "@/services/saved-presentations";
import type { PresentationMateriCatalog, SavedPresentationSummary } from "@/types";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why — this page fans out to nearly
// every module's own service in parallel (see getPresentationMateriCatalog).
export const maxDuration = 60;

async function loadSavedList(): Promise<{ list: SavedPresentationSummary[]; error: string | null }> {
  // listSavedPresentations() throws when Redis isn't configured (see
  // src/services/saved-presentations.ts's own comment on why that's
  // intentional for a SAVE call) — but a page LOAD shouldn't hard-fail just
  // because the "Presentasi Tersimpan" section can't load; it degrades to
  // an empty list with an explanatory message instead.
  try {
    return { list: await listSavedPresentations(), error: null };
  } catch (err) {
    return { list: [], error: err instanceof Error ? err.message : "Gagal memuat daftar presentasi tersimpan." };
  }
}

// Same streaming fix as the homepage/Laporan Eksekutif/4DX/ABO: both
// fetches kicked off here (not awaited) so the page shell (PageHero)
// streams immediately instead of blocking on getPresentationMateriCatalog
// (already internally parallel across ~9 modules, but still gated on the
// single slowest one) before any html goes out.
export default function PresentasiPage() {
  const catalogPromise = getPresentationMateriCatalog();
  const savedPromise = loadSavedList();

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHero
          title="Presentasi"
          description="Susun presentasi evaluasi program kerja dari data dashboard — pilih materi siap pakai, atau gunakan AI Assistant untuk materi yang belum tersedia sebagai data (mis. kendala & usulan)."
        />
      </div>

      <Suspense fallback={<PresentasiFallback />}>
        <PresentasiBody catalogPromise={catalogPromise} savedPromise={savedPromise} />
      </Suspense>
    </div>
  );
}

function PresentasiFallback() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

async function PresentasiBody({
  catalogPromise,
  savedPromise,
}: {
  catalogPromise: Promise<PresentationMateriCatalog>;
  savedPromise: Promise<{ list: SavedPresentationSummary[]; error: string | null }>;
}) {
  const [catalog, saved] = await Promise.all([catalogPromise, savedPromise]);

  return catalog.error ? (
    <p className="py-8 text-center text-sm text-muted-foreground">Gagal memuat materi presentasi: {catalog.error}</p>
  ) : (
    <PresentationBuilderView catalog={catalog.options} initialSavedList={saved.list} savedListError={saved.error} />
  );
}
