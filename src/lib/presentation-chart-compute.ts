// Pure chart-spec builders for the Presentasi feature — deliberately NOT
// server-only, since both a server file (src/services/presentation-materi.ts)
// and the AI route (src/app/api/presentation-assistant/route.ts, which also
// runs server-side but wants the exact same pareto math rather than a
// re-derived copy) call these, and a plain pure module is the simplest thing
// both can import without pulling in any service dependency.

import type { PresentationChartSpec } from "@/types";

export function buildChartSpec(
  id: string,
  type: "bar" | "pie",
  title: string,
  data: { name: string; value: number }[],
): PresentationChartSpec {
  return { id, type, title, data: data.filter((d) => d.value > 0) };
}

/** Sorts descending and computes the running cumulative percentage — the one
 *  thing a Pareto chart needs beyond a plain bar chart. Shared so a
 *  cause-pareto built from real Gangguan data and one the AI assistant
 *  builds from its own tool-call results always compute the percentage the
 *  same way.
 *
 *  IMPORTANT: pass the FULL contributor list, not a pre-sliced "top N" —
 *  `maxPoints` does the truncation here, AFTER the cumulative % is computed
 *  against the true total. Computing the percentage against an already-cut
 *  subset would make the last shown bar read as "100%", falsely implying
 *  those few items explain the entire total when smaller contributors
 *  outside the chart make up the rest (caught by checking a real 333-event
 *  Gangguan Pareto against a 5-cause slice: it showed a dishonest 100% at
 *  Hewan/Tegakan/etc. instead of the true ~95%). */
export function buildParetoChart(
  id: string,
  title: string,
  data: { name: string; value: number }[],
  maxPoints = 8,
): PresentationChartSpec {
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, d) => sum + d.value, 0);
  let running = 0;
  const withCumulative = sorted.map((d) => {
    running += d.value;
    return { ...d, cumulative: total > 0 ? (running / total) * 100 : 0 };
  });
  const truncated = withCumulative.slice(0, maxPoints);
  return {
    id,
    type: "pareto",
    title,
    data: truncated.map(({ name, value }) => ({ name, value })),
    cumulativePercent: truncated.map((d) => d.cumulative),
  };
}
