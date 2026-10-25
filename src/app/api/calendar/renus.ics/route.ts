import { NextResponse } from "next/server";
import { getRenusData } from "@/services/renus";
import { buildRenusIcs } from "@/lib/renus-ics";

// Public, unauthenticated by design — same posture as every other API
// route in this app (no src/middleware.ts, no auth package in
// package.json) — a calendar subscription URL has to be fetchable by the
// subscriber's own calendar app on its own refresh schedule, not just a
// signed-in browser tab.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await getRenusData();
  const ics = buildRenusIcs(data.error ? [] : data.rows);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="renus-upt-palangkaraya.ics"',
      // 30 min — generous enough that a subscribing calendar app's own
      // periodic refresh (typically hourly+) never gets a stale 304-style
      // short-circuit, short enough that a same-day RENUS edit shows up
      // the same day without needing a cache-bust.
      "Cache-Control": "public, max-age=1800",
    },
  });
}
