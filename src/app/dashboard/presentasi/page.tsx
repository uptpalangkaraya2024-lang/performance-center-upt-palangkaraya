import { PageHero } from "@/components/dashboard/page-hero";
import { PresentationBuilderView } from "@/components/presentation/presentation-builder-view";
import { getPresentationMateriCatalog } from "@/services/presentation-materi";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why — this page fans out to nearly
// every module's own service in parallel (see getPresentationMateriCatalog).
export const maxDuration = 60;

export default async function PresentasiPage() {
  const catalog = await getPresentationMateriCatalog();

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
        <PresentationBuilderView catalog={catalog.options} />
      )}
    </div>
  );
}
