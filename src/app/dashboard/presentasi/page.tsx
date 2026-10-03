import { PageHero } from "@/components/dashboard/page-hero";
import { PresentationBuilderView } from "@/components/presentation/presentation-builder-view";
import { getPresentationMateriCatalog } from "@/services/presentation-materi";
import { listSavedPresentations } from "@/services/saved-presentations";
import type { SavedPresentationSummary } from "@/types";

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

export default async function PresentasiPage() {
  const [catalog, saved] = await Promise.all([getPresentationMateriCatalog(), loadSavedList()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHero
          title="Presentasi"
          description="Susun presentasi evaluasi program kerja dari data dashboard — pilih materi siap pakai, atau gunakan AI Assistant untuk materi yang belum tersedia sebagai data (mis. kendala & usulan)."
        />
      </div>

      {catalog.error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Gagal memuat materi presentasi: {catalog.error}
        </p>
      ) : (
        <PresentationBuilderView catalog={catalog.options} initialSavedList={saved.list} savedListError={saved.error} />
      )}
    </div>
  );
}
