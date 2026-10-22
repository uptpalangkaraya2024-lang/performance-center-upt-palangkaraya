// Pure data-shaping for the SUTT network map/SLD (Cari Titik Gangguan's
// "Peta/SLD SUTT" page) — takes the already-loaded SuttRuas[] (same data
// the fault locator itself uses, see sutt-fault-locator.ts) and
// INCOMER_TAPS, and produces plain, JSON-serializable shapes a Leaflet map
// component can render directly: one line per ruas, one marker per unique
// GI (deduped across every ruas that touches it), one marker per incomer
// splice point. No "server-only" — this runs once server-side (the page
// component) and the result is handed to the client map component as
// props, same "load once, derive many" shape as every other compute lib
// in this app.
import { INCOMER_TAPS } from "@/lib/sutt-fault-locator";
import type { GiRecord, SuttRuas, SuttTower } from "@/types";

export interface MapRuasLine {
  section: string;
  unit: string;
  incomer: boolean;
  originLabel: string;
  farEndLabel: string;
  lengthKm: number;
  towerCount: number;
  path: [number, number][];
}

export interface MapGiTouch {
  ruas: string;
  end: string;
  tower: string;
  /** The GI at the OTHER end of this same ruas — e.g. at GI Sampit, the
   *  touch for "SAMPIT - BAGENDANG" carries otherEnd "BAGENDANG", so the
   *  map can label the tag "awal, menuju Bagendang" instead of a bare
   *  tower number with no indication of which direction/ruas it's on. */
  otherEnd: string;
}

export interface MapGiMarker {
  name: string;
  lat: number;
  lon: number;
  /** "unregistered" wins over "incomer"/"main" — a GI name that isn't in
   *  DATA GARDU INDUK's own 20-row list isn't confirmed as UPT
   *  Palangkaraya's own, regardless of which ruas happens to touch it
   *  (see buildSuttNetworkMapData's own comment on `giRegistry`). */
  kind: "main" | "incomer" | "unregistered";
  touches: MapGiTouch[];
}

export interface MapSplicePoint {
  incomerGi: string;
  incomerSection: string;
  ruasSection: string;
  towerNo: string;
  lat: number;
  lon: number;
}

export interface SuttNetworkMapData {
  ruas: MapRuasLine[];
  gis: MapGiMarker[];
  splices: MapSplicePoint[];
}

/** Plain Pythagorean distance in degrees — only used to rank which of an
 *  incomer's two ends sits physically next to a given tap point, never as
 *  a real-world distance. Small, self-contained copy of the same idea in
 *  sutt-fault-locator.ts's own roughDegDistance, kept independent per this
 *  app's own precedent of each compute module owning its small constants
 *  (see ce-compute.ts/four-dx-compute.ts's own month-label lists). */
