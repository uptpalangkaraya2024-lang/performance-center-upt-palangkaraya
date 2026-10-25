// Outage impact simulator ("Simulator Dampak Padam") — for each ruas, asks
// a single well-defined graph question: if this ruas is taken out, does any
// GI lose its only path to the rest of the network? This is answered with
// plain connectivity analysis (remove the edge, compare reachable sets),
// not a power-flow/load simulation — this app has no breaker state, bus
// configuration, or source/injection data to simulate real power flow, so
// it never claims to. What it DOES answer reliably: "is this ruas a single
// point of failure for some GI, or is there a redundant path." That's
// exactly the pre-check a planner wants before scheduling a padam in RENUS.
import type { SuttRuas } from "@/types";

export interface OutageImpactResult {
  section: string;
  /** True when removing this ruas disconnects part of the network — i.e.
   *  this ruas is this/these GI's only path to everything else. */
  isBridge: boolean;
  /** GIs that lose connectivity to the rest of the network if this ruas is
   *  taken out. Empty when a redundant path exists (not a bridge). */
  isolatedGis: string[];
}

interface Edge {
  section: string;
  a: string;
  b: string;
}

function buildEdges(ruasList: SuttRuas[]): Edge[] {
  return ruasList
    .filter((r) => r.originLabel && r.farEndLabel && r.originLabel.toUpperCase() !== r.farEndLabel.toUpperCase())
    .map((r) => ({ section: r.section, a: r.originLabel.toUpperCase(), b: r.farEndLabel.toUpperCase() }));
}

/** BFS reachable set from `start`, optionally excluding one ruas's own edge
 *  (by section name) — excluding by section rather than by GI pair, so two
 *  genuinely parallel/redundant ruas between the same two GIs are never
 *  both removed at once; only the one actually being simulated is. */
function reachableFrom(start: string, edges: Edge[], excludeSection: string | null): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (e.section === excludeSection) continue;
    if (!adjacency.has(e.a)) adjacency.set(e.a, []);
    if (!adjacency.has(e.b)) adjacency.set(e.b, []);
    adjacency.get(e.a)!.push(e.b);
    adjacency.get(e.b)!.push(e.a);
  }
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/** One result per ruas — the network graph (nodes = GI, edges = ruas) is
 *  rebuilt once and reused for every ruas's own before/after comparison,
 *  since the whole list is small enough (tens of GIs/ruas) that even a
 *  O(ruas x (V+E)) brute-force pass is effectively instant. */
export function buildOutageImpact(ruasList: SuttRuas[]): OutageImpactResult[] {
  const edges = buildEdges(ruasList);

  return ruasList.map((ruas) => {
    const origin = ruas.originLabel.toUpperCase();
    const farEnd = ruas.farEndLabel.toUpperCase();
    if (!origin || !farEnd || origin === farEnd) {
      return { section: ruas.section, isBridge: false, isolatedGis: [] };
    }
    const before = reachableFrom(origin, edges, null);
    const after = reachableFrom(origin, edges, ruas.section);
    const isolatedGis = [...before].filter((gi) => !after.has(gi)).sort();
    return { section: ruas.section, isBridge: isolatedGis.length > 0, isolatedGis };
  });
}
