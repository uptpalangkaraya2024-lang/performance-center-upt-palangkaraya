// KPI performance prognosis ("Grafik Prognosa Kinerja") — per user's own
// explicit request: for a KPI currently warning/critical, project roughly
// which month it crosses back into "achieved" if its current monthly pace
// continues. Built from `monthlyTrend` (the sheet's own "Realisasi
// Komulatif" — a running cumulative total, one entry per calendar month
// index 0=Jan..currentMonthIndex), never from `achievement`/status itself:
// that figure is the sheet's own officially-scored Pencapaian (capping,
// bobot-hilang rules this app deliberately never reimplements — see
// UptKpi's own comment). This module instead projects the RAW realisasi
// value against the RAW target, and says so explicitly in every note, so
// it's never mistaken for predicting the official contract score.
import type { StatusLevel, UptKpiDirection, UptKpiMonthlyPoint } from "@/types";

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export type PrognosisOutcome =
  | "proyeksi_tercapai"
  | "tidak_tercapai_tahun_ini"
  | "stagnan"
  | "sudah_lewat_batas"
  | "dalam_batas"
  | "sudah_capai_raw"
  | "data_tidak_cukup";

export interface KpiPrognosis {
  key: string;
  displayName: string;
  status: StatusLevel;
  direction: UptKpiDirection | null;
  currentValue: number | null;
  targetValue: number | null;
  /** Average change in cumulative value per calendar month, over the span
   *  between the first and last non-null monthlyTrend points. */
  monthlyPace: number | null;
  /** 0-11 — only set for outcome "proyeksi_tercapai". */
  projectedMonthIndex: number | null;
  projectedMonthLabel: string | null;
  outcome: PrognosisOutcome;
  /** Always a human explanation, even for outcomes with no projected
   *  month — never a silent blank. */
  note: string;
}

interface KpiLike {
  key: string;
  displayName: string;
  status: StatusLevel;
  direction: UptKpiDirection | null;
  targetValue: number | null;
  monthlyTrend: UptKpiMonthlyPoint[] | null;
}

/** One prognosis per currently warning/critical KPI — "good"/"none" status
 *  KPIs return null (nothing to project: already fine, or no data at
 *  all). Every warning/critical KPI gets an entry, even when no clean
 *  projection is possible, so this is a complete accounting of "what's not
 *  green and why," never a silently filtered subset. */
