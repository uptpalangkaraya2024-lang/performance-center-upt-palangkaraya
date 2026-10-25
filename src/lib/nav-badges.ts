import "server-only";

import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReportsWithHistory } from "@/services/ahi-bay-line-report";
import { getRenusData } from "@/services/renus";
import { getAssetScanning } from "@/services/asset-scanning";
import { getDisturbances } from "@/services/disturbances";
import { buildAboSnapshotComputed, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { buildCeAttentionItems, defaultCeWeekLabel } from "@/lib/ce-compute";
import { isRenusCancelled, isRenusDone } from "@/lib/renus-helpers";
import { findAhiDegradationAlerts } from "@/lib/ahi-degradation";
import { buildAhiTrendProjections } from "@/lib/ahi-trend-projection";

/** href -> count of "belum" items for that module, at today's period.
 *  Rendered as a small pill next to the matching sidebar entry so a user
 *  can tell where attention is needed without opening every module first.
 *  Reads reuse the same 1-minute in-memory cache the pages themselves use
 *  (see src/lib/data-connector.ts), so this costs nothing extra beyond the
 *  first read of the day. Every module here is wrapped in its own
 *  try/catch — a badge failing to compute must never break the sidebar. */
export async function getNavBadges(): Promise<Record<string, number>> {
  const badges: Record<string, number> = {};

  try {
    const weekLabel = defaultAboWeekLabel();
    const [proteksi, hargi] = await Promise.all([getAboProteksiSnapshot(), getAboHargiSnapshot()]);
    const belumCount =
      buildAboSnapshotComputed(proteksi, weekLabel).filter((p) => p.status === "belum").length +
      buildAboSnapshotComputed(hargi, weekLabel).filter((p) => p.status === "belum").length;
    if (belumCount > 0) badges["/dashboard/abo"] = belumCount;
  } catch {
    // A badge count failing must never break the sidebar.
  }

  try {
    const snapshot = await getFourDxSnapshot();
    const period = resolvePeriodRange(snapshot.currentPeriodLabel, snapshot.periodBoundaries, snapshot.currentYear);
    const wigs = buildFourDxWigs(snapshot.wigs, period, snapshot.realizations, snapshot.monitoring);
    const belumCount = wigs.flatMap((w) => w.lms).filter((lm) => lm.status === "belum").length;
    if (belumCount > 0) badges["/dashboard/4dx"] = belumCount;
  } catch {
    // ditto
  }

  try {
    const snapshot = await getCeSnapshot();
    if (!snapshot.error) {
      const weekLabel = defaultCeWeekLabel();
      const attention = buildCeAttentionItems(snapshot.items, weekLabel);
      const needsAttention = new Set(attention.map((a) => a.item.id)).size;
      if (needsAttention > 0) badges["/dashboard/ce"] = needsAttention;
    }
  } catch {
    // ditto
  }

  // Same critical-anomaly count already used for the homepage's "AHI"
  // insight (kategoriAhi >= 5) — the sheet's own 1-5 scale, 5 = Critical.
  try {
    const { data } = await getAhiPerformance();
    if (data) {
      const criticalCount = data.anomalies.filter((a) => a.kategoriAhi >= 5).length;
      if (criticalCount > 0) badges["/dashboard/ahi"] = criticalCount;
    }
  } catch {
    // ditto
  }

  // Equipment whose last 2-3 recorded tests have been getting worse (see
  // ahi-degradation.ts) — added on top of the critical-anomaly count above
  // in its own try/catch, so one failing to compute never drops the other.
  try {
    const reports = await getAllBayLineReportsWithHistory();
    const degradingCount = findAhiDegradationAlerts(reports).length;
    if (degradingCount > 0) badges["/dashboard/ahi"] = (badges["/dashboard/ahi"] ?? 0) + degradingCount;
  } catch {
    // ditto
  }

  // Equipment projected to reach Critical within 180 days on its current
  // trend (see ahi-trend-projection.ts) — same "add to the AHI badge" shape
  // as the degradation count above, its own independent try/catch.
  try {
    const reports = await getAllBayLineReportsWithHistory();
    const nearTermCount = buildAhiTrendProjections(reports).filter((p) => p.daysUntilCritical <= 180).length;
    if (nearTermCount > 0) badges["/dashboard/ahi"] = (badges["/dashboard/ahi"] ?? 0) + nearTermCount;
  } catch {
    // ditto
  }

  // Same "overdue" definition already used for the homepage's RENUS
  // reminder — not done, not cancelled, past its own rencana date.
  try {
    const data = await getRenusData();
    const overdueCount = data.rows.filter(
      (r) => !isRenusCancelled(r) && !isRenusDone(r) && r.rencanaDate < data.today,
    ).length;
    if (overdueCount > 0) badges["/dashboard/renus"] = overdueCount;
  } catch {
    // ditto
  }

  // Open (not yet SELESAI) relay-scanning anomali findings — the same
  // figure the Data Aset page's own "Belum Selesai" stat shows.
  try {
    const { data } = await getAssetScanning();
    if (data) {
      const openCount = data.anomali.filter((a) => (a.status ?? "").toUpperCase() !== "SELESAI").length;
      if (openCount > 0) badges["/dashboard/assets"] = openCount;
    }
  } catch {
    // ditto
  }

  // Open follow-up count across all 3 disturbance categories combined
  // (Transmisi, Trafo HV, Trafo LV) — same `followUp.open` figure already
  // shown per-category on the Gangguan page itself.
  try {
    const result = await getDisturbances();
    if (!result.error) {
      const openCount = result.transmisi.followUp.open + result.trafoHv.followUp.open + result.trafoLv.followUp.open;
      if (openCount > 0) badges["/dashboard/disturbances"] = openCount;
    }
  } catch {
    // ditto
  }

  return badges;
}
