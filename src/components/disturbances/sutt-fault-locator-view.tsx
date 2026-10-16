"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  MapPin,
  Navigation,
  RotateCcw,
  Zap,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { cn } from "@/lib/utils";
import {
  FAULT_METHODS,
  FAULT_METHOD_LABELS,
  buildDirectionsLink,
  buildEarthLink,
  buildSuttMyMapsLink,
  buildMethodResults,
  formatWaMessage,
  hasFaultHistory,
  isTowerKritis,
  type FaultDirection,
  type FaultMethod,
  type MethodEntry,
} from "@/lib/sutt-fault-locator";
import type { SuttRuas } from "@/types";

function formatKm(km: number): string {
  return `${km.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`;
}

function formatSignedKm(km: number): string {
  const sign = km > 0 ? "+" : "";
  return `${sign}${km.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`;
}

/** One method's own input + result, side by side so the number typed and
 *  the tower it resolved to are never more than a glance apart. */
function MethodCard({
  method,
  value,
  onChange,
  ruas,
  direction,
}: {
  method: FaultMethod;
  value: string;
  onChange: (v: string) => void;
  ruas: SuttRuas | null;
  direction: FaultDirection;
}) {
  const distanceKm = value.trim() === "" ? null : Number(value);
  const entry: MethodEntry = { method, distanceKm: Number.isFinite(distanceKm) ? distanceKm : null };
  const result = ruas && entry.distanceKm !== null ? buildMethodResults(ruas, direction, [entry])[0] : null;

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold">
          <Zap className="size-3.5 text-primary" />
          {FAULT_METHOD_LABELS[method]}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            placeholder="Jarak (km)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={!ruas}
            className="max-w-[160px]"
          />
          <span className="text-xs text-muted-foreground">km</span>
        </div>

        {!ruas ? (
          <p className="text-xs text-muted-foreground">Pilih ruas terlebih dahulu.</p>
        ) : entry.distanceKm === null ? (
          <p className="text-xs text-muted-foreground">Belum diisi.</p>
        ) : !result ? (
          <p className="text-xs text-muted-foreground">Jarak tidak valid.</p>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-foreground">Tower {result.match.tower.towerNo}</span>
              <span className="text-muted-foreground">selisih {formatSignedKm(result.match.deltaKm)}</span>
            </div>
            <p className="text-muted-foreground">
              Jarak tower {formatKm(result.match.tower.distanceKm)}
              {result.match.before && result.match.after && result.match.before.towerNo !== result.match.after.towerNo ? (
                <>
                  {" "}
                  · antara Tower {result.match.before.towerNo} ({formatKm(result.match.before.distanceKm)}) – Tower{" "}
                  {result.match.after.towerNo} ({formatKm(result.match.after.distanceKm)})
                </>
              ) : null}
            </p>
            {result.match.outOfRange ? (
              <p className="flex items-center gap-1 font-semibold text-warning-foreground">
                <AlertTriangle className="size-3 shrink-0" />
                Jarak di luar panjang ruas — tower terdekat ditampilkan.
              </p>
            ) : null}
            {isTowerKritis(result.match.tower) ? (
              <p className="flex items-center gap-1 font-semibold text-critical">
                <AlertTriangle className="size-3 shrink-0" />
                Tower Kritis — ada catatan penanganan/mitigasi.
              </p>
            ) : null}
            {hasFaultHistory(result.match.tower) ? (
              <p className="flex items-center gap-1 font-semibold text-warning-foreground">
                <Zap className="size-3 shrink-0" />
                Ada riwayat gangguan tercatat di tower ini.
              </p>
            ) : null}
            <p className="text-muted-foreground">
              {[result.match.tower.jenisTower, result.match.tower.tipeTower, result.match.tower.tahunOperasi ? `Thn ${result.match.tower.tahunOperasi}` : ""]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            {buildSuttMyMapsLink(result.match.tower.lat, result.match.tower.lon) ? (
              <div className="flex flex-wrap gap-2 pt-0.5">
                <a
                  href={buildSuttMyMapsLink(result.match.tower.lat, result.match.tower.lon)!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <MapPin className="size-3" />
                  Peta SUTT (Tower)
                  <ExternalLink className="size-2.5" />
                </a>
                <a
                  href={buildDirectionsLink(result.match.tower.lat, result.match.tower.lon)!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Navigation className="size-3" />
                  Petunjuk Arah
                  <ExternalLink className="size-2.5" />
                </a>
                <a
                  href={buildEarthLink(result.match.tower.lat, result.match.tower.lon)!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  Google Earth
                  <ExternalLink className="size-2.5" />
                </a>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SuttFaultLocatorView({ ruasList, error }: { ruasList: SuttRuas[]; error: string | null }) {
  const [sectionKey, setSectionKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<FaultDirection>("origin");
  const [inputs, setInputs] = useState<Record<FaultMethod, string>>({
    VAISALA: "",
    TWFL: "",
    SMDE: "",
    FAULT_LOCATOR_RELAY: "",
  });
  const [copied, setCopied] = useState(false);

  const ruasByUnit = useMemo(() => {
    const map = new Map<string, SuttRuas[]>();
    for (const r of ruasList) {
      const list = map.get(r.unit) ?? [];
      list.push(r);
      map.set(r.unit, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ruasList]);

  const ruas = ruasList.find((r) => r.section === sectionKey) ?? null;

  const entries: MethodEntry[] = FAULT_METHODS.map((method) => {
    const raw = inputs[method].trim();
    const n = raw === "" ? null : Number(raw);
    return { method, distanceKm: n !== null && Number.isFinite(n) ? n : null };
  });
  const filledCount = entries.filter((e) => e.distanceKm !== null).length;
  const waText = ruas ? formatWaMessage(ruas, direction, entries) : "";

  function reset() {
    setInputs({ VAISALA: "", TWFL: "", SMDE: "", FAULT_LOCATOR_RELAY: "" });
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <DataUnavailable message={error} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="print:break-inside-avoid">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-extrabold">1. Pilih Ruas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Select
            value={sectionKey ?? ""}
            onValueChange={(v) => {
              setSectionKey(v || null);
              setDirection("origin");
              reset();
            }}
          >
            <SelectTrigger className="w-full sm:w-[420px]">
              <SelectValue placeholder="Pilih ruas SUTT...">{sectionKey ?? "Pilih ruas SUTT..."}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ruasByUnit.map(([unit, list]) => (
                <SelectGroup key={unit}>
                  <SelectLabel>{unit}</SelectLabel>
                  {list.map((r) => (
                    <SelectItem key={r.section} value={r.section}>
                      {r.section} ({formatKm(r.lengthKm)})
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {ruas ? (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground">
                {ruas.unit} · {ruas.towers.length} tower · panjang {formatKm(ruas.lengthKm)}
              </p>
              <Tabs value={direction} onValueChange={(v) => setDirection((v as FaultDirection) ?? "origin")}>
                <TabsList>
                  <TabsTrigger value="origin">Dari {ruas.originLabel} (km 0)</TabsTrigger>
                  <TabsTrigger value="far">
                    Dari {ruas.farEndLabel} (km {formatKm(ruas.lengthKm)})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pilih ruas, lalu masukkan jarak gangguan dari tiap metode yang tersedia (boleh salah satu, boleh semua) untuk
              melihat perkiraan tower terdekat.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-extrabold tracking-tight">2. Jarak Gangguan per Metode</h3>
          <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={reset} disabled={filledCount === 0}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {FAULT_METHODS.map((method) => (
            <MethodCard
              key={method}
              method={method}
              value={inputs[method]}
              onChange={(v) => setInputs((prev) => ({ ...prev, [method]: v }))}
              ruas={ruas}
              direction={direction}
            />
          ))}
        </div>
      </div>

      <Card className={cn("print:break-inside-avoid", (!ruas || filledCount === 0) && "opacity-60")}>
        <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-extrabold">3. Format WA (siap copy)</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 print:hidden"
            disabled={!ruas || filledCount === 0}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(waText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // clipboard permission denied — text is still selectable below
              }
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Tersalin" : "Copy"}
          </Button>
        </CardHeader>
        <CardContent>
          {!ruas || filledCount === 0 ? (
            <p className="text-xs text-muted-foreground">
              Pilih ruas dan isi minimal satu jarak gangguan untuk membuat teks siap kirim.
            </p>
          ) : (
            <pre className="overflow-auto rounded-lg border bg-secondary p-3 text-xs whitespace-pre-wrap text-foreground">
              {waText}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