export function buildKpiPrognosis(kpi: KpiLike): KpiPrognosis | null {
  if (kpi.status !== "warning" && kpi.status !== "critical") return null;

  const base = { key: kpi.key, displayName: kpi.displayName, status: kpi.status, direction: kpi.direction };
  const trend = kpi.monthlyTrend;

  if (!trend || trend.length === 0 || kpi.direction === null || kpi.targetValue === null) {
    return {
      ...base,
      currentValue: null,
      targetValue: kpi.targetValue,
      monthlyPace: null,
      projectedMonthIndex: null,
      projectedMonthLabel: null,
      outcome: "data_tidak_cukup",
      note: "Data tren bulanan, arah polaritas, atau nilai target tidak tersedia untuk KPI ini.",
    };
  }

  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < trend.length; i++) {
    if (trend[i].value === null) continue;
    if (firstIdx === -1) firstIdx = i;
    lastIdx = i;
  }

  if (firstIdx === -1 || firstIdx === lastIdx) {
    return {
      ...base,
      currentValue: lastIdx >= 0 ? trend[lastIdx].value : null,
      targetValue: kpi.targetValue,
      monthlyPace: null,
      projectedMonthIndex: null,
      projectedMonthLabel: null,
      outcome: "data_tidak_cukup",
      note: "Belum cukup titik data bulanan (minimal 2 bulan terisi) untuk membuat proyeksi tren.",
    };
  }

  const currentValue = trend[lastIdx].value as number;
  const firstValue = trend[firstIdx].value as number;
  const monthsSpan = lastIdx - firstIdx;
  const monthlyPace = monthsSpan > 0 ? (currentValue - firstValue) / monthsSpan : null;
  const targetValue = kpi.targetValue;

  if (kpi.direction === "LOWER_IS_BETTER") {
    if (currentValue > targetValue) {
      return {
        ...base,
        currentValue,
        targetValue,
        monthlyPace,
        projectedMonthIndex: null,
        projectedMonthLabel: null,
        outcome: "sudah_lewat_batas",
        note: "Realisasi kumulatif sudah melewati batas target tahun ini. Karena nilai kumulatif tidak bisa turun kembali dalam tahun berjalan, status ini tidak dapat kembali hijau sampai periode berikutnya.",
      };
    }
    return {
      ...base,
      currentValue,
      targetValue,
      monthlyPace,
      projectedMonthIndex: null,
      projectedMonthLabel: null,
      outcome: "dalam_batas",
      note: "Realisasi kumulatif masih di bawah batas target mentah — status Pencapaian resmi kemungkinan dipengaruhi faktor lain dalam rumus skor kontrak (bobot/capping) yang tidak direplikasi di sini.",
    };
  }

  // HIGHER_IS_BETTER
  if (currentValue >= targetValue) {
    return {
      ...base,
      currentValue,
      targetValue,
      monthlyPace,
      projectedMonthIndex: null,
      projectedMonthLabel: null,
      outcome: "sudah_capai_raw",
      note: "Realisasi mentah sudah mencapai/melewati target, namun status Pencapaian resmi masih Warning/Critical — kemungkinan rumus skor kontrak (bobot/capping) berbeda dari rasio realisasi mentah terhadap target.",
    };
  }

  if (monthlyPace === null || monthlyPace <= 0) {
    return {
      ...base,
      currentValue,
      targetValue,
      monthlyPace,
      projectedMonthIndex: null,
      projectedMonthLabel: null,
      outcome: "stagnan",
      note: "Realisasi stagnan atau menurun berdasarkan tren bulanan yang ada — belum dapat diproyeksikan kapan mencapai target pada tren saat ini.",
    };
  }

  const monthsNeeded = (targetValue - currentValue) / monthlyPace;
  const projectedIdxRaw = lastIdx + Math.ceil(monthsNeeded);

  if (projectedIdxRaw > 11) {
    return {
      ...base,
      currentValue,
      targetValue,
      monthlyPace,
      projectedMonthIndex: null,
      projectedMonthLabel: null,
      outcome: "tidak_tercapai_tahun_ini",
      note: `Pada laju realisasi rata-rata ${monthlyPace.toFixed(2)}/bulan, target diproyeksikan TIDAK tercapai dalam tahun berjalan pada tren saat ini.`,
    };
  }

  return {
    ...base,
    currentValue,
    targetValue,
    monthlyPace,
    projectedMonthIndex: projectedIdxRaw,
    projectedMonthLabel: MONTH_ID[projectedIdxRaw],
    outcome: "proyeksi_tercapai",
    note: `Pada laju realisasi rata-rata ${monthlyPace.toFixed(2)}/bulan, target diproyeksikan tercapai pada ${MONTH_ID[projectedIdxRaw]}.`,
  };
}

export function buildKpiPrognosisList(kpis: KpiLike[]): KpiPrognosis[] {
  return kpis
    .map(buildKpiPrognosis)
    .filter((p): p is KpiPrognosis => p !== null)
    .sort((a, b) => (a.projectedMonthIndex ?? 99) - (b.projectedMonthIndex ?? 99));
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

interface TrendInfo {
  lastIdx: number;
  lastValue: number | null;
  /** Average change in cumulative value per calendar month, null when not
   *  computable (fewer than 2 non-null points). */
  pace: number | null;
}

function extractTrendInfo(trend: UptKpiMonthlyPoint[] | null): TrendInfo {
  if (!trend) return { lastIdx: -1, lastValue: null, pace: null };
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < trend.length; i++) {
    if (trend[i].value === null) continue;
    if (firstIdx === -1) firstIdx = i;
    lastIdx = i;
  }
  if (lastIdx === -1) return { lastIdx: -1, lastValue: null, pace: null };
  const lastValue = trend[lastIdx].value as number;
  if (firstIdx === lastIdx) return { lastIdx, lastValue, pace: null };
  const firstValue = trend[firstIdx].value as number;
  const pace = (lastValue - firstValue) / (lastIdx - firstIdx);
  return { lastIdx, lastValue, pace };
}

/** Projects a KPI's own raw cumulative value forward to a FUTURE month
 *  index, using its own pace — null when there's nothing to project from,
 *  or the month isn't actually in the future relative to this KPI's own
 *  last reported point. Falls back to a flat projection (pace null ->
 *  hold at last known value) rather than refusing outright, so a KPI with
 *  only 1 data point still contributes *something* to the aggregate
 *  instead of silently dropping out of it. */
function projectValueAtMonth(info: TrendInfo, monthIndex: number): number | null {
  if (info.lastValue === null || monthIndex <= info.lastIdx) return null;
  if (info.pace === null) return info.lastValue;
  return info.lastValue + info.pace * (monthIndex - info.lastIdx);
}

/** Single-KPI achievement ratio for one raw value — HIGHER_IS_BETTER is
 *  value/target, LOWER_IS_BETTER is target/value (so "ratio >= 100" always
 *  means "doing fine" regardless of polarity). Capped at 110, the same
 *  number the sheet's own "Capping 110%" column uses, so this reads on a
 *  familiar scale — NOT a replica of the official formula itself. */
