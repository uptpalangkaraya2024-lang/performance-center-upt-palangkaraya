"use client";

// Interactive SUTT network map/SLD — renders every ruas (color-coded by
// ULTG, incomer ruas dashed amber), one marker per unique GI (deduped
// across every ruas that touches it, showing where tower numbering starts/
// ends there), and one marker per known incomer splice point (with its
// tower number always visible, no click needed). Leaflet only runs in the
// browser (it touches `window`/`document` at module load), so this
// component is loaded via next/dynamic with ssr:false from its page — see
// src/app/dashboard/disturbances/peta-sutt/page.tsx.
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./sutt-network-map.css";

import type { SuttNetworkMapData } from "@/lib/sutt-map";

const UNIT_COLOR: Record<string, string> = {
  "ULTG PALANGKARAYA": "#1d3461",
  "ULTG PANGKALAN BUN": "#0e7c7b",
  "ULTG MUARA TEWEH": "#7b2d43",
};
const AMBER = "#c2690a";
const UNITS = Object.keys(UNIT_COLOR);

function fmtKm(n: number): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
function fmtInt(n: number): string {
  return n.toLocaleString("id-ID");
}

export function SuttNetworkMap({ data }: { data: SuttNetworkMapData }) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Record<string, LayerGroup>>({});
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { gi: true, splice: true };
    for (const u of UNITS) initial[u] = true;
    return initial;
  });

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const leaflet = await import("leaflet");
      const L = leaflet.default ?? leaflet;
      if (cancelled || !mapElRef.current) return;

      const map = L.map(mapElRef.current, { zoomControl: true }).setView([-1.9, 113.3], 7);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const unitLayers: Record<string, LayerGroup> = {};
      for (const u of UNITS) unitLayers[u] = L.layerGroup().addTo(map);
      const giLayer = L.layerGroup().addTo(map);
      const spliceLayer = L.layerGroup().addTo(map);
      layersRef.current = { ...unitLayers, gi: giLayer, splice: spliceLayer };

      const bounds: [number, number][] = [];
      for (const r of data.ruas) {
        const color = r.incomer ? AMBER : (UNIT_COLOR[r.unit] ?? "#555555");
        const line = L.polyline(r.path, {
          color,
          weight: r.incomer ? 3 : 4,
          opacity: 0.85,
          dashArray: r.incomer ? "7,6" : undefined,
        });
        line.bindPopup(
          `<b>${r.section}</b><br>${r.unit}${r.incomer ? " &middot; ruas incomer" : ""}<br>` +
            `${fmtKm(r.lengthKm)} km &middot; ${fmtInt(r.towerCount)} tower<br>${r.originLabel} &rarr; ${r.farEndLabel}`,
        );
        line.addTo(unitLayers[r.unit] ?? giLayer);
        for (const p of r.path) bounds.push(p);
      }

      for (const g of data.gis) {
        const icon = L.divIcon({
          className: "sutt-gi-icon-wrap",
          html: `<div class="sutt-gi-dot ${g.kind}"></div><div class="sutt-gi-label">${g.name}</div>`,
          iconSize: [13, 13],
          iconAnchor: [6, 6],
        });
        const touchesHtml = g.touches
          .map((t) => `<span class="popup-touch">${t.ruas} &mdash; ${t.end} (tower ${t.tower})</span>`)
          .join("");
        L.marker([g.lat, g.lon], { icon })
          .bindPopup(`<b>GI ${g.name}</b>${g.kind === "incomer" ? " &middot; GI incomer" : ""}${touchesHtml}`)
          .addTo(giLayer);
      }

      for (const s of data.splices) {
        const icon = L.divIcon({
          className: "sutt-splice-icon-wrap",
          html: `<div class="sutt-splice-diamond"></div><div class="sutt-splice-label">T.${s.towerNo}</div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        L.marker([s.lat, s.lon], { icon })
          .bindPopup(
            `<b>Titik potong &mdash; INCOMER ${s.incomerGi}</b><br>Masuk ke ruas <b>${s.ruasSection}</b><br>di tower ${s.towerNo}`,
          )
          .addTo(spliceLayer);
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // data is loaded once server-side and handed down as a stable prop —
    // the map is built once per mount, not rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const map = mapRef.current;
      const layer = layersRef.current[key];
      if (map && layer) {
        if (next[key]) map.addLayer(layer);
        else map.removeLayer(layer);
      }
      return next;
    });
  }

  return (
    <div className="sutt-map-root overflow-hidden rounded-xl border bg-card">
      <div ref={mapElRef} className="sutt-map-canvas" />
      {!ready ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 text-sm text-muted-foreground">
          Memuat peta...
        </div>
      ) : null}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1 rounded-lg border bg-card/95 p-2.5 text-xs shadow-lg backdrop-blur">
        <p className="mb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Layer</p>
        {UNITS.map((u) => (
          <label key={u} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={visible[u]} onChange={() => toggle(u)} className="accent-[color:var(--primary)]" />
            <span className="size-2.5 rounded-full" style={{ background: UNIT_COLOR[u] }} />
            {u.replace("ULTG ", "")}
          </label>
        ))}
        <div className="my-1 border-t" />
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={visible.gi} onChange={() => toggle("gi")} className="accent-[color:var(--primary)]" />
          <span className="size-2.5 rounded-full" style={{ background: "#1d3461" }} />
          Titik GI
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={visible.splice} onChange={() => toggle("splice")} className="accent-[color:var(--primary)]" />
          <span className="size-2.5 rounded-full" style={{ background: AMBER }} />
          Titik potong incomer
        </label>
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] max-w-[230px] rounded-lg border bg-card/95 p-2.5 text-xs shadow-lg backdrop-blur">
        <p className="mb-1.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Legenda</p>
        <div className="flex flex-col gap-1">
          {UNITS.map((u) => (
            <div key={u} className="flex items-center gap-1.5">
              <span className="h-0 w-5 border-t-[3px]" style={{ borderColor: UNIT_COLOR[u] }} />
              Ruas &mdash; {u.replace("ULTG ", "")}
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="h-0 w-5 border-t-[3px] border-dashed" style={{ borderColor: AMBER }} />
            Ruas Incomer
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-white" style={{ background: "#1d3461" }} />
            GI (awal/akhir tower)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-white" style={{ background: AMBER }} />
            GI Incomer
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rotate-45 border-2 border-white" style={{ background: AMBER }} />
            Titik potong (tap incomer)
          </div>
        </div>
      </div>
    </div>
  );
}
