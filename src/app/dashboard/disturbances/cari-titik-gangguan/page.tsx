import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHero } from "@/components/dashboard/page-hero";
import { buttonVariants } from "@/components/ui/button";
import { SuttFaultLocatorView } from "@/components/disturbances/sutt-fault-locator-view";
import { getSuttSnapshot } from "@/services/sutt-asset";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function CariTitikGangguanPage() {
  const { ruasList, error } = await getSuttSnapshot();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Cari Titik Gangguan"
        description="Cocokkan jarak gangguan (TWFL/SMDE/Vaisala) dengan data tower SUTT untuk memperkirakan lokasi — pilih ruas, masukkan jarak dari tiap metode yang ada, lalu salin hasilnya dalam format siap kirim WhatsApp."
        actions={
          <Link href="/dashboard/disturbances" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="size-3.5" />
            Kembali ke Gangguan
          </Link>
        }
      />
      <SuttFaultLocatorView ruasList={ruasList} error={error} />
    </div>
  );
}
