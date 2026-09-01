import { CalendarClock, RefreshCcw } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHero } from "./page-hero";

export function DashboardFilters({ lastUpdated }: { lastUpdated: string }) {
  return (
    <PageHero
      title="Monitoring Kinerja UPT Palangkaraya"
      description="Executive overview kondisi operasional, kinerja, aset, dan gangguan sistem transmisi."
      status={
        <>
          <CalendarClock className="size-3.5" />
          Diperbarui {lastUpdated}
          <span className="ml-1 inline-flex items-center gap-1 font-medium text-success">
            <span className="size-1.5 rounded-full bg-success" /> Data synchronized
          </span>
        </>
      }
      actions={
        <>
          <Select defaultValue="all">
            <SelectTrigger size="sm" className="w-[140px] bg-card">
              {/* Explicit children — SelectValue's own item-label lookup only
                  resolves once the popup has mounted at least once, so the
                  trigger would otherwise show the raw value on first paint. */}
              <SelectValue placeholder="ULTG">Semua ULTG</SelectValue>
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
            <SelectTrigger size="sm" className="w-[100px] bg-card">
              <SelectValue placeholder="Tahun">2026</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="08">
            <SelectTrigger size="sm" className="w-[110px] bg-card">
              <SelectValue placeholder="Bulan">Agustus</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="08">Agustus</SelectItem>
              <SelectItem value="07">Juli</SelectItem>
              <SelectItem value="06">Juni</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5">
            <RefreshCcw className="size-3.5" />
            Sync
          </Button>
        </>
      }
    />
  );
}
