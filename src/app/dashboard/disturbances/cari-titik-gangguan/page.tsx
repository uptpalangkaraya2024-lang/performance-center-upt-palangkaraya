import Link from "next/link";
import { ArrowLeft, ExternalLink, Radar } from "lucide-react";

import { PageHero } from "@/components/dashboard/page-hero";
import { buttonVariants } from "@/components/ui/button";
import { SuttFaultLocatorView } from "@/components/disturbances/sutt-fault-locator-view";
import { getSuttSnapshot } from "@/services/sutt-asset";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

// Not a module this app owns or can read data from (no API access
// confirmed) — a plain cross-reference link to the UPT's own existing
// lightning/disturbance map tool, so a user can sanity-check a tower match
// against it without leaving a browser tab's worth of context.
const LIGHTNING_WATCH_URL = "https://lightning-watch.uptpky.workers.dev/";

export default async function CariTitikGangguanPage() {
  const { ruasList, error } = await getSuttSnapshot();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Cari Titik Gangguan"
        description="Cocokkan jarak gangguan (TWFL/SMDE/VAISALA) dengan data tower SUTT untuk memperkirakan lokasi — pilih ruas, masukkan jarak dari tiap metode yang ada, lalu salin hasilnya dalam format siap kirim WhatsApp."
        actions={
          <>
            <a
              href={LIGHTNING_WATCH_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Radar className="size-3.5" />
              Lightning Watch
              <ExternalLink className="size-3" />
            </a>
            <Link href="/dashboard/disturbances" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft className="size-3.5" />
              Kembali ke Gangguan
            </Link>
          </>
        }
      />
      <SuttFaultLocatorView ruasList={ruasList} error={error} />
    </div>
  );
}
