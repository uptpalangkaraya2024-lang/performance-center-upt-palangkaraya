"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CloudSun,
  Copy,
  ExternalLink,
  GitBranch,
  MapPin,
  Navigation,
  RotateCcw,
  TreePine,
  Zap,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
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
  FAULT_METHOD_LABELS,
  buildCombinedIncomerRuasList,
  buildDirectionsLink,
  buildEarthLink,
  buildRowWatchLink,
  buildRowWatchTowerIndex,
  buildSuttMyMapsLink,
  buildMethodResults,
  combinedIncomerKey,
  computeGangguanYearRange,
  findGangguanHistory,
  findIncomerTapAtTower,
  findIncomerTapInfo,
  findIncomersTappingFrom,
  findReferenceDistances,
  formatIncomerTapsLabel,
  findSigapBayLine,
  findSigapFasa,
  findSigapInsight,
  formatGangguanHistoryLines,
  formatReferenceDistanceLine,
  formatSigapInsightLines,
  formatUnbalanceLine,
  formatTowerDistanceLabel,
  formatWaMessage,
  formatWeatherLine,
  hasFaultHistory,
  withSharedApproachCorridor,
  isIncomerRuas,
  isTowerKritis,
  towerDisplayLabel,
  type CombinedIncomerRuas,
  type FaultDirection,
  type MethodEntry,
  type MethodResult,
  type TowerWeather,
} from "@/lib/sutt-fault-locator";
import { giTowerKey } from "@/lib/gi-name";
import type { SigapTowerInsight } from "@/services/sigap";
import type { RowWatchSpan } from "@/services/row-watch";
import type { GangguanHistoryEntry, GiRecord, SuttRuas } from "@/types";

function formatKm(km: number): string {
  return `${km.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`;
}

function formatSignedKm(km: number): string {
  const sign = km > 0 ? "+" : "";
  return `${sign}${km.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`;
}

type VaisalaStatus = "unknown" | "detected" | "not-detected";

interface MethodInputsState {
  VAISALA: { status: VaisalaStatus; towerNo: string };
  TWFL: { distanceKm: string };
  SMDE: { distanceKm: string; ordinal: string };
  FAULT_LOCATOR_RELAY: { distanceKm: string };
}

const EMPTY_INPUTS: MethodInputsState = {
  VAISALA: { status: "unknown", towerNo: "" },
  TWFL: { distanceKm: "" },
  SMDE: { distanceKm: "", ordinal: "" },
  FAULT_LOCATOR_RELAY: { distanceKm: "" },
};

/** Converts the UI's own per-method input state into the lib's
 *  MethodEntry union — the one place that translation happens, so the
 *  live preview cards and the WA text (which both call buildMethodResults/
 *  formatWaMessage downstream) are always built from the exact same
 *  interpretation of what's in each box. Order matches FAULT_METHODS. */
function buildEntries(inputs: MethodInputsState): MethodEntry[] {
  const vaisala: MethodEntry =
    inputs.VAISALA.status === "not-detected"
      ? { method: "VAISALA", mode: "no-strike" }
      : inputs.VAISALA.status === "detected" && inputs.VAISALA.towerNo.trim() !== ""
        ? { method: "VAISALA", mode: "tower", towerNo: inputs.VAISALA.towerNo.trim() }
        : { method: "VAISALA", mode: "empty" };

  const twflKm = Number(inputs.TWFL.distanceKm.trim());
  const twfl: MethodEntry =
    inputs.TWFL.distanceKm.trim() !== "" && Number.isFinite(twflKm)
      ? { method: "TWFL", mode: "distance", distanceKm: twflKm }
      : { method: "TWFL", mode: "empty" };

  // SMDE: tower-ke wins when both happen to be filled — the UI itself
  // disables whichever box isn't "active" once the other has a value, so
  // in practice only one is ever filled at a time (see SmdeCard).
  const ordinalTrim = inputs.SMDE.ordinal.trim();
  const ordinalNum = Number(ordinalTrim);
  const smdeKmTrim = inputs.SMDE.distanceKm.trim();
  const smdeKmNum = Number(smdeKmTrim);
  const smde: MethodEntry =
    ordinalTrim !== "" && Number.isFinite(ordinalNum)
      ? { method: "SMDE", mode: "ordinal", ordinal: ordinalNum }
      : smdeKmTrim !== "" && Number.isFinite(smdeKmNum)
        ? { method: "SMDE", mode: "distance", distanceKm: smdeKmNum }
        : { method: "SMDE", mode: "empty" };

  const relayKm = Number(inputs.FAULT_LOCATOR_RELAY.distanceKm.trim());
  const relay: MethodEntry =
    inputs.FAULT_LOCATOR_RELAY.distanceKm.trim() !== "" && Number.isFinite(relayKm)
      ? { method: "FAULT_LOCATOR_RELAY", mode: "distance", distanceKm: relayKm }
      : { method: "FAULT_LOCATOR_RELAY", mode: "empty" };

  return [vaisala, twfl, smde, relay];
}

