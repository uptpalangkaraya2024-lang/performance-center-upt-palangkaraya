import Link from "next/link";
import { ArrowLeft, ExternalLink, Map, Radar, Satellite, TreePine } from "lucide-react";

import { PageHero } from "@/components/dashboard/page-hero";
import { buttonVariants } from "@/components/ui/button";
import { SuttFaultLocatorView } from "@/components/disturbances/sutt-fault-locator-view";
import { getSuttSnapshot } from "@/services/sutt-asset";
import { getSigapTowerInsights } from "@/services/sigap";
import { getGangguanHistoryByTowerGi } from "@/services/gangguan-history";
import { getRowWatchSpans } from "@/services/row-watch";

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
// confirmed reachable, see src/services/sigap.ts: GET /api/chart-analysis
// needs no token and returns per-tower lightning-strike history + phase
// sequence. SIGAP also has a token-gated POST endpoint that actually sends
// a WhatsApp alert — deliberately never called from this app (the user's
// own instruction: pull tower data only, stay out of everything else).
// This link is to SIGAP's own web app, separate from the API this page
// quietly cross-references towers against. Gangguan history itself comes
// from the UPT's own REKAP GANGGUAN instead (src/services/gangguan-
// history.ts), not SIGAP — see that file's own comment for why.
const SIGAP_URL = "https://sigap.uip3bkal.com/";

// ROW Watch (the UPT's own right-of-way/vegetation risk map) — generic
// homepage link, same precedent as SIGAP/Lightning Watch above. The more
// useful per-tower deep link (straight to a matched tower's own point on
// the map) is built per result instead, see src/lib/sutt-fault-locator.ts's
// buildRowWatchLink and src/services/row-watch.ts.
const ROW_WATCH_URL = "https://row-watch.uptpky.workers.dev/map";

export default async function CariTitikGangguanPage() {
  const [{ ruasList, giRegistry, error }, sigapInsightsByFuncLoc, gangguanHistoryByGiTower, rowWatchSpans] = await Promise.all([
    getSuttSnapshot(),
    getSigapTowerInsights(),
    getGangguanHistoryByTowerGi(),
    getRowWatchSpans(),
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
            <a
              href={ROW_WATCH_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <TreePine className="size-3.5" />
              ROW Watch
              <ExternalLink className="size-3" />
            </a>
            <Link href="/dashboard/disturbances/peta-sutt" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Map className="size-3.5" />
              Peta/SLD SUTT
            </Link>
            <Link href="/dashboard/disturbances" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft className="size-3.5" />
              Kembali ke Gangguan
            </Link>
          </>
        }
      />
      <SuttFaultLocatorView
        ruasList={ruasList}
        error={error}
        sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
        gangguanHistoryByGiTower={gangguanHistoryByGiTower}
        rowWatchSpans={rowWatchSpans}
        giRegistry={giRegistry}
      />
    </div>
  );
}
