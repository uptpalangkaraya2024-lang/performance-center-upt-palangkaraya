import "server-only";

import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { buildAboSnapshotComputed, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { buildCeAttentionItems, defaultCeWeekLabel } from "@/lib/ce-compute";

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

  return badges;
}