/** Current weather at a tower's own coordinates — purely presentational,
 *  reading from the already-fetched weatherByTowerKey map (see
 *  SuttFaultLocatorView below, which fetches once per distinct matched
 *  tower and feeds both this line AND the WA text, per the user's own
 *  request to add weather to the copy-paste message too — a per-panel
 *  fetch here couldn't reach into that synchronous text builder). Renders
 *  nothing while the fetch is still in flight or failed — a field crew's
 *  weather context is a nice-to-have, never something that should block
 *  or clutter the result with an error. */
function TowerWeatherLine({ weather }: { weather: TowerWeather | undefined }) {
  if (!weather) return null;
  return (
    <p className="flex items-center gap-1 text-muted-foreground">
      <CloudSun className="size-3 shrink-0" />
      {formatWeatherLine(weather)}
    </p>
  );
}

/** The "we found a tower" block — identical regardless of how the tower
 *  was resolved (nearest-to-a-distance guess, or an exact tower-number/
 *  tower-ke lookup), so every method's own card renders this same panel
 *  once it has a MethodResult. */
function TowerResultPanel({
  ruasSection,
  result,
  sigapInsightsByFuncLoc,
  gangguanHistoryByGiTower,
  rowWatchIndex,
  weatherByTowerKey,
  giRegistry,
}: {
  ruasSection: string;
  result: MethodResult;
  sigapInsightsByFuncLoc: Record<string, SigapTowerInsight>;
  gangguanHistoryByGiTower: Record<string, GangguanHistoryEntry[]>;
  rowWatchIndex: Map<string, RowWatchSpan>;
  weatherByTowerKey: Record<string, TowerWeather>;
  giRegistry: GiRecord[];
}) {
  const { match } = result;
  const sigapInsight = findSigapInsight(match.tower, sigapInsightsByFuncLoc);
  const gangguanHistory = findGangguanHistory(match.tower, gangguanHistoryByGiTower);
  const referenceDistanceLine = formatReferenceDistanceLine(findReferenceDistances(match.tower, giRegistry));
  // Cheap to recompute per render (iterates an already-in-memory, modest-
  // sized map) — not worth threading a brand-new prop through every
  // intermediate card component just to memoize this one step higher.
  const gangguanYearRange = computeGangguanYearRange(gangguanHistoryByGiTower);
  const gangguanLines = formatGangguanHistoryLines(gangguanHistory, gangguanYearRange);
  // Once a distance has crossed into an incomer's own tower chain, the
  // matched tower belongs to THAT ruas, not the one being searched — so
  // the "this tower is a splice point" hint (which assumes ruasSection)
  // no longer applies; the crossing banner below already says where it is.
  const tapHere = match.crossedToIncomer ? null : findIncomerTapAtTower(ruasSection, match.tower.towerNo);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-extrabold text-foreground">{towerDisplayLabel(match.tower)}</span>
        {match.exact ? (
          <span className="flex items-center gap-1 font-semibold text-success">
            <Check className="size-3" />
            Pasti
          </span>
        ) : (
          <span className="text-muted-foreground">selisih {formatSignedKm(match.deltaKm)}</span>
        )}
      </div>
      <p className="text-muted-foreground">
        Jarak tower {formatTowerDistanceLabel(match.tower)}
        {match.before && match.after && match.before.towerNo !== match.after.towerNo ? (
          <>
            {" "}
            · antara {towerDisplayLabel(match.before)} ({formatTowerDistanceLabel(match.before)}) –{" "}
            {towerDisplayLabel(match.after)} ({formatTowerDistanceLabel(match.after)})
          </>
        ) : null}
      </p>
      {match.crossedToIncomer ? (
        <p className="flex items-center gap-1 font-semibold text-primary">
          <GitBranch className="size-3 shrink-0" />
          Melebihi ruas ini {formatKm(match.crossedToIncomer.overflowKm)}, dilanjutkan ke{" "}
          <span className="font-extrabold">{match.crossedToIncomer.incomerSection}</span>
        </p>
      ) : null}
      {match.outOfRange ? (
        <p className="flex items-center gap-1 font-semibold text-warning-foreground">
          <AlertTriangle className="size-3 shrink-0" />
          Jarak di luar panjang ruas{match.crossedToIncomer ? ` "${match.crossedToIncomer.incomerSection}"` : ""} —
          tower terdekat ditampilkan.
        </p>
      ) : null}
      {tapHere ? (
        <p className="flex items-center gap-1 font-semibold text-primary">
          <GitBranch className="size-3 shrink-0" />
          Titik sambung Incomer {tapHere.gi} — cek juga ruas &quot;{tapHere.incomerSection}&quot; kalau diduga di jalur
          incomer.
        </p>
      ) : null}
      {isTowerKritis(match.tower) ? (
        <p className="flex items-center gap-1 font-semibold text-critical">
          <AlertTriangle className="size-3 shrink-0" />
          Tower Kritis — ada catatan penanganan/mitigasi.
        </p>
      ) : null}
      {hasFaultHistory(match.tower) ? (
        <p className="flex items-center gap-1 font-semibold text-warning-foreground">
          <Zap className="size-3 shrink-0" />
          Ada riwayat gangguan tercatat di tower ini.
        </p>
      ) : null}
      {formatUnbalanceLine(match.tower) ? (
        <p className="flex items-center gap-1 font-semibold text-warning-foreground">
          <AlertTriangle className="size-3 shrink-0" />
          {formatUnbalanceLine(match.tower)}
        </p>
      ) : null}
      <p className="text-muted-foreground">
        {[match.tower.jenisTower, match.tower.tipeTower, match.tower.tahunOperasi ? `Thn ${match.tower.tahunOperasi}` : ""]
          .filter(Boolean)
          .join(" · ") || "—"}
      </p>
      {gangguanLines.map((line, i) => (
        <p
          key={i}
          className={cn(
            i === 0
              ? gangguanHistory.length > 0
                ? "font-semibold text-warning-foreground"
                : "font-semibold text-success"
              : "text-muted-foreground",
          )}
        >
          {line}
        </p>
      ))}
      {sigapInsight
        ? formatSigapInsightLines(sigapInsight).map((line, i) => (
            <p key={i} className="text-muted-foreground">
              {line}
            </p>
          ))
        : null}
      <TowerWeatherLine weather={weatherByTowerKey[giTowerKey(match.tower.gi, match.tower.towerNo)]} />
      {referenceDistanceLine ? <p className="text-muted-foreground">{referenceDistanceLine}</p> : null}
      {buildSuttMyMapsLink(match.tower.lat, match.tower.lon) ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <a
            href={buildSuttMyMapsLink(match.tower.lat, match.tower.lon)!}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <MapPin className="size-3" />
            Peta SUTT (Tower)
            <ExternalLink className="size-2.5" />
          </a>
          <a
            href={buildDirectionsLink(match.tower.lat, match.tower.lon)!}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <Navigation className="size-3" />
            Petunjuk Arah
            <ExternalLink className="size-2.5" />
          </a>
          <a
            href={buildEarthLink(match.tower.lat, match.tower.lon)!}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            Google Earth
            <ExternalLink className="size-2.5" />
          </a>
          {buildRowWatchLink(match.tower, rowWatchIndex) ? (
            <a
              href={buildRowWatchLink(match.tower, rowWatchIndex)!}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <TreePine className="size-3" />
              ROW Watch
              <ExternalLink className="size-2.5" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type SharedCardProps = {
  ruas: SuttRuas | null;
  allRuas: SuttRuas[];
  direction: FaultDirection;
  sigapInsightsByFuncLoc: Record<string, SigapTowerInsight>;
  gangguanHistoryByGiTower: Record<string, GangguanHistoryEntry[]>;
  rowWatchIndex: Map<string, RowWatchSpan>;
  weatherByTowerKey: Record<string, TowerWeather>;
  giRegistry: GiRecord[];
};

/** TWFL and Fault Locator Relay: a plain km distance, nearest-match —
 *  unchanged from how every method used to work before VAISALA/SMDE grew
 *  their own input modes. */
function DistanceCard({
  method,
  label,
  value,
  onChange,
  ruas,
  allRuas,
  direction,
  sigapInsightsByFuncLoc,
  gangguanHistoryByGiTower,
  rowWatchIndex,
  weatherByTowerKey,
  giRegistry,
}: SharedCardProps & {
  method: "TWFL" | "FAULT_LOCATOR_RELAY";
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = value.trim() === "" ? null : Number(value);
  const entry: MethodEntry | null = value.trim() !== "" && n !== null && Number.isFinite(n) ? { method, mode: "distance", distanceKm: n } : null;
  const result = ruas && entry ? buildMethodResults(ruas, allRuas, direction, [entry])[0] : null;

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold">
          <Zap className="size-3.5 text-primary" />
          {label}
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
        ) : !entry ? (
          <p className="text-xs text-muted-foreground">Belum diisi.</p>
        ) : !result ? (
          <p className="text-xs text-muted-foreground">Jarak tidak valid.</p>
        ) : (
          <TowerResultPanel
            ruasSection={ruas.section}
            result={result}
            sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
            gangguanHistoryByGiTower={gangguanHistoryByGiTower}
            rowWatchIndex={rowWatchIndex}
            weatherByTowerKey={weatherByTowerKey}
            giRegistry={giRegistry}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** VAISALA locates a strike point directly rather than reporting a km
 *  distance along the conductor, so its own input is a tower number, not
 *  a distance — gated behind an explicit "ada/tidak ada sambaran" choice
 *  (a genuine "no lightning here" finding is a different, still useful
 *  answer from "this field is just empty"). */
function VaisalaCard({
  status,
  towerNo,
  onStatusChange,
  onTowerNoChange,
  ruas,
  allRuas,
  direction,
  sigapInsightsByFuncLoc,
  gangguanHistoryByGiTower,
  rowWatchIndex,
  weatherByTowerKey,
  giRegistry,
}: SharedCardProps & {
  status: VaisalaStatus;
  towerNo: string;
  onStatusChange: (s: VaisalaStatus) => void;
  onTowerNoChange: (v: string) => void;
}) {
  const entry: MethodEntry | null =
    status === "detected" && towerNo.trim() !== "" ? { method: "VAISALA", mode: "tower", towerNo: towerNo.trim() } : null;
  const result = ruas && entry ? buildMethodResults(ruas, allRuas, direction, [entry])[0] : null;

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold">
          <Zap className="size-3.5 text-primary" />
          VAISALA
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={status === "detected" ? "default" : "outline"}
            disabled={!ruas}
            className="flex-1"
            onClick={() => onStatusChange("detected")}
          >
            Ada Sambaran
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === "not-detected" ? "default" : "outline"}
            disabled={!ruas}
            className="flex-1"
            onClick={() => onStatusChange("not-detected")}
          >
            Tidak Ada Sambaran
          </Button>
        </div>

        {status === "detected" ? (
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Nomor tower (mis. 36)"
            value={towerNo}
            onChange={(e) => onTowerNoChange(e.target.value)}
            disabled={!ruas}
            className="max-w-[200px]"
          />
        ) : null}

        {!ruas ? (
          <p className="text-xs text-muted-foreground">Pilih ruas terlebih dahulu.</p>
        ) : status === "unknown" ? (
          <p className="text-xs text-muted-foreground">Pilih apakah terdapat sambaran petir.</p>
        ) : status === "not-detected" ? (
          <p className="text-xs font-semibold text-muted-foreground">Tidak terdapat sambaran petir.</p>
        ) : towerNo.trim() === "" ? (
          <p className="text-xs text-muted-foreground">Masukkan nomor tower dari laporan VAISALA.</p>
        ) : !result ? (
          <p className="text-xs text-muted-foreground">Nomor tower tidak ditemukan di ruas ini.</p>
        ) : (
          <TowerResultPanel
            ruasSection={ruas.section}
            result={result}
            sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
            gangguanHistoryByGiTower={gangguanHistoryByGiTower}
            rowWatchIndex={rowWatchIndex}
            weatherByTowerKey={weatherByTowerKey}
            giRegistry={giRegistry}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** SMDE can report either a km distance OR "tower ke-N" (the Nth physical
 *  tower from a GI) — only one box is meant to be filled at a time, so
 *  the other disables itself the moment its sibling has a value, instead
 *  of leaving it ambiguous which one "wins". */
function SmdeCard({
  distanceValue,
  ordinalValue,
  onDistanceChange,
  onOrdinalChange,
  ruas,
  allRuas,
  direction,
  sigapInsightsByFuncLoc,
  gangguanHistoryByGiTower,
  rowWatchIndex,
  weatherByTowerKey,
  giRegistry,
}: SharedCardProps & {
  distanceValue: string;
  ordinalValue: string;
  onDistanceChange: (v: string) => void;
  onOrdinalChange: (v: string) => void;
}) {
  const ordinalTrim = ordinalValue.trim();
  const ordinalNum = Number(ordinalTrim);
  const distanceTrim = distanceValue.trim();
  const distanceNum = Number(distanceTrim);

  let entry: MethodEntry | null = null;
  if (ordinalTrim !== "" && Number.isFinite(ordinalNum)) {
    entry = { method: "SMDE", mode: "ordinal", ordinal: ordinalNum };
  } else if (distanceTrim !== "" && Number.isFinite(distanceNum)) {
    entry = { method: "SMDE", mode: "distance", distanceKm: distanceNum };
  }
  const result = ruas && entry ? buildMethodResults(ruas, allRuas, direction, [entry])[0] : null;
  const refLabel = ruas ? (direction === "origin" ? ruas.originLabel : ruas.farEndLabel) : "GI";

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold">
          <Zap className="size-3.5 text-primary" />
          SMDE
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              placeholder="Jarak (km)"
              value={distanceValue}
              onChange={(e) => onDistanceChange(e.target.value)}
              disabled={!ruas || ordinalTrim !== ""}
              className="max-w-[160px]"
            />
            <span className="text-xs text-muted-foreground">km</span>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">atau</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              min={1}
              placeholder="Tower ke-"
              value={ordinalValue}
              onChange={(e) => onOrdinalChange(e.target.value)}
              disabled={!ruas || distanceTrim !== ""}
              className="max-w-[120px]"
            />
            <span className="text-xs text-muted-foreground">dari {refLabel}</span>
          </div>
        </div>

        {!ruas ? (
          <p className="text-xs text-muted-foreground">Pilih ruas terlebih dahulu.</p>
        ) : !entry ? (
          <p className="text-xs text-muted-foreground">Isi jarak (km) atau tower ke-.</p>
        ) : !result ? (
          <p className="text-xs text-muted-foreground">
            {entry.mode === "ordinal" ? "Tower ke- melebihi jumlah tower di ruas ini." : "Jarak tidak valid."}
          </p>
        ) : (
          <TowerResultPanel
            ruasSection={ruas.section}
            result={result}
            sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
            gangguanHistoryByGiTower={gangguanHistoryByGiTower}
            rowWatchIndex={rowWatchIndex}
            weatherByTowerKey={weatherByTowerKey}
            giRegistry={giRegistry}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function SuttFaultLocatorView({
  ruasList,
  error,
  sigapInsightsByFuncLoc,
  gangguanHistoryByGiTower,
  rowWatchSpans,
  giRegistry,
}: {
  ruasList: SuttRuas[];
  error: string | null;
  /** funcLoc -> SIGAP tower insight (bayLine code, phase sequence,
   *  lightning-strike history), best-effort (see src/services/sigap.ts) —
   *  an empty object when SIGAP was unreachable just means those extra
   *  lines don't show anywhere, nothing else about the tool depends on it. */
  sigapInsightsByFuncLoc: Record<string, SigapTowerInsight>;
  /** (normalized GARDU INDUK)::(tower number) -> past gangguan events from
   *  the UPT's own REKAP GANGGUAN — see src/services/gangguan-history.ts. */
  gangguanHistoryByGiTower: Record<string, GangguanHistoryEntry[]>;
  /** ROW Watch's own per-span vegetation dataset, best-effort (see
   *  src/services/row-watch.ts) — indexed once below into a (gi, tower) ->
   *  span lookup so every matched tower can resolve its own ROW Watch deep
   *  link, same "build once, read many" shape sigapInsightsByFuncLoc's own
   *  funcLoc-keyed map already uses. An empty array (ROW Watch
   *  unreachable) just means no ROW Watch link shows anywhere. */
  rowWatchSpans: RowWatchSpan[];
  /** DATA GARDU INDUK registry — same already-loaded getSuttSnapshot()
   *  result ruasList itself came from (see cari-titik-gangguan/page.tsx),
   *  no new fetch. Drives "perkiraan jarak garis lurus ke titik ULTG"
   *  (findReferenceDistances in src/lib/sutt-fault-locator.ts). */
  giRegistry: GiRecord[];
}) {
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedGi, setSelectedGi] = useState<string | null>(null);
  const [sectionKey, setSectionKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<FaultDirection>("origin");
  const [inputs, setInputs] = useState<MethodInputsState>(EMPTY_INPUTS);
  const [copied, setCopied] = useState(false);

  const rowWatchIndex = useMemo(() => buildRowWatchTowerIndex(rowWatchSpans), [rowWatchSpans]);

  // Through-routes: host ruas (from its own origin) continued straight
  // onto an incomer's own towers out to its new GI, selectable as one
  // single ruas instead of requiring the search to land exactly on the
  // splice tower before the user thinks to switch ruas — see
  // buildCombinedIncomerRuasList's own comment in the lib for why this
  // also fixes SMDE's "tower ke-" ordinal cleanly (it just counts through
  // one combined tower array).
  const combinedList = useMemo(() => buildCombinedIncomerRuasList(ruasList), [ruasList]);

  // Picking a ruas is a 3-step cascade (ULTG -> GI -> ruas) rather than one
  // long dropdown of all ~37 entries at once — each row below carries its
  // own origin/far-end GI names so step 2 can list every GI actually
  // touched by something in the chosen ULTG, and step 3 can filter down to
  // just the ruas (plain or combined) touching the chosen GI.
  type PickerRow = {
    key: string;
    unit: string;
    sortKey: string;
    originLabel: string;
    farEndLabel: string;
    combined: CombinedIncomerRuas | null;
    plain: SuttRuas | null;
  };
  const pickerRows = useMemo(() => {
    const rows: PickerRow[] = [
      ...ruasList.map((r) => ({
        key: r.section,
        unit: r.unit,
        sortKey: r.section,
        originLabel: r.originLabel,
        farEndLabel: r.farEndLabel,
        combined: null,
        plain: r,
      })),
      ...combinedList.map((c) => ({
        key: combinedIncomerKey(c.ruas.section),
        unit: c.ruas.unit,
        sortKey: c.ruas.section,
        originLabel: c.ruas.originLabel,
        farEndLabel: c.ruas.farEndLabel,
        combined: c,
        plain: null,
      })),
    ];
    return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [ruasList, combinedList]);

  const units = useMemo(() => [...new Set(pickerRows.map((r) => r.unit))].sort((a, b) => a.localeCompare(b)), [pickerRows]);

  const gisForSelectedUnit = useMemo(() => {
    if (!selectedUnit) return [];
    const counts = new Map<string, number>();
    for (const row of pickerRows) {
      if (row.unit !== selectedUnit) continue;
      // A plain incomer ruas (e.g. "INCOMER SKS") isn't itself a GI and
      // isn't a complete point-to-point ruas — just a spur, already
      // represented in step 3's own full description once its real host
      // GI is picked — so it doesn't contribute its own entry here.
      if (row.plain && isIncomerRuas(row.plain.section)) continue;
      counts.set(row.originLabel, (counts.get(row.originLabel) ?? 0) + 1);
      counts.set(row.farEndLabel, (counts.get(row.farEndLabel) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pickerRows, selectedUnit]);

  const rowsForSelectedGi = useMemo(() => {
    if (!selectedUnit || !selectedGi) return [];
    return pickerRows.filter((row) => row.unit === selectedUnit && (row.originLabel === selectedGi || row.farEndLabel === selectedGi));
  }, [pickerRows, selectedUnit, selectedGi]);

  const selectedCombined =
    sectionKey && sectionKey.startsWith("combined::")
      ? (combinedList.find((c) => combinedIncomerKey(c.ruas.section) === sectionKey) ?? null)
      : null;
  const ruas = selectedCombined ? selectedCombined.ruas : (ruasList.find((r) => r.section === sectionKey) ?? null);
  // Display-only — a handful of ruas (KASONGAN - SUDAN, MINTIN -
  // PALANGKARAYA) can also resolve a search to a few extra shared-
  // approach-corridor towers from the GI they share with another ruas
  // (see withSharedApproachCorridor's own comment in the lib); this count
  // reflects that so "X tower" here matches what a search can actually
  // find, without touching ruas.towers itself (every other module reading
  // SuttRuas still counts these towers exactly once, under their one real
  // ruasList entry).
  const searchableTowerCount = ruas ? withSharedApproachCorridor(ruas, ruasList).towers.length : 0;
  const sigapBayLine = ruas ? findSigapBayLine(ruas, sigapInsightsByFuncLoc) : null;
  const sigapFasa = ruas ? findSigapFasa(ruas, sigapInsightsByFuncLoc) : null;

  const entries = useMemo(() => buildEntries(inputs), [inputs]);
  const filledCount = entries.filter((e) => e.mode !== "empty").length;

  // Every currently-matched tower across all 4 methods at once (not just
  // one card's own single entry) — purely to know which towers need a
  // weather lookup below; each card still independently resolves its own
  // single result for display, same as before.
  const allResults = useMemo(() => (ruas ? buildMethodResults(ruas, ruasList, direction, entries) : []), [ruas, ruasList, direction, entries]);

  // Fetched once per distinct matched tower (deduped via fetchedWeatherKeys,
  // never re-fetched just because the component re-rendered) and kept here
  // at the top level — not inside each result panel — so the SAME reading
  // can feed both the UI (TowerWeatherLine) and the WA text below (per the
  // user's own request to add weather to the copy-paste message too; a
  // per-panel fetch couldn't reach into that synchronous text builder).
  const [weatherByTowerKey, setWeatherByTowerKey] = useState<Record<string, TowerWeather>>({});
  const fetchedWeatherKeys = useRef(new Set<string>());
  useEffect(() => {
    const toFetch: { key: string; lat: number; lon: number }[] = [];
    for (const r of allResults) {
      const t = r.match.tower;
      if (t.lat === null || t.lon === null) continue;
      const key = giTowerKey(t.gi, t.towerNo);
      if (fetchedWeatherKeys.current.has(key)) continue;
      fetchedWeatherKeys.current.add(key);
      toFetch.push({ key, lat: t.lat, lon: t.lon });
    }
    if (toFetch.length === 0) return;
    let cancelled = false;
    Promise.all(
      toFetch.map(({ key, lat, lon }) =>
        fetch(`/api/tower-weather?lat=${lat}&lon=${lon}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: TowerWeather | null) => [key, data] as const)
          .catch(() => [key, null] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      const fetched = results.filter((r): r is [string, TowerWeather] => r[1] !== null);
      if (fetched.length === 0) return;
      setWeatherByTowerKey((prev) => ({ ...prev, ...Object.fromEntries(fetched) }));
    });
    return () => {
      cancelled = true;
    };
  }, [allResults]);

  const waText = ruas
    ? formatWaMessage(
        ruas,
        ruasList,
        direction,
        entries,
        sigapInsightsByFuncLoc,
        gangguanHistoryByGiTower,
        rowWatchIndex,
        weatherByTowerKey,
        giRegistry,
      )
    : "";

  function reset() {
    setInputs(EMPTY_INPUTS);
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Select
              value={selectedUnit ?? ""}
              onValueChange={(v) => {
                setSelectedUnit(v || null);
                setSelectedGi(null);
                setSectionKey(null);
                setDirection("origin");
                reset();
              }}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="1. Pilih ULTG...">{selectedUnit ?? "1. Pilih ULTG..."}</SelectValue>
              </SelectTrigger>
              {/* alignItemWithTrigger (the primitive's own default) centers
                  the currently-selected item over the trigger instead of
                  just dropping the panel below it — which can push it
                  upward or sideways depending on which item that is. These
                  three pickers want a plain, always-downward dropdown. */}
              <SelectContent alignItemWithTrigger={false}>
                {units.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedGi ?? ""}
              onValueChange={(v) => {
                setSelectedGi(v || null);
                setSectionKey(null);
                setDirection("origin");
                reset();
              }}
              disabled={!selectedUnit}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="2. Pilih GI...">{selectedGi ?? "2. Pilih GI..."}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {gisForSelectedUnit.map(([gi, count]) => (
                  <SelectItem key={gi} value={gi}>
                    {gi} ({count} ruas)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sectionKey ?? ""}
              onValueChange={(v) => {
                setSectionKey(v || null);
                setDirection("origin");
                reset();
              }}
              disabled={!selectedGi}
            >
              <SelectTrigger className="w-full sm:flex-1">
                <SelectValue placeholder="3. Pilih Ruas...">
                  {selectedCombined ? `⇒ ${selectedCombined.ruas.section}` : (sectionKey ?? "3. Pilih Ruas...")}
                </SelectValue>
              </SelectTrigger>
              {/* The underlying Select primitive ties its popup width to the
                  trigger's own anchor width and forces each item's text onto
                  one line (see src/components/ui/select.tsx's own SelectItem)
                  — fine for short labels, but a combined through-route's own
                  description is a full sentence. Overridden here, for this
                  one Select only, rather than changing that shared primitive
                  (every other dropdown in the app still wants its normal
                  single-line, trigger-width behavior). */}
              <SelectContent
                alignItemWithTrigger={false}
                className="!w-[min(92vw,620px)] [&_[data-slot=select-item]]:!whitespace-normal [&_[data-slot=select-item]>div]:!whitespace-normal"
              >
                {rowsForSelectedGi.map((row) => {
                  if (row.combined) {
                    const c = row.combined;
                    return (
                      <SelectItem key={row.key} value={row.key} className="whitespace-normal">
                        ⇒ {c.ruas.section} ({formatKm(c.ruas.lengthKm)}, {c.ruas.towers.length} tower) —{" "}
                        {c.includesIncomer
                          ? `terpotong dari ${c.hostSection} Tower ${c.tapTowerNo}, lanjut ke INCOMER ${c.gi}`
                          : `sisi lain dari titik sambung INCOMER ${c.gi} (Tower ${c.tapTowerNo} di ${c.hostSection})`}
                      </SelectItem>
                    );
                  }
                  const r = row.plain!;
                  const tap = isIncomerRuas(r.section) ? findIncomerTapInfo(r.section) : null;
                  return (
                    <SelectItem key={row.key} value={row.key} className="whitespace-normal">
                      {isIncomerRuas(r.section) ? (
                        <>
                          ↳ {r.section} ({formatKm(r.lengthKm)}) — Incomer
                          {tap ? ` dari ${formatIncomerTapsLabel(tap.taps)}` : " (titik sambung belum ada data)"}
                        </>
                      ) : (
                        `${r.section} (${formatKm(r.lengthKm)})`
                      )}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {ruas ? (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">
                  {ruas.unit} ·{" "}
                  {searchableTowerCount !== ruas.towers.length
                    ? `${searchableTowerCount} tower (termasuk ${searchableTowerCount - ruas.towers.length} tower pendekatan bersama di GI ${ruas.originLabel})`
                    : `${ruas.towers.length} tower`}{" "}
                  · panjang {formatKm(ruas.lengthKm)}
                  {sigapBayLine ? (
                    <>
                      {" "}
                      · Kode SIGAP <span className="font-semibold text-foreground">{sigapBayLine}</span>
                    </>
                  ) : null}
                  {sigapFasa ? (
                    <>
                      {" "}
                      · Urutan fasa (SIGAP) <span className="font-semibold text-foreground">{sigapFasa}</span>
                    </>
                  ) : null}
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
              {selectedCombined ? (
                <p className="flex items-center gap-1 font-semibold text-primary">
                  <GitBranch className="size-3 shrink-0" />
                  {selectedCombined.includesIncomer
                    ? `Ruas gabungan: ${selectedCombined.hostTowerCount} tower hingga titik sambung Tower ${selectedCombined.tapTowerNo} di ${selectedCombined.hostSection}, lalu +${selectedCombined.incomerTowerCount} tower dari INCOMER ${selectedCombined.gi} (${selectedCombined.incomerSection}).`
                    : `Sisi lain dari titik sambung INCOMER ${selectedCombined.gi} (Tower ${selectedCombined.tapTowerNo} di ${selectedCombined.hostSection}) — ${selectedCombined.hostTowerCount} tower, tidak melalui ruas incomer-nya.`}
                </p>
              ) : isIncomerRuas(ruas.section) ? (
                (() => {
                  const tap = findIncomerTapInfo(ruas.section);
                  return (
                    <p className="flex items-center gap-1 font-semibold text-primary">
                      <GitBranch className="size-3 shrink-0" />
                      {tap
                        ? `Ruas Incomer — tersambung dari ${formatIncomerTapsLabel(tap.taps)}`
                        : "Ruas Incomer — titik sambung ke ruas utama belum ada data"}
                    </p>
                  );
                })()
              ) : (
                (() => {
                  const incomersHere = findIncomersTappingFrom(ruas.section);
                  return incomersHere.length > 0 ? (
                    <p className="flex items-center gap-1 font-semibold text-primary">
                      <GitBranch className="size-3 shrink-0" />
                      {incomersHere.length} percabangan Incomer dari ruas ini:{" "}
                      {incomersHere
                        .map((t) => {
                          const tap = t.taps.find((x) => x.ruasSection === ruas.section);
                          const incomerRuas = ruasList.find((r) => r.section === t.incomerSection);
                          return `${t.gi} (Tower ${tap?.towerNo ?? "?"}${
                            incomerRuas ? `, +${incomerRuas.towers.length} tower lanjutan` : ""
                          })`;
                        })
                        .join(", ")}{" "}
                      — pilih opsi &quot;⇒ {ruas.originLabel} - {incomersHere[0].gi}&quot; di atas untuk mencari
                      langsung sampai ke GI incomer-nya dalam satu ruas.
                    </p>
                  ) : null;
                })()
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pilih ruas, lalu isi hasil dari tiap metode yang tersedia (boleh salah satu, boleh semua) untuk melihat
              perkiraan tower.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-extrabold tracking-tight">2. Hasil per Metode</h3>
          <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={reset} disabled={filledCount === 0}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <VaisalaCard
            status={inputs.VAISALA.status}
            towerNo={inputs.VAISALA.towerNo}
            onStatusChange={(status) => setInputs((prev) => ({ ...prev, VAISALA: { ...prev.VAISALA, status } }))}
            onTowerNoChange={(towerNo) => setInputs((prev) => ({ ...prev, VAISALA: { ...prev.VAISALA, towerNo } }))}
            ruas={ruas}
            allRuas={ruasList}
            direction={direction}
            sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
            gangguanHistoryByGiTower={gangguanHistoryByGiTower}
            rowWatchIndex={rowWatchIndex}
            weatherByTowerKey={weatherByTowerKey}
            giRegistry={giRegistry}
          />
          <DistanceCard
            method="TWFL"
            label={FAULT_METHOD_LABELS.TWFL}
            value={inputs.TWFL.distanceKm}
            onChange={(v) => setInputs((prev) => ({ ...prev, TWFL: { distanceKm: v } }))}
            ruas={ruas}
            allRuas={ruasList}
            direction={direction}
            sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
            gangguanHistoryByGiTower={gangguanHistoryByGiTower}
            rowWatchIndex={rowWatchIndex}
            weatherByTowerKey={weatherByTowerKey}
            giRegistry={giRegistry}
          />
          <SmdeCard
            distanceValue={inputs.SMDE.distanceKm}
            ordinalValue={inputs.SMDE.ordinal}
            onDistanceChange={(v) => setInputs((prev) => ({ ...prev, SMDE: { ...prev.SMDE, distanceKm: v } }))}
            onOrdinalChange={(v) => setInputs((prev) => ({ ...prev, SMDE: { ...prev.SMDE, ordinal: v } }))}
            ruas={ruas}
            allRuas={ruasList}
            direction={direction}
            sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
            gangguanHistoryByGiTower={gangguanHistoryByGiTower}
            rowWatchIndex={rowWatchIndex}
            weatherByTowerKey={weatherByTowerKey}
            giRegistry={giRegistry}
          />
          <DistanceCard
            method="FAULT_LOCATOR_RELAY"
            label={FAULT_METHOD_LABELS.FAULT_LOCATOR_RELAY}
            value={inputs.FAULT_LOCATOR_RELAY.distanceKm}
            onChange={(v) => setInputs((prev) => ({ ...prev, FAULT_LOCATOR_RELAY: { distanceKm: v } }))}
            ruas={ruas}
            allRuas={ruasList}
            direction={direction}
            sigapInsightsByFuncLoc={sigapInsightsByFuncLoc}
            gangguanHistoryByGiTower={gangguanHistoryByGiTower}
            rowWatchIndex={rowWatchIndex}
            weatherByTowerKey={weatherByTowerKey}
            giRegistry={giRegistry}
          />
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
              Pilih ruas dan isi minimal satu hasil metode untuk membuat teks siap kirim.
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
