// "Tindak Lanjut Gangguan Belum Selesai": every incident whose STATUS
// TINDAK LANJUT GGN is still OPEN, with how long it has been open and
// which of its planned jobs (TINDAK LANJUT 1-5 PRMRY/SCDRY) are still
// unticked. Built server-side in src/services/follow-up-aging.ts; this file
// holds the shared shapes plus the small pure helpers the client uses.

export type FollowUpSide = "Primer" | "Sekunder";

export interface FollowUpJob {
  side: FollowUpSide;
  text: string;
  type: WorkType;
}

export interface FollowUpItem {
  /** Short sheet id, e.g. "#0536"; "" when the row has none. */
  id: string;
  dateISO: string;
  ageDays: number;
  ultg: string;
  gi: string;
  bay: string;
  category: "Transmisi" | "Trafo";
  cause: string;
  /** 0..1 from PROGRESS TINDAKLANJUT PRMRY; null when the sheet says TIDAK ADA. */
  progressPrimary: number | null;
  progressSecondary: number | null;
  jobsDone: number;
  jobsTotal: number;
  pending: FollowUpJob[];
  /** TANGGAL RENCANA TINDAK LANJUT, yyyy-MM-dd; null when blank. */
  plannedISO: string | null;
  /** How many sheet rows were merged into this one (both line ends filing). */
  reports: number;
  pptUrl: string | null;
}

export const WORK_TYPES = [
  "Isolator & arcing horn",
  "Perbaikan pentanahan / proteksi petir",
  "Pengukuran pentanahan / soil",
  "Cleaning isolator",
  "Anti binatang / sarang",
  "Pohon / ROW",
  "Konduktor",
  "Proteksi & relay",
  "Inspeksi (drone / CUI)",
  "Lainnya",
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/** Keyword classification of a free-text job line. Order matters: a line
 *  like "Pengukuran ... dan penggantian isolator" is about the isolator. */
export function classifyJob(text: string, side: FollowUpSide): WorkType {
  const t = text.toLowerCase();
  if ((/isolator/.test(t) && /(ganti|penggantian|pecah|flash)/.test(t)) || /arc?h?ing horn/.test(t)) return "Isolator & arcing horn";
  if (/(cleaning|pembersihan|bersih)[^.]*isolator|puncture/.test(t)) return "Cleaning isolator";
  if (/(perbaikan|perkuatan|pemasangan|penambahan)[^.]*(pentanahan|grounding|mggs|mdg|mrg|proteksi petir|tla)|mggs|\btla\b/.test(t))
    return "Perbaikan pentanahan / proteksi petir";
  if (/pengukuran|pengujian soil|soil resistivity|validasi hasil pengukuran/.test(t)) return "Pengukuran pentanahan / soil";
  if (/binatang|sarang|ular|bangkai|jaring/.test(t)) return "Anti binatang / sarang";
  if (/pohon|tegakan|\brow\b|lidar|penebang/.test(t)) return "Pohon / ROW";
  if (/konduktor|rantas/.test(t)) return "Konduktor";
  if (side === "Sekunder" || /relay|setting|pmt|reclose|\bar\b|signal|recording|\bvt\b|penyulang/.test(t)) return "Proteksi & relay";
  if (/drone|cui|inspe|scanning/.test(t)) return "Inspeksi (drone / CUI)";
  return "Lainnya";
}

export const AGE_BUCKETS = [
  { label: "< 30 hari", max: 30 },
  { label: "30–90 hari", max: 90 },
  { label: "90–180 hari", max: 180 },
  { label: "180–365 hari", max: 365 },
  { label: "> 365 hari", max: Infinity },
] as const;

export function ageBucketIndex(days: number): number {
  return AGE_BUCKETS.findIndex((b) => days < b.max);
}

/** Months-and-days style label: "45 hari", "7 bln 3 hr". */
export function formatAge(days: number): string {
  if (days < 60) return `${days} hari`;
  const months = Math.floor(days / 30.44);
  const rest = Math.round(days - months * 30.44);
  return rest > 0 ? `${months} bln ${rest} hr` : `${months} bln`;
}