function ratioForValue(value: number, target: number, direction: UptKpiDirection): number {
  if (target === 0) return 100;
  const raw = direction === "HIGHER_IS_BETTER" ? (value / target) * 100 : value <= 0 ? 110 : (target / value) * 100;
  return Math.min(raw, 110);
}

export interface MonthlyAggregatePoint {
  monthIndex: number;
  monthLabel: string;
  /** Average achievement ratio (raw value vs raw target, see
   *  ratioForValue) across every KPI with enough data for this month —
   *  null when no KPI had anything to contribute. */
  avgRatio: number | null;
  /** False for months already reported (real monthlyTrend data), true for
   *  months beyond the last reporting month (projected from each KPI's
   *  own pace). */
  isProjected: boolean;
}

/** One point per calendar month, Jan-Dec — real average achievement ratio
 *  for already-reported months, projected for the rest of the year. This
 *  is an approximation of "overall performance trajectory," explicitly
 *  NOT the official weighted Skor Kontrak (which has capping/bobot-hilang
 *  rules this app doesn't reimplement) — every caller must say so. */
export function buildMonthlyAggregateSeries(kpis: KpiLike[]): MonthlyAggregatePoint[] {
  const maxLen = Math.max(0, ...kpis.map((k) => k.monthlyTrend?.length ?? 0));
  const lastReportedIdx = maxLen - 1;
  if (lastReportedIdx < 0) return [];

  const withTrend = kpis
    .filter((k) => k.direction !== null && k.targetValue !== null && k.targetValue !== 0)
    .map((k) => ({ kpi: k, info: extractTrendInfo(k.monthlyTrend) }));

  const points: MonthlyAggregatePoint[] = [];
  for (let m = 0; m <= 11; m++) {
    const ratios: number[] = [];
    for (const { kpi, info } of withTrend) {
      const value = m <= lastReportedIdx ? (kpi.monthlyTrend?.[m]?.value ?? null) : projectValueAtMonth(info, m);
      if (value === null) continue;
      ratios.push(ratioForValue(value, kpi.targetValue as number, kpi.direction as UptKpiDirection));
    }
    points.push({
      monthIndex: m,
      monthLabel: MONTH_SHORT[m],
      avgRatio: ratios.length > 0 ? ratios.reduce((s, r) => s + r, 0) / ratios.length : null,
      isProjected: m > lastReportedIdx,
    });
  }
  return points;
}

export interface StatusMonthColumn {
  monthIndex: number;
  monthLabel: string;
  merah: string[];
  kuning: string[];
}

/** Which currently warning/critical KPIs are projected to still be
 *  red/yellow in each remaining month of the year — a KPI that's
 *  projected to cross into "achieved" that month simply stops appearing,
 *  same visual language as the user's own reference design. LOWER_IS_BETTER
 *  KPIs (and ones with no direction/target/trend to project from) keep
 *  their CURRENT status in every future column instead of being silently
 *  projected — a cumulative ceiling-type metric can't recover within the
 *  same year once breached (see buildKpiPrognosis's own "sudah_lewat_batas"),
 *  and there's no honest month-by-month story to tell for the rest. */
export function buildStatusTransitionMatrix(kpis: KpiLike[]): StatusMonthColumn[] {
  const maxLen = Math.max(0, ...kpis.map((k) => k.monthlyTrend?.length ?? 0));
  const lastReportedIdx = maxLen - 1;
  if (lastReportedIdx < 0 || lastReportedIdx >= 11) return [];

  const troubled = kpis.filter((k) => k.status === "warning" || k.status === "critical");
  const columns: StatusMonthColumn[] = [];

  for (let m = lastReportedIdx + 1; m <= 11; m++) {
    const merah: string[] = [];
    const kuning: string[] = [];
    for (const kpi of troubled) {
      if (kpi.direction !== "HIGHER_IS_BETTER" || kpi.targetValue === null) {
        (kpi.status === "critical" ? merah : kuning).push(kpi.displayName);
        continue;
      }
      const info = extractTrendInfo(kpi.monthlyTrend);
      const projected = projectValueAtMonth(info, m);
      if (projected === null) {
        (kpi.status === "critical" ? merah : kuning).push(kpi.displayName);
        continue;
      }
      const ratio = (projected / kpi.targetValue) * 100;
      if (ratio >= 100) continue;
      if (ratio >= 90) kuning.push(kpi.displayName);
      else merah.push(kpi.displayName);
    }
    columns.push({ monthIndex: m, monthLabel: MONTH_ID[m], merah, kuning });
  }
  return columns;
}
