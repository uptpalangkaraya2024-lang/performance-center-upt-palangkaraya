// Pure, client-safe AHI derivations — AHI's own service (src/services/
// ahi-performance.ts) does the one-time spreadsheet parse (server-only) and
// hands back a flat AhiAnomalyRecord[]; this file derives per-ULTG / per-
// equipment summaries from it, same "load once, derive many things" shape
// as src/lib/abo-proteksi-compute.ts, src/lib/four-dx-compute.ts, and
// src/lib/ce-compute.ts.
import type { AhiAnomalyRecord } from "@/types";

export interface AhiUltgResumeEntry {
  ultg: string;
  total: number;
  /** kategoriAhi === 5 — the sheet's own "Critical" level. */
  critical: number;
  /** kategoriAhi === 4 — "Poor". */
  poor: number;
  percentCritical: number | null;
}

/** Per-ULTG anomaly resume — total findings, how many are Critical (level
 *  5) vs Poor (level 4), and Critical's share of that ULTG's own total.
 *  ULTG column order follows first-seen order in `anomalies`, same
 *  convention already used by buildCeUltgIdeal/buildAboUltgResume, rather
 *  than a hardcoded list. */
export function buildAhiUltgResume(anomalies: AhiAnomalyRecord[]): AhiUltgResumeEntry[] {
  const order: string[] = [];
  const map = new Map<string, AhiAnomalyRecord[]>();
  for (const a of anomalies) {
    const key = a.ultg || "Lainnya";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(a);
  }
  return order.map((ultg) => {
    const group = map.get(ultg)!;
    const critical = group.filter((a) => a.kategoriAhi === 5).length;
    const poor = group.filter((a) => a.kategoriAhi === 4).length;
    return { ultg, total: group.length, critical, poor, percentCritical: group.length > 0 ? critical / group.length : null };
  });
}

export interface AhiUltgEquipmentCell {
  ultg: string;
  total: number;
  critical: number;
}

export interface AhiUltgEquipmentRow {
  jenisAset: string;
  total: number;
  critical: number;
  byUltg: AhiUltgEquipmentCell[];
}

/** Detail view behind buildAhiUltgResume's own summary — one row per
 *  equipment type (jenisAset, e.g. Trafo/LA/DS/CB/PT/CT/NGR — a small,
 *  discrete set confirmed live, not free text), each ULTG's own total &
 *  Critical count shown side by side. Answers "which ULTG + which
 *  equipment type" instead of just "which ULTG." Row order follows
 *  descending total count (worst equipment type first) — equipment-type
 *  labels and ULTG labels both taken directly from the data, no hardcoded
 *  list, so a future equipment type or ULTG just appears rather than being
 *  silently dropped. */
export function buildAhiUltgEquipmentMatrix(anomalies: AhiAnomalyRecord[]): AhiUltgEquipmentRow[] {
  const ultgOrder: string[] = [];
  const jenisOrder: string[] = [];
  for (const a of anomalies) {
    const ultgKey = a.ultg || "Lainnya";
    const jenisKey = a.jenisAset || "Lainnya";
    if (!ultgOrder.includes(ultgKey)) ultgOrder.push(ultgKey);
    if (!jenisOrder.includes(jenisKey)) jenisOrder.push(jenisKey);
  }

  const rows = jenisOrder.map((jenisAset) => {
    const group = anomalies.filter((a) => (a.jenisAset || "Lainnya") === jenisAset);
    const byUltg = ultgOrder.map((ultg) => {
      const ultgGroup = group.filter((a) => (a.ultg || "Lainnya") === ultg);
      return { ultg, total: ultgGroup.length, critical: ultgGroup.filter((a) => a.kategoriAhi === 5).length };
    });
    return {
      jenisAset,
      total: group.length,
      critical: group.filter((a) => a.kategoriAhi === 5).length,
      byUltg,
    };
  });

  return rows.sort((a, b) => b.total - a.total);
}
