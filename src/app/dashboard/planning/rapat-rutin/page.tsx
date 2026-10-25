import { CalendarCheck2, Link2, ListChecks } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { getMeetingSchedule } from "@/services/meeting-schedule";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "Tanggal",
  "Waktu",
  "Topik",
  "Penyelenggara",
  "Link ROM",
  "Hasil Pembahasan",
  "Tindak Lanjut",
  "Status",
];

export default async function RapatRutinPage() {
  const data = await getMeetingSchedule();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Jadwal Rapat Rutin"
        description="Rekap jadwal rapat rutin — tanggal, link ROM, dan hasil pembahasan terekam di satu tempat."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-info/10 text-info">
              <CalendarCheck2 className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Jadwal</p>
            <p className="text-xs text-muted-foreground">Tanggal, waktu, dan topik tiap rapat rutin.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-info/10 text-info">
              <Link2 className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Link ROM</p>
            <p className="text-xs text-muted-foreground">Tautan rapat (Zoom/Meet/ROM) langsung dari daftar.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-info/10 text-info">
              <ListChecks className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Hasil & Tindak Lanjut</p>
            <p className="text-xs text-muted-foreground">Rekap pembahasan dan tindak lanjut tiap rapat terekam.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Daftar Rapat</CardTitle>
          <p className="text-xs text-muted-foreground">
            Menu sudah siap — data akan tampil otomatis setelah sumber sheet jadwal rapat rutin dihubungkan.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  {COLUMNS.map((col) => (
                    <th key={col} className="px-3 py-2.5 font-bold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      {data.error ?? "Belum ada data."}
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-foreground">{row.tanggal}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.waktu ?? "—"}</td>
                      <td className="px-3 py-2 text-foreground">{row.topik}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.penyelenggara ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.linkRom ? (
                          <a href={row.linkRom} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            Buka
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.hasilPembahasan ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.tindakLanjut ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.status ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
