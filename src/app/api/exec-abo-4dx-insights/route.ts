import { NextResponse } from "next/server";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { buildAboSnapshotComputed, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { buildManagementAttention, buildTopIssues } from "@/lib/executive-insights";

// Split out of the homepage's own SSR request (src/app/dashboard/page.tsx)
// deliberately — ABO (2 files) + 4DX (9 sheets) pushed the homepage's total
// data-fetch time over Vercel's serverless function duration limit,
// intermittently rendering a hard server-error page for every visitor
// instead of just this one card being late. Fetched client-side after the
// rest of the page has already rendered (see
// src/components/dashboard/abo-four-dx-insights.tsx) — the same fix
// pattern already used for the sidebar's nav badges.
export const maxDuration = 60;

export async function GET() {
  const [aboProteksiSnapshot, aboHargiSnapshot, fourDxSnapshot] = await Promise.all([
    getAboProteksiSnapshot(),
    getAboHargiSnapshot(),
    getFourDxSnapshot(),
  ]);

  const aboWeekLabel = defaultAboWeekLabel();
  const aboProteksiPrograms = aboProteksiSnapshot.error ? [] : buildAboSnapshotComputed(aboProteksiSnapshot, aboWeekLabel);
  const aboHargiPrograms = aboHargiSnapshot.error ? [] : buildAboSnapshotComputed(aboHargiSnapshot, aboWeekLabel);
  const abo =
    aboProteksiPrograms.length > 0 || aboHargiPrograms.length > 0
      ? { proteksiPrograms: aboProteksiPrograms, hargiPrograms: aboHargiPrograms, weekLabel: aboWeekLabel }
      : null;

  const fourDxPeriod = fourDxSnapshot.error
    ? null
    : resolvePeriodRange(fourDxSnapshot.currentPeriodLabel, fourDxSnapshot.periodBoundaries, fourDxSnapshot.currentYear);
  const fourDxWigs = fourDxPeriod
    ? buildFourDxWigs(fourDxSnapshot.wigs, fourDxPeriod, fourDxSnapshot.realizations, fourDxSnapshot.monitoring)
    : null;

  const managementAttention = buildManagementAttention({
    upt: null,
    transmisi: null,
    trafoHv: null,
    trafoLv: null,
    ahi: null,
    bayLineReports: null,
    renusReminders: null,
    abo,
    fourDx: fourDxWigs,
  });
  const topIssues = buildTopIssues({ upt: null, transmisi: null, ahi: null, abo, fourDx: fourDxWigs });

  return NextResponse.json({ managementAttention, topIssues });
}
