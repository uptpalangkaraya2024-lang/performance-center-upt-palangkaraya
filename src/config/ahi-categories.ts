// Which AHI categories exist and which of the 4 main KPIs they roll up into —
// verified against the live "HI UPT" sheet structure (Phase 3B inspection),
// not assumed from the brief's example list. `displayName` must match the
// category's label cell in the sheet exactly (see src/services/ahi-performance.ts).
import type { AhiSectionKey } from "@/types";

export interface AhiCategoryDef {
  key: string;
  displayName: string;
  section: AhiSectionKey;
}

export const AHI_CATEGORY_DEFS: AhiCategoryDef[] = [
  // AHI MTU
  { key: "PMS", displayName: "AHI PMS", section: "mtu" },
  { key: "CT", displayName: "AHI CT", section: "mtu" },
  { key: "LA", displayName: "AHI LA", section: "mtu" },
  { key: "PMT", displayName: "AHI PMT", section: "mtu" },
  { key: "PT", displayName: "AHI PT", section: "mtu" },
  { key: "NGR", displayName: "AHI NGR", section: "mtu" },
  // AHI CATU DAYA
  { key: "BATERE", displayName: "AHI BATERE", section: "catu-daya" },
  { key: "RECTIFIER", displayName: "AHI RECTIFIER", section: "catu-daya" },
  { key: "KAPASITOR", displayName: "AHI KAPASITOR", section: "catu-daya" },
  // AHI TRAFO and AHI REAKTOR are standalone — not composed of sub-categories.
  { key: "TRAFO", displayName: "AHI TRAFO", section: "trafo" },
  { key: "REAKTOR", displayName: "AHI REAKTOR", section: "reaktor" },
];

export const AHI_SECTION_META: Record<AhiSectionKey, { displayName: string }> = {
  mtu: { displayName: "AHI MTU" },
  "catu-daya": { displayName: "AHI CATU DAYA" },
  trafo: { displayName: "AHI TRAFO" },
  reaktor: { displayName: "AHI REAKTOR" },
};
