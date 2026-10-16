import Link from "next/link";
import { ArrowLeft, ExternalLink, Radar, Satellite } from "lucide-react";

import { PageHero } from "@/components/dashboard/page-hero";
import { buttonVariants } from "@/components/ui/button";
import { SuttFaultLocatorView } from "@/components/disturbances/sutt-fault-locator-view";
import { getSuttSnapshot } from "@/services/sutt-asset";
import { getSigapBayLineByFuncLoc } from "@/services/sigap";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

// Not a module this app owns or can read data from (no API access
// confirmed, unreachable from this app's own environment) — a plain
// cross-reference link to the UPT's own existing lightning/disturbance map
// tool, so a user can sanity-check a tower match against it without
// leaving a browser tab's worth of context.
const LIGHTNING_WATCH_URL = "https://lightning-watch.uptpky.workers.dev/";

// SIGAP (UIP3B Kalimantan's own tower alert tool) — public read-only API
// confirmed reachable, see src/services/sigap.ts. This link is to its own
// web app, separate from the API this page quietly cross-references towers
// against (the "Kode SIGAP" shown per ruas below).
const SIGAP_URL = "https://sigap.uip3bkal.com/";

export default async function CariTitikGangguanPage() {
  const [{ ruasList, error }, sigapBayLineByFuncLoc] = await Promise.all([
    getSuttSnapshot(),
    getSigapBayLineByFuncLoc(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Cari Titik Gangguan"
        description="Cocokkan jarak gangguan (VAISALA/TWFL/SMDE/Fault Locator Relay) dengan data tower SUTT untuk memperkirakan lokasi — pilih ruas, masukkan jarak dari tiap metode yang ada, lalu salin hasilnya dalam format siap kirim WhatsApp."
        actions={
          <>
            <a
              href={SIGAP_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Satellite className="size-3.5" />
              SIGAP
              <ExternalLink className="size-3" />
            </a>
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
      <SuttFaultLocatorView ruasList={ruasList} error={error} sigapBayLineByFuncLoc={sigapBayLineByFuncLoc} />
    </div>
  );
}
