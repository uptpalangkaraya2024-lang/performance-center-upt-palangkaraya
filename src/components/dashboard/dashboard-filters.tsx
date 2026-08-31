import { CalendarClock, RefreshCcw } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function DashboardFilters({ lastUpdated }: { lastUpdated: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Performance Overview</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="size-3.5" />
          Diperbarui {lastUpdated}
          <span className="ml-1 inline-flex items-center gap-1 text-success">
            <span className="size-1.5 rounded-full bg-success" /> Data terbaru
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select defaultValue="all">
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue placeholder="ULTG" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua ULTG</SelectItem>
            <SelectItem value="plk">ULTG Palangkaraya</SelectItem>
            <SelectItem value="ksg">ULTG Kasongan</SelectItem>
            <SelectItem value="pgs">ULTG Pangkalan Bun</SelectItem>
            <SelectItem value="smp">ULTG Sampit</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="2026">
          <SelectTrigger size="sm" className="w-[100px]">
            <SelectValue placeholder="Tahun" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="08">
          <SelectTrigger size="sm" className="w-[110px]">
            <SelectValue placeholder="Bulan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="08">Agustus</SelectItem>
            <SelectItem value="07">Juli</SelectItem>
            <SelectItem value="06">Juni</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1.5">
          <RefreshCcw className="size-3.5" />
          Sync
        </Button>
      </div>
    </div>
  );
}