function roughDegDistance(a: { lat: number | null; lon: number | null }, b: { lat: number | null; lon: number | null }): number {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return Infinity;
  const dLat = a.lat - b.lat;
  const dLon = a.lon - b.lon;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function findRuas(allRuas: SuttRuas[], section: string): SuttRuas | null {
  return allRuas.find((r) => r.section === section) ?? null;
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Drops a point whose own LAT,LONG is a clear data-entry error — e.g.
 *  "MUARA TEWEH - PURUK CAHU"'s own towers 01R-08R are recorded ~40km
 *  from both of their immediate neighbors (confirmed: every other tower
 *  around them sits a normal ~0.3km apart), which draws a zigzag crossing
 *  the whole map instead of the real, smooth route. Compares each point
 *  against the median position of the last few points already KEPT
 *  (not the raw array's immediate neighbors, which can themselves be bad
 *  when outliers run in an alternating pattern like this ruas's own) —
 *  the threshold is generous relative to this ruas's own typical spacing,
 *  so it never touches a normal path (every other ruas checked this
 *  session has a smooth, sensible route) and only catches a genuine,
 *  order-of-magnitude jump. Map-rendering only — doesn't touch the
 *  tower's own distanceKm (self-computed from SPAN (M), unrelated to
 *  LAT,LONG), so the fault locator is entirely unaffected. */
function filterPathOutliers(points: [number, number][]): [number, number][] {
  if (points.length < 5) return points;
  const consecutive: number[] = [];
  for (let i = 1; i < points.length; i++) consecutive.push(haversineKm(points[i - 1], points[i]));
  const typical = median(consecutive) || 0.3;
  const threshold = Math.max(typical * 6, 2);

  const kept: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const refWindow = kept.slice(-3);
    const avgDist = refWindow.reduce((sum, p) => sum + haversineKm(p, cur), 0) / refWindow.length;
    if (avgDist > threshold) continue;
    kept.push(cur);
  }
  if (kept[kept.length - 1] !== points[points.length - 1]) kept.push(points[points.length - 1]);
  return kept;
}

/** `giRegistry` is DATA GARDU INDUK's own list — the authoritative source
 *  for both a GI's real coordinate (its own substation-yard LATITUDE/
 *  LONGITUDE, not inferred from whichever tower happens to be nearest)
 *  and for which GI names are actually UPT Palangkaraya's own: a name
 *  that only ever shows up as a ruas's own GARDU_INDUK/NAMA_SECTION
 *  endpoint in DATA SUTT, but never here, isn't confirmed as a UPT
 *  Palangkaraya GI (could be a real substation operated by a different
 *  UPT, or a short tap/sectionalizing point that was never actually
 *  registered as its own GI — this map can't tell the two apart, so both
 *  are shown the same way: present for context, excluded from "Total
 *  GI"). Confirmed live: all 20 of UPT Palangkaraya's real GIs are here,
 *  including every incomer's own new substation (SKS, SUDAN, PARENGGEAN,
 *  SEBANGAU, PULANG PISAU, PANGKALAN BANTENG, NANGABULIK) — only TANJUNG,
 *  KENDAWANGAN and SELAT (a 12-tower, ~4km dead-end stub off MINTIN) are
 *  absent. */
export function buildSuttNetworkMapData(allRuas: SuttRuas[], giRegistry: GiRecord[]): SuttNetworkMapData {
  const ruasLines: MapRuasLine[] = [];
  const giMap = new Map<string, MapGiMarker>();
  const registryByName = new Map(giRegistry.map((g) => [g.name.toUpperCase(), g]));

  function addGiTouch(
    name: string,
    lat: number,
    lon: number,
    kind: "main" | "incomer",
    ruas: string,
    end: string,
    tower: string,
    otherEnd: string,
  ) {
    const registered = registryByName.get(name.toUpperCase());
    const effectiveKind: MapGiMarker["kind"] = registered ? kind : "unregistered";
    let g = giMap.get(name);
    if (!g) {
      g = { name, lat: registered?.lat ?? lat, lon: registered?.lon ?? lon, kind: effectiveKind, touches: [] };
      giMap.set(name, g);
    }
    if (g.kind !== "unregistered" && effectiveKind === "incomer") g.kind = "incomer";
    g.touches.push({ ruas, end, tower, otherEnd });
  }

  for (const r of allRuas) {
    const isIncomer = r.section.toUpperCase().startsWith("INCOMER ");
    const rawPath: [number, number][] = r.towers
      .filter((t): t is SuttTower & { lat: number; lon: number } => t.lat !== null && t.lon !== null)
      .map((t) => [t.lat, t.lon]);
    if (rawPath.length === 0) continue;
    const path = filterPathOutliers(rawPath);

    ruasLines.push({
      section: r.section,
      unit: r.unit,
      incomer: isIncomer,
      originLabel: r.originLabel,
      farEndLabel: r.farEndLabel,
      lengthKm: r.lengthKm,
      towerCount: r.towers.length,
      path,
    });

    if (!isIncomer) {
      const first = r.towers.find((t) => t.lat !== null && t.lon !== null);
      const last = [...r.towers].reverse().find((t) => t.lat !== null && t.lon !== null);
      if (first && first.lat !== null && first.lon !== null) {
        addGiTouch(r.originLabel, first.lat, first.lon, "main", r.section, "awal", first.towerNo, r.farEndLabel);
      }
      if (last && last.lat !== null && last.lon !== null) {
        addGiTouch(r.farEndLabel, last.lat, last.lon, "main", r.section, "akhir", last.towerNo, r.originLabel);
      }
    }
  }

  const splices: MapSplicePoint[] = [];
  for (const inc of INCOMER_TAPS) {
    const incomerRuas = findRuas(allRuas, inc.incomerSection);
    const coordTowers = incomerRuas?.towers.filter((t) => t.lat !== null && t.lon !== null) ?? [];
    if (coordTowers.length === 0) continue;
    const first = coordTowers[0];
    const last = coordTowers[coordTowers.length - 1];

    const tapCoords = inc.taps
      .map((tap) => {
        const hostRuas = findRuas(allRuas, tap.ruasSection);
        const tower = hostRuas?.towers.find((t) => t.towerNo === tap.towerNo);
        return tower && tower.lat !== null && tower.lon !== null ? { ...tap, lat: tower.lat, lon: tower.lon } : null;
      })
      .filter((t): t is { ruasSection: string; towerNo: string; lat: number; lon: number } => t !== null);
    if (tapCoords.length === 0) continue;

    // Which end of the incomer sits physically farthest from every tap —
    // that's the real new-GI location, same rule as
    // locateFaultWithIncomerCrossing's own geometric check.
    let giEnd = first;
    let bestMinDist = -1;
    for (const end of [first, last]) {
      let minD = Infinity;
      for (const t of tapCoords) minD = Math.min(minD, roughDegDistance(end, t));
      if (minD > bestMinDist) {
        bestMinDist = minD;
        giEnd = end;
      }
    }
    if (giEnd.lat !== null && giEnd.lon !== null) {
      addGiTouch(inc.gi, giEnd.lat, giEnd.lon, "incomer", inc.incomerSection, "GI baru", giEnd.towerNo, "titik sambung");
    }

    for (const t of tapCoords) {
      splices.push({ incomerGi: inc.gi, incomerSection: inc.incomerSection, ruasSection: t.ruasSection, towerNo: t.towerNo, lat: t.lat, lon: t.lon });
    }
  }

  return { ruas: ruasLines, gis: [...giMap.values()], splices };
}
