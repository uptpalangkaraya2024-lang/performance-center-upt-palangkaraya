import "server-only";

import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAhiPerformance } from "@/services/ahi-performance";
import { buildAboSnapshotComputed, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { buildCeAttentionItems, defaultCeWeekLabel } from "@/lib/ce-compute";
import { listSyncStatus } from "@/lib/sync-status";

export interface AppNotification {
  id: string;
  text: string;
  detail: string;
  href: string;
  severity: "critical" | "warning";
}

// Beyond this age, a source's last successful sync is surfaced as "belum
// diperbarui" rather than assumed still-fresh — comfortably above the app's
// own DATA_CACHE_TTL_MINUTES (20-30 min, see src/config/cache.ts) so a
// normal stale-while-revalidate refresh cycle never falsely triggers this.
const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 jam

function formatRelativeTime(date: Date): string {
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "baru saja";
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} hari lalu`;
}

/** Real notifications built from the same live data every module already
 *  reads (ABO/4DX/CE "belum" counts mirror src/lib/nav-badges.ts; AHI reads
 *  its own Critical-classified anomalies; sync health reads the same
 *  registry the Data & Sync page renders) — replaces the 3 hardcoded
 *  example notifications that used to sit in the header's bell dropdown
 *  unconditionally, regardless of actual system state. Every source is
 *  wrapped in its own try/catch: one module failing to compute its
 *  notification must never take down the whole bell, same principle as
 *  getNavBadges(). */
export async function getNotifications(): Promise<AppNotification[]> {
  const notifications: AppNotification[] = [];

  try {
    const weekLabel = defaultAboWeekLabel();
    const [proteksi, hargi] = await Promise.all([getAboProteksiSnapshot(), getAboHargiSnapshot()]);
    const belumCount =
      buildAboSnapshotComputed(proteksi, weekLabel).filter((p) => p.status === "belum").length +
      buildAboSnapshotComputed(hargi, weekLabel).filter((p) => p.status === "belum").length;
    if (belumCount > 0) {
      notifications.push({
        id: "abo-belum",
        text: `${belumCount} program ABO belum tercapai`,
        detail: "Periode berjalan",
        href: "/dashboard/abo",
        severity: "warning",
      });
    }
  } catch {
    // Satu sumber gagal tidak boleh menjatuhkan notifikasi lainnya.
  }

  try {
    const snapshot = await getFourDxSnapshot();
    const period = resolvePeriodRange(snapshot.currentPeriodLabel, snapshot.periodBoundaries, snapshot.currentYear);
    const wigs = buildFourDxWigs(snapshot.wigs, period, snapshot.realizations, snapshot.monitoring);
    const belumCount = wigs.flatMap((w) => w.lms).filter((lm) => lm.status === "belum").length;
    if (belumCount > 0) {
      notifications.push({
        id: "4dx-belum",
        text: `${belumCount} Lead Measure 4DX belum tercapai`,
        detail: "Periode berjalan",
        href: "/dashboard/4dx",
        severity: "warning",
      });
    }
  } catch {
    // ditto
  }

  try {
    const snapshot = await getCeSnapshot();
    if (!snapshot.error) {
      const weekLabel = defaultCeWeekLabel();
      const attention = buildCeAttentionItems(snapshot.items, weekLabel);
      const needsAttention = new Set(attention.map((a) => a.item.id)).size;
      if (needsAttention > 0) {
        notifications.push({
          id: "ce-attention",
          text: `${needsAttention} temuan CE perlu perhatian`,
          detail: "Kritis, alert, atau terlambat",
          href: "/dashboard/ce",
          severity: "warning",
        });
      }
    }
  } catch {
    // ditto
  }

  try {
    const ahi = await getAhiPerformance();
    if (ahi.data) {
      // kategoriAhi: 4 = Poor, 5 = Critical (see AhiAnomalyRecord).
      const criticalCount = ahi.data.anomalies.filter((a) => a.kategoriAhi === 5).length;
      if (criticalCount > 0) {
        notifications.push({
          id: "ahi-critical",
          text: `${criticalCount} temuan AHI kategori Critical`,
          detail: "Rekap anomali AM:BA",
          href: "/dashboard/ahi#ahi-anomaly",
          severity: "critical",
        });
      }
    }
  } catch {
    // ditto
  }

  try {
    const statusByModule = new Map<string, { lastSync: Date | null; hasError: boolean; errorMessage: string | null }>();
    for (const entry of listSyncStatus()) {
      // A missing spreadsheet file means this module was never configured
      // yet ("Coming Soon"), not a real sync failure — same distinction the
      // Data & Sync page itself already makes for exactly this reason.
      const notYetConfigured = entry.status === "error" && (entry.error ?? "").includes("tidak ditemukan");
      if (notYetConfigured) continue;
      const existing = statusByModule.get(entry.module) ?? { lastSync: null, hasError: false, errorMessage: null };
      if (entry.status === "error") {
        existing.hasError = true;
        existing.errorMessage = entry.error;
      }
      if (entry.lastSync && (!existing.lastSync || entry.lastSync > existing.lastSync)) {
        existing.lastSync = entry.lastSync;
      }
      statusByModule.set(entry.module, existing);
    }

    for (const [module, info] of statusByModule) {
      if (info.hasError) {
        notifications.push({
          id: `sync-error-${module}`,
          text: `Sinkronisasi ${module} gagal`,
          detail: info.errorMessage ?? "Lihat halaman Data & Sync untuk detail.",
          href: "/dashboard/data-sync",
          severity: "critical",
        });
      } else if (info.lastSync && Date.now() - info.lastSync.getTime() > STALE_THRESHOLD_MS) {
        notifications.push({
          id: `sync-stale-${module}`,
          text: `Data ${module} belum diperbarui`,
          detail: formatRelativeTime(info.lastSync),
          href: "/dashboard/data-sync",
          severity: "warning",
        });
      }
    }
  } catch {
    // ditto
  }

  const severityRank: Record<AppNotification["severity"], number> = { critical: 0, warning: 1 };
  notifications.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return notifications.slice(0, 6);
}
