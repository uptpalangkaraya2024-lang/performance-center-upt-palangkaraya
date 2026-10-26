import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { cn } from "@/lib/utils";
import { getMeetingSchedule } from "@/services/meeting-schedule";
import type { MeetingAgendaItem } from "@/types";

export const dynamic = "force-dynamic";

const COLUMNS = ["No", "Agenda", "Jadwal", "Metode", "Keterangan", "PIC"];

function KeteranganPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const normalized = value.toLowerCase();
  const tone =
    normalized === "on going"
      ? "border-success/40 bg-success/10 text-success"
      : normalized === "not started"
        ? "border-border bg-muted text-muted-foreground"
        : "border-border bg-muted/50 text-muted-foreground";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", tone)}>{value}</span>;
}

function AgendaRow({ item }: { item: MeetingAgendaItem }) {
  const isSubItem = item.no === null;
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 text-muted-foreground tabular-nums">{item.no ?? ""}</td>
      <td className={cn("px-3 py-2 text-foreground", isSubItem && "pl-7 text-muted-foreground")}>{item.agenda}</td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{item.jadwal ?? "—"}</td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{item.metode ?? "—"}</td>
      <td className="px-3 py-2">
        <KeteranganPill value={item.keterangan} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{item.pic ?? "—"}</td>
    </tr>
  );
}

export default async function RapatRutinPage() {
  const data = await getMeetingSchedule();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Jadwal Rapat Rutin"
        description="Agenda checkpoint rutin UPT Palangkaraya — jadwal berulang (mingguan/bulanan), bukan daftar rapat per tanggal. Sumber: sheet AGENDA CEKPOIN RUTIN UPT."
      />

      {data.blocks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarClock className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{data.error ?? "Belum ada data."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.blocks.map((block, i) => (
            <Card key={`${block.title}-${i}`}>
              <CardHeader>
                <CardTitle className="text-base font-extrabold">{block.title}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {block.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada agenda pada blok ini.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                        {COLUMNS.map((col) => (
                          <th key={col} className="px-3 py-2 font-bold whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.items.map((item, j) => (
                        <AgendaRow key={j} item={item} />
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
