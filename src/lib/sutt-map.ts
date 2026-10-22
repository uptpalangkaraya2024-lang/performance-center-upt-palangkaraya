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
import type { SuttRuas, SuttTower } from "@/types";

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
}

export interface MapGiMarker {
  name: string;
  lat: number;
  lon: number;
  kind: "main" | "incomer";
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

export function buildSuttNetworkMapData(allRuas: SuttRuas[]): SuttNetworkMapData {
  const ruasLines: MapRuasLine[] = [];
  const giMap = new Map<string, MapGiMarker>();

  function addGiTouch(name: string, lat: number, lon: number, kind: "main" | "incomer", ruas: string, end: string, tower: string) {
    let g = giMap.get(name);
    if (!g) {
      g = { name, lat, lon, kind, touches: [] };
      giMap.set(name, g);
    }
    if (kind === "incomer") g.kind = "incomer";
    g.touches.push({ ruas, end, tower });
  }

  for (const r of allRuas) {
    const isIncomer = r.section.toUpperCase().startsWith("INCOMER ");
    const path: [number, number][] = r.towers
      .filter((t): t is SuttTower & { lat: number; lon: number } => t.lat !== null && t.lon !== null)
      .map((t) => [t.lat, t.lon]);
    if (path.length === 0) continue;

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
        addGiTouch(r.originLabel, first.lat, first.lon, "main", r.section, "awal", first.towerNo);
      }
      if (last && last.lat !== null && last.lon !== null) {
        addGiTouch(r.farEndLabel, last.lat, last.lon, "main", r.section, "akhir", last.towerNo);
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
      addGiTouch(inc.gi, giEnd.lat, giEnd.lon, "incomer", inc.incomerSection, "GI baru", giEnd.towerNo);
    }

    for (const t of tapCoords) {
      splices.push({ incomerGi: inc.gi, incomerSection: inc.incomerSection, ruasSection: t.ruasSection, towerNo: t.towerNo, lat: t.lat, lon: t.lon });
    }
  }

  return { ruas: ruasLines, gis: [...giMap.values()], splices };
}
