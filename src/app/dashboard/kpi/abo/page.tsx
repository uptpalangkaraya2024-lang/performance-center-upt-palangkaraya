import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { AboSnapshotView } from "@/components/abo/abo-snapshot-view";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";

export const dynamic = "force-dynamic";

export default async function AboPage() {
  const [proteksi, hargi] = await Promise.all([getAboProteksiSnapshot(), getAboHargiSnapshot()]);
  const hasError = Boolean(proteksi.error && hargi.error);

  return (
    <Tabs defaultValue="proteksi">
      <div className="flex flex-col gap-6">
        <div className="print:hidden">
          <PageHero
            title="ABO UPT Palangkaraya"
            description="Target dan realisasi kumulatif tiap program Anti Blackout per UPT/ULTG/ruas — dihitung otomatis untuk periode yang dipilih."
            status={
              !hasError ? (
                <>
                  <span className="size-1.5 rounded-full bg-success" />
                  Data synchronized
                </>
              ) : null
            }
            actions={
              <TabsList>
                <TabsTrigger value="proteksi">Proteksi</TabsTrigger>
                <TabsTrigger value="hargi">Hargi</TabsTrigger>
              </TabsList>
            }
          />
        </div>

        <TabsContent value="proteksi" className="flex flex-col gap-4">
          {proteksi.error ? (
            <Card>
              <CardContent className="py-8">
                <DataUnavailable message="Sinkronisasi ABO Proteksi belum berhasil. Lihat halaman Data & Sync untuk detail." />
              </CardContent>
            </Card>
          ) : (
            <AboSnapshotView
              snapshot={proteksi}
              emptyMessage="Data ABO Proteksi belum tersedia — lihat halaman Data & Sync untuk detail."
            />
          )}
          <p className="text-[11px] text-muted-foreground print:hidden">
            Source: ABO 2026 SUB BID. PROTEKSI UIP3B KAL · Sheet: 🖥️ PKY, 📝 INPUT PKY · Provider: Apps Script
          </p>
        </TabsContent>

        <TabsContent value="hargi" className="flex flex-col gap-4">
          {hargi.error ? (
            <Card>
              <CardContent className="py-8">
                <DataUnavailable message="Sinkronisasi ABO Hargi belum berhasil. Lihat halaman Data & Sync untuk detail." />
              </CardContent>
            </Card>
          ) : (
            <AboSnapshotView
              snapshot={hargi}
              emptyMessage="Data ABO Hargi belum tersedia — lihat halaman Data & Sync untuk detail."
            />
          )}
          <p className="text-[11px] text-muted-foreground print:hidden">
            Source: ABO 2026 SUB BID. HARGI UIP3B KAL · Sheet: 🖥️ PKY, 📝 INPUT PKY · Provider: Apps Script
          </p>
        </TabsContent>
      </div>
    </Tabs>
  );
}
