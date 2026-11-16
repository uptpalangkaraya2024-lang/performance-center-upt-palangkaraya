// "Prioritas Proteksi Petir": stretches of line repeatedly tripped by
// lightning, cross-checked against what protection each struck tower
// already has according to SIGAP (TLA marker, footing resistance). Built
// server-side in src/services/lightning-priority.ts; this file holds the
// shared shapes and the per-range verdict so the client can render it.

/** Footing resistance above this (ohm) counts as "needs improvement" —
 *  the common SUTT 150 kV target used in the UPT's own follow-up items. */
export const R_LIMIT_OHM = 10;

export interface LightningTower {
  towerNo: string;
  /** Lightning incidents naming this tower. */
  hits: number;
  /** false when SIGAP has no record of this tower at all. */
  inSigap: boolean;
  tla: boolean;
  dgs: boolean;
  rOhm: number | null;
  /** Sum of SIGAP's yearly strike counts near this tower; null if none recorded. */
  sambaran: number | null;
}

export interface LightningIncident {
  tgl: string;
  towerNos: string[];
}

export type LightningPriorityLevel = "Tinggi" | "Sedang" | "Rendah";

export interface LightningPriorityRange {
  ruasSection: string;
  unit: string;
  gi: string;
  fromTowerNo: string;
  toTowerNo: string;
  /** Distinct lightning incidents in the range. */
  count: number;
  /** Newest first. */
  incidents: LightningIncident[];
  towers: LightningTower[];
  sambaranTotal: number;
  /** Struck towers without a TLA. */
  needTla: string[];
  /** Struck towers with footing resistance above R_LIMIT_OHM. */
  needGrounding: string[];
  /** Struck towers SIGAP has no resistance value for. */
  needMeasurement: string[];
  priority: LightningPriorityLevel;
}

/** Tinggi: at least one struck tower lacks BOTH a TLA and a known-good
 *  footing (no TLA, and R high or unmeasured) — nothing stands between the
 *  next strike and a trip there. Sedang: some protection gap remains.
 *  Rendah: every struck tower has a TLA and R within limit, so the cause
 *  of repeat trips is elsewhere (insulator condition, shielding angle). */
export function judgePriority(towers: LightningTower[]): Pick<
  LightningPriorityRange,
  "needTla" | "needGrounding" | "needMeasurement" | "priority"
> {
  const struck = towers.filter((t) => t.hits > 0 && t.inSigap);
  const needTla = struck.filter((t) => !t.tla).map((t) => t.towerNo);
  const needGrounding = struck.filter((t) => t.rOhm !== null && t.rOhm > R_LIMIT_OHM).map((t) => t.towerNo);
  const needMeasurement = struck.filter((t) => t.rOhm === null).map((t) => t.towerNo);
  const unprotected = struck.some((t) => !t.tla && (t.rOhm === null || t.rOhm > R_LIMIT_OHM));
  const anyGap = needTla.length + needGrounding.length + needMeasurement.length > 0;
  const priority: LightningPriorityLevel = unprotected ? "Tinggi" : anyGap ? "Sedang" : "Rendah";
  return { needTla, needGrounding, needMeasurement, priority };
}

export const PRIORITY_RANK: Record<LightningPriorityLevel, number> = { Tinggi: 0, Sedang: 1, Rendah: 2 };
