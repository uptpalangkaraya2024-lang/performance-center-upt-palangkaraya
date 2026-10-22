import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHero } from "@/components/dashboard/page-hero";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { getSuttSnapshot } from "@/services/sutt-asset";
import { buildSuttNetworkMapData } from "@/lib/sutt-map";
import { SuttNetworkMapLoader } from "@/components/disturbances/sutt-network-map-loader";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fmtKm(n: number): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
function fmtInt(n: number): string {
  return n.toLocaleString("id-ID");
}

export default async function PetaSuttPage() {
  const { ruasList, giRegistry, error } = await getSuttSnapshot();

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero title="Peta/SLD SUTT" description="Peta jaringan SUTT 150kV seluruh GI UPT Palangkaraya." />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message={error} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const mapData = buildSuttNetworkMapData(ruasList, giRegistry);
  // A GI not in DATA GARDU INDUK's own list isn't confirmed as UPT
  // Palangkaraya's own (see buildSuttNetworkMapData's own comment) — shown
  // on the map for context since the ruas approaching it is still UPT
  // Palangkaraya's own asset, but not counted as UPT Palangkaraya's own GI.
  const totalGi = mapData.gis.filter((g) => g.kind !== "unregistered").length;
  const totalRuas = mapData.ruas.length;
  const totalIncomer = mapData.ruas.filter((r) => r.incomer).length;
  const totalTower = mapData.ruas.reduce((a, r) => a + r.towerCount, 0);
  const totalKm = mapData.ruas.reduce((a, r) => a + r.lengthKm, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHero
        title="Peta/SLD SUTT"
        description="Peta jaringan SUTT 150kV seluruh GI UPT Palangkaraya — penanda awal/akhir tower tiap GI dan titik potong ruas incomer, untuk kroscek lintas ruas."
        actions={
          <Link href="/dashboard/disturbances/cari-titik-gangguan" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="size-3.5" />
            Kembali ke Cari Titik Gangguan
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Total GI", fmtInt(totalGi)],
          ["Total Ruas", `${totalRuas} (${totalRuas - totalIncomer} utama + ${totalIncomer} incomer)`],
          ["Total Tower", fmtInt(totalTower)],
          ["Total Panjang", `${fmtKm(totalKm)} km`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card px-3 py-2">
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
            <p className="text-sm font-extrabold text-foreground">{value}</p>
          </div>
        ))}
      </div>
      <div className="h-[75vh] min-h-[480px]">
        <SuttNetworkMapLoader data={mapData} />
      </div>
    </div>
  );
}
