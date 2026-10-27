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
import { isRenusOverdue } from "@/lib/renus-helpers";
import { findAhiDegradationAlerts } from "@/lib/ahi-degradation";
import { buildAhiTrendProjections } from "@/lib/ahi-trend-projection";

/** href -> count of "belum" items for that module, at today's period.
 *  Rendered as a small pill next to the matching sidebar entry so a user
 *  can tell where attention is needed without opening every module first.
 *  Reads reuse the same cache the pages themselves use (see src/lib/
 *  data-connector.ts), so this costs nothing extra beyond the first read
 *  of the day. Every module here is scored independently — one source
 *  failing or being slow must never affect, delay, or break another.
 *
 *  All 7 underlying fetches are kicked off together via Promise.allSettled
 *  (not sequential `await`s in each try/catch, which this used to be) —
 *  confirmed live this was costing multiple SECONDS to over a MINUTE on
 *  every single page load (every page mounts the sidebar), since 7-8
 *  Apps-Script-backed sources awaited one after another sum their
 *  latencies instead of overlapping them. getAllBayLineReportsWithHistory
 *  is fetched ONCE and reused for both the degradation and trend-
 *  projection checks below (used to be called twice). allSettled (not
 *  plain Promise.all) keeps the "one module failing never breaks the
 *  others" guarantee — a rejected source just has its own badge skipped. */
export async function getNavBadges(): Promise<Record<string, number>> {
  const badges: Record<string, number> = {};

  const [aboResult, fourDxResult, ceResult, ahiResult, bayLineReportsResult, renusResult, assetScanningResult, disturbancesResult] =
    await Promise.allSettled([
      Promise.all([getAboProteksiSnapshot(), getAboHargiSnapshot()]),
      getFourDxSnapshot(),
      getCeSnapshot(),
      getAhiPerformance(),
      getAllBayLineReportsWithHistory(),
      getRenusData(),
      getAssetScanning(),
      getDisturbances(),
    ]);

  if (aboResult.status === "fulfilled") {
    try {
      const weekLabel = defaultAboWeekLabel();
      const [proteksi, hargi] = aboResult.value;
      const belumCount =
        buildAboSnapshotComputed(proteksi, weekLabel).filter((p) => p.status === "belum").length +
        buildAboSnapshotComputed(hargi, weekLabel).filter((p) => p.status === "belum").length;
      if (belumCount > 0) badges["/dashboard/abo"] = belumCount;
    } catch {
      // A badge count failing must never break the sidebar.
    }
  }

  if (fourDxResult.status === "fulfilled") {
    try {
      const snapshot = fourDxResult.value;
      const period = resolvePeriodRange(snapshot.currentPeriodLabel, snapshot.periodBoundaries, snapshot.currentYear);
      const wigs = buildFourDxWigs(snapshot.wigs, period, snapshot.realizations, snapshot.monitoring);
      const belumCount = wigs.flatMap((w) => w.lms).filter((lm) => lm.status === "belum").length;
      if (belumCount > 0) badges["/dashboard/4dx"] = belumCount;
    } catch {
      // ditto
    }
  }

  if (ceResult.status === "fulfilled") {
    try {
      const snapshot = ceResult.value;
      if (!snapshot.error) {
        const weekLabel = defaultCeWeekLabel();
        const attention = buildCeAttentionItems(snapshot.items, weekLabel);
        const needsAttention = new Set(attention.map((a) => a.item.id)).size;
        if (needsAttention > 0) badges["/dashboard/ce"] = needsAttention;
      }
    } catch {
      // ditto
    }
  }

  // Same critical-anomaly count already used for the homepage's "AHI"
  // insight (kategoriAhi >= 5) — the sheet's own 1-5 scale, 5 = Critical.
  if (ahiResult.status === "fulfilled") {
    try {
      const { data } = ahiResult.value;
      if (data) {
        const criticalCount = data.anomalies.filter((a) => a.kategoriAhi >= 5).length;
        if (criticalCount > 0) badges["/dashboard/ahi"] = criticalCount;
      }
    } catch {
      // ditto
    }
  }

  // Equipment whose last 2-3 recorded tests have been getting worse (see
  // ahi-degradation.ts) and equipment projected to reach Critical within
  // 180 days on its current trend (see ahi-trend-projection.ts) — both add
  // to the same AHI badge, each in its own try so one failing doesn't
  // drop the other, but sharing the ONE already-fetched reports array.
  if (bayLineReportsResult.status === "fulfilled") {
    const reports = bayLineReportsResult.value;
    try {
      const degradingCount = findAhiDegradationAlerts(reports).length;
      if (degradingCount > 0) badges["/dashboard/ahi"] = (badges["/dashboard/ahi"] ?? 0) + degradingCount;
    } catch {
      // ditto
    }
    try {
      const nearTermCount = buildAhiTrendProjections(reports).filter((p) => p.daysUntilCritical <= 180).length;
      if (nearTermCount > 0) badges["/dashboard/ahi"] = (badges["/dashboard/ahi"] ?? 0) + nearTermCount;
    } catch {
      // ditto
    }
  }

  // Same shared isRenusOverdue() every other RENUS overdue count in this
  // app now uses (src/lib/renus-helpers.ts) — not done, not cancelled,
  // past its own rencana date.
  if (renusResult.status === "fulfilled") {
    try {
      const data = renusResult.value;
      const overdueCount = data.rows.filter((r) => isRenusOverdue(r, data.today)).length;
      if (overdueCount > 0) badges["/dashboard/renus"] = overdueCount;
    } catch {
      // ditto
    }
  }

  // Open (not yet SELESAI) relay-scanning anomali findings — the same
  // figure the Data Aset page's own "Belum Selesai" stat shows.
  if (assetScanningResult.status === "fulfilled") {
    try {
      const { data } = assetScanningResult.value;
      if (data) {
        const openCount = data.anomali.filter((a) => (a.status ?? "").toUpperCase() !== "SELESAI").length;
        if (openCount > 0) badges["/dashboard/assets"] = openCount;
      }
    } catch {
      // ditto
    }
  }

  // Open follow-up count across all 3 disturbance categories combined
  // (Transmisi, Trafo HV, Trafo LV) — same `followUp.open` figure already
  // shown per-category on the Gangguan page itself.
  if (disturbancesResult.status === "fulfilled") {
    try {
      const result = disturbancesResult.value;
      if (!result.error) {
        const openCount = result.transmisi.followUp.open + result.trafoHv.followUp.open + result.trafoLv.followUp.open;
        if (openCount > 0) badges["/dashboard/disturbances"] = openCount;
      }
    } catch {
      // ditto
    }
  }

  return badges;
}
