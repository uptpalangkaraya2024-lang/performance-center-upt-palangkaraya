import "server-only";

// Builds the "Materi Presentasi" catalog for /dashboard/presentasi — one
// PresentationSlide (or a couple) per dashboard module, computed from the
// exact same service + compute functions each module's own page already
// uses (never a re-derived number), mirroring the "every fact comes from a
// real call" discipline already established for the AI Assistant's own
// tools (src/lib/ai-assistant-tools.ts). Deliberately NOT reusing that
// file's tool functions directly — those return LLM-sized raw JSON for a
// model to read, this returns human-facing bullets/tables for a slide.
//
// Fetched once per page load, all in parallel — same pattern as the
// homepage's own multi-module Promise.all.

import { getUptPerformance } from "@/services/upt-performance";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getDisturbances } from "@/services/disturbances";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getRenusData } from "@/services/renus";
import { getAssetScanning } from "@/services/asset-scanning";
import { buildAboSnapshotComputed, collectAboAttentionItems, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildCeSummary, buildCeAttentionItems, defaultCeWeekLabel } from "@/lib/ce-compute";
import { buildFourDxAchievementSummaries, resolvePeriodRange } from "@/lib/four-dx-compute";
import type {
  AboProgramComputed,
  DisturbanceCategoryResult,
  PresentationMateriCatalog,
  PresentationMateriOption,
  PresentationSlide,
  StatusLevel,
} from "@/types";

const STATUS_LABEL: Record<StatusLevel, string> = {
  good: "Tercapai",
  warning: "Warning",
  critical: "Critical",
  none: "Tidak Ada Data",
};

function pct(v: number | null, digits = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function num(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : String(v);
}

let slideSeq = 0;
function slide(partial: Omit<PresentationSlide, "id">): PresentationSlide {
  slideSeq += 1;
  return { id: `materi-${slideSeq}`, ...partial };
}

// --- Per-module slide builders ----------------------------------------------

async function buildKinerjaUptMateri(): Promise<PresentationMateriOption> {
  const result = await getUptPerformance();
  const slides: PresentationSlide[] = [];
  if (result.data) {
    const d = result.data;
    const bermasalah = d.kpis.filter((k) => k.status !== "good").slice(0, 6);
    slides.push(
      slide({
        title: "Kinerja UPT Palangkaraya",
        subtitle: `Periode ${d.periodLabel}`,
        stats: [
          { value: num(d.overallWeightedScore), label: "Skor Bobot Keseluruhan" },
          { value: num(d.overall.achieved), label: "KPI Tercapai" },
          { value: num(d.overall.warning + d.overall.critical), label: "KPI Belum Tercapai" },
          { value: num(d.overall.total), label: "Total KPI Kontrak" },
        ],
        bullets:
          bermasalah.length > 0
            ? bermasalah.map((k) => `${k.abbreviation} (${k.displayName}): realisasi ${k.actualLabel} vs target ${k.targetLabel} — ${STATUS_LABEL[k.status]}`)
            : ["Seluruh KPI kontrak UPT tercapai pada periode ini."],
        sourceNote: `Sumber: Kinerja UPT — periode ${d.periodLabel}`,
      }),
    );
  }
  return {
    id: "kinerja-upt",
    label: "Kinerja UPT (19 KPI Kontrak)",
    description: "Skor bobot keseluruhan dan KPI yang belum tercapai periode berjalan.",
    group: "Kinerja",
    kind: "data",
    slides,
  };
}

async function buildKinerjaUltgMateri(): Promise<PresentationMateriOption> {
  const result = await getUltgPerformance();
  const slides: PresentationSlide[] = [];
  if (result.data && result.data.length > 0) {
    const rows = result.data;
    slides.push(
      slide({
        title: "Kinerja ULTG",
        subtitle: `Periode ${rows[0].periodLabel}`,
        table: {
          headers: ["ULTG", "Skor Bobot", "Tercapai", "Belum Tercapai"],
          rows: rows.map((s) => [s.ultg, num(s.overallWeightedScore), num(s.overall.achieved), num(s.overall.warning + s.overall.critical)]),
        },
        bullets: rows.map((s) => `${s.ultg}: skor bobot ${num(s.overallWeightedScore)} dari ${s.overall.total} KPI kontrak.`),
        sourceNote: `Sumber: Kinerja ULTG — periode ${rows[0].periodLabel}`,
      }),
    );
  }
  return {
    id: "kinerja-ultg",
    label: "Kinerja ULTG (33 KPI Kontrak per ULTG)",
    description: "Skor bobot dan ringkasan KPI tiap ULTG (Palangkaraya, Pangkalan Bun, Muara Teweh).",
    group: "Kinerja",
    kind: "data",
    slides,
  };
}

function summarizeCategory(cat: DisturbanceCategoryResult): { total: number; trip: number; arSukses: number } {
  return { total: cat.summary.total, trip: cat.summary.trip, arSukses: cat.summary.arSukses };
}

async function buildGangguanMateri(): Promise<PresentationMateriOption> {
  const result = await getDisturbances();
  const slides: PresentationSlide[] = [];
  if (!result.error) {
    const categories: [string, DisturbanceCategoryResult][] = [
      ["Transmisi", result.transmisi],
      ["Trafo HV", result.trafoHv],
      ["Trafo LV", result.trafoLv],
    ];
    const totals = categories.map(([label, cat]) => ({ label, ...summarizeCategory(cat) }));
    const grandTotal = totals.reduce((s, t) => s + t.total, 0);
    const causeCounts = new Map<string, number>();
    for (const [, cat] of categories) for (const c of cat.causePareto) causeCounts.set(c.cause, (causeCounts.get(c.cause) ?? 0) + c.count);
    const topCauses = [...causeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const ultgCounts = new Map<string, number>();
    for (const [, cat] of categories) for (const u of cat.ultgBreakdown) ultgCounts.set(u.ultg, (ultgCounts.get(u.ultg) ?? 0) + u.total);
    const topUltg = [...ultgCounts.entries()].sort((a, b) => b[1] - a[1]);

    slides.push(
      slide({
        title: "Rekapitulasi Gangguan — UPT Palangkaraya",
        subtitle: "Transmisi, Trafo HV, dan Trafo LV (data keseluruhan sampai saat ini)",
        stats: [
          { value: num(grandTotal), label: "Total Gangguan" },
          ...totals.map((t) => ({ value: num(t.total), label: t.label })),
        ],
        bullets: [
          ...totals.map((t) => `${t.label}: ${t.total} kejadian (${t.trip} Trip, ${t.arSukses} AR Sukses).`),
          topCauses.length > 0 ? `Penyebab terbanyak: ${topCauses.map(([c, n]) => `${c} (${n})`).join(", ")}.` : "Belum ada data penyebab.",
          topUltg.length > 0 ? `ULTG paling terdampak: ${topUltg.map(([u, n]) => `${u} (${n})`).join(", ")}.` : "",
        ].filter(Boolean),
        sourceNote: "Sumber: Data Gangguan (Transmisi, Trafo HV, Trafo LV)",
      }),
    );
  }
  return {
    id: "gangguan-rekap",
    label: "Rekapitulasi Gangguan",
    description: "Total kejadian, Trip/AR Sukses, penyebab dan ULTG paling terdampak.",
    group: "Proteksi & Gangguan",
    kind: "data",
    slides,
  };
}

function summarizeAboPrograms(programs: AboProgramComputed[]): string[] {
  return programs
    .filter((p) => p.status !== "tercapai")
    .slice(0, 6)
    .map((p) => `${p.code} — ${p.description}: ${pct(p.percentRealisasi)} realisasi (belum tercapai).`);
}

async function buildAboMateri(): Promise<PresentationMateriOption> {
  const [proteksi, hargi] = await Promise.all([getAboProteksiSnapshot(), getAboHargiSnapshot()]);
  const weekLabel = defaultAboWeekLabel();
  const proteksiPrograms = proteksi.error ? [] : buildAboSnapshotComputed(proteksi, weekLabel);
  const hargiPrograms = hargi.error ? [] : buildAboSnapshotComputed(hargi, weekLabel);
  const slides: PresentationSlide[] = [];
  if (proteksiPrograms.length > 0 || hargiPrograms.length > 0) {
    const attention = [
      ...collectAboAttentionItems(proteksiPrograms, weekLabel),
      ...collectAboAttentionItems(hargiPrograms, weekLabel),
    ];
    const bullets = [...summarizeAboPrograms(proteksiPrograms), ...summarizeAboPrograms(hargiPrograms)];
    slides.push(
      slide({
        title: "ABO — Realisasi Program Kerja Proteksi & Hargi",
        subtitle: `Minggu berjalan: ${weekLabel}`,
        stats: [
          { value: num(proteksiPrograms.length + hargiPrograms.length), label: "Total Program" },
          { value: num(attention.length), label: "Perlu Perhatian" },
        ],
        bullets: bullets.length > 0 ? bullets : ["Seluruh program ABO tercapai pada minggu berjalan."],
        sourceNote: `Sumber: ABO Proteksi & Hargi — minggu ${weekLabel}`,
      }),
    );
  }
  return {
    id: "abo",
    label: "ABO (Realisasi Program Kerja Proteksi & Hargi)",
    description: "Status pencapaian tiap program ABO dan daftar yang perlu perhatian minggu berjalan.",
    group: "Proteksi & Gangguan",
    kind: "data",
    slides,
  };
}

async function buildFourDxMateri(): Promise<PresentationMateriOption> {
  const snapshot = await getFourDxSnapshot();
  const slides: PresentationSlide[] = [];
  if (!snapshot.error) {
    const achievement = buildFourDxAchievementSummaries(
      snapshot.wigs,
      snapshot.periodBoundaries,
      snapshot.realizations,
      snapshot.monitoring,
      snapshot.currentPeriodLabel,
      snapshot.currentYear,
    );
    slides.push(
      slide({
        title: "4DX — Pencapaian WIG Year-to-Date",
        subtitle: `Periode berjalan: ${snapshot.currentPeriodLabel}`,
        table: {
          headers: ["WIG", "Tercapai YTD", "Total YTD", "% YTD"],
          rows: achievement.map((a) => [`WIG ${a.wigNumber}`, num(a.ytdTercapai), num(a.ytdTotal), pct(a.ytdPercent, 1)]),
        },
        bullets: achievement.map(
          (a) => `WIG ${a.wigNumber}: ${a.ytdTercapai}/${a.ytdTotal} minggu tercapai (${pct(a.ytdPercent, 1)} YTD).`,
        ),
        sourceNote: `Sumber: 4DX — periode ${snapshot.currentPeriodLabel}`,
      }),
    );
  }
  return {
    id: "4dx",
    label: "4DX (Pencapaian WIG & Lead Measure)",
    description: "Pencapaian year-to-date tiap Wildly Important Goal.",
    group: "Kinerja",
    kind: "data",
    slides,
  };
}

async function buildCeMateri(): Promise<PresentationMateriOption> {
  const snapshot = await getCeSnapshot();
  const slides: PresentationSlide[] = [];
  if (!snapshot.error) {
    const summary = buildCeSummary(snapshot.items);
    const attention = buildCeAttentionItems(snapshot.items, defaultCeWeekLabel());
    slides.push(
      slide({
        title: "Common Enemy — Temuan Anomali Aset",
        stats: [
          { value: num(summary.total), label: "Total Temuan" },
          { value: num(summary.close), label: "Selesai (Close)" },
          { value: num(summary.open), label: "Belum Selesai (Open)" },
          { value: pct(summary.percentAchieve), label: "% Pencapaian" },
        ],
        bullets: [
          ...summary.byUltg.map((u) => `${u.label}: ${u.total} temuan (${u.close} selesai, ${u.open} belum).`),
          attention.length > 0 ? `${attention.length} temuan perlu perhatian (Critical/Alert/terlambat).` : "Tidak ada temuan Critical/Alert yang menonjol.",
        ],
        sourceNote: "Sumber: Common Enemy (CE) — data berjalan",
      }),
    );
  }
  return {
    id: "ce",
    label: "Common Enemy (Temuan Anomali Aset)",
    description: "Status close/open temuan anomali elektrik & sipil per ULTG dan jenis aset.",
    group: "Proteksi & Gangguan",
    kind: "data",
    slides,
  };
}

async function buildAhiMateri(): Promise<PresentationMateriOption> {
  const result = await getAhiPerformance();
  const slides: PresentationSlide[] = [];
  if (result.data) {
    const d = result.data;
    const priority = d.anomalies.filter((a) => a.kategoriAhi >= 4).slice(0, 6);
    slides.push(
      slide({
        title: "AHI — Kondisi Kesehatan Aset",
        subtitle: `Pembaruan terakhir: ${d.lastUpdate ?? "—"}`,
        stats: d.sections.map((s) => ({ value: num(s.score), label: s.displayName })),
        bullets:
          priority.length > 0
            ? priority.map((a) => `${a.ultg} · GI ${a.gi} · ${a.bay} (${a.jenisAset}): ${a.keterangan ?? "kondisi Poor/Critical"}.`)
            : ["Tidak ada temuan kondisi Poor/Critical yang menonjol."],
        sourceNote: "Sumber: Asset Health Index (AHI)",
      }),
    );
  }
  return {
    id: "ahi",
    label: "AHI (Kesehatan Aset: MTU, Catu Daya, Trafo, Reaktor)",
    description: "Skor kesehatan per kategori dan temuan kondisi Poor/Critical.",
    group: "Proteksi & Gangguan",
    kind: "data",
    slides,
  };
}

async function buildRenusMateri(): Promise<PresentationMateriOption> {
  const data = await getRenusData();
  const slides: PresentationSlide[] = [];
  if (!data.error) {
    slides.push(
      slide({
        title: "RENUS — Rencana Pemeliharaan & Pekerjaan",
        subtitle: `Periode minggu berjalan: ${data.weekPeriod.label}`,
        stats: [
          { value: num(data.summary.total), label: "Total Rencana" },
          { value: num(data.summary.thisWeek), label: "Minggu Ini" },
          { value: num(data.summary.highRisk), label: "Risiko Tinggi" },
          { value: num(data.summary.upcoming), label: "Akan Datang" },
        ],
        bullets: data.reminders.length > 0 ? data.reminders.map((r) => r.text) : ["Tidak ada pekerjaan yang terlambat atau berisiko tinggi saat ini."],
        sourceNote: `Sumber: RENUS — per ${data.today}`,
      }),
    );
  }
  return {
    id: "renus",
    label: "RENUS (Rencana Pemeliharaan)",
    description: "Pekerjaan terlambat, minggu berjalan berisiko tinggi, dan rencana mendatang.",
    group: "Perencanaan",
    kind: "data",
    slides,
  };
}

async function buildDataAsetMateri(): Promise<PresentationMateriOption> {
  const result = await getAssetScanning();
  const slides: PresentationSlide[] = [];
  if (result.data) {
    const d = result.data;
    const selesai = d.anomali.filter((a) => (a.status ?? "").toUpperCase() === "SELESAI").length;
    const belum = d.anomali.length - selesai;
    const byUltg = new Map<string, { total: number; selesai: number }>();
    for (const a of d.anomali) {
      const cur = byUltg.get(a.ultg) ?? { total: 0, selesai: 0 };
      cur.total += 1;
      if ((a.status ?? "").toUpperCase() === "SELESAI") cur.selesai += 1;
      byUltg.set(a.ultg, cur);
    }
    const anomaliRelay =
      d.mpuBayLine.filter((r) => r.anomaliStatus.toUpperCase() !== "NORMAL").length +
      d.bpuBayLine.filter((r) => r.anomaliStatus.toUpperCase() !== "NORMAL").length;
    slides.push(
      slide({
        title: "Realisasi Program Kerja Proteksi — Data Aset",
        subtitle: "Hasil scanning proteksi (MPU/BPU Bay Line, Bus Protection) & tindak lanjut anomali",
        stats: [
          { value: num(d.anomali.length), label: "Total Temuan Anomali" },
          { value: num(selesai), label: "Selesai Ditindaklanjuti" },
          { value: num(belum), label: "Belum Selesai" },
          { value: num(d.relayObsolete.length), label: "Rencana Penggantian Relay Obsolete" },
        ],
        bullets: [
          ...[...byUltg.entries()].map(([ultg, c]) => `${ultg}: ${c.total} temuan anomali, ${c.selesai} selesai ditindaklanjuti.`),
          `${anomaliRelay} dari ${d.mpuBayLine.length + d.bpuBayLine.length} relay Bay Line (MPU+BPU) berstatus anomali (bukan Normal).`,
        ],
        sourceNote: "Sumber: Data Aset — REKAPITULASI SCANNING",
      }),
    );
  }
  return {
    id: "data-aset-proteksi",
    label: "Realisasi Program Kerja Sistem Proteksi (Data Aset)",
    description: "Status scanning relay proteksi dan tindak lanjut temuan anomali per ULTG.",
    group: "Proteksi & Gangguan",
    kind: "data",
    slides,
  };
}

function buildKendalaUsulanMateri(): PresentationMateriOption {
  return {
    id: "kendala-usulan",
    label: "Kendala Pelaksanaan & Usulan Program Kerja Berikutnya",
    description: "Materi ini tidak tersedia sebagai data mentah di satu modul manapun — susun lewat AI Assistant di bawah, yang akan mendasarkannya pada temuan terbuka/terlambat yang sudah ada.",
    group: "Kesimpulan",
    kind: "ai-prompt",
    slides: [],
    suggestedPrompt:
      "Slide 1: kendala pelaksanaan program kerja proteksi periode 2025-2026 berdasarkan temuan yang masih terbuka, terlambat, atau belum selesai. Slide 2: usulan program kerja untuk periode berikutnya berdasarkan kendala tersebut.",
  };
}

export async function getPresentationMateriCatalog(): Promise<PresentationMateriCatalog> {
  try {
    const options = await Promise.all([
      buildKinerjaUptMateri(),
      buildKinerjaUltgMateri(),
      buildGangguanMateri(),
      buildAboMateri(),
      buildCeMateri(),
      buildAhiMateri(),
      buildDataAsetMateri(),
      buildFourDxMateri(),
      buildRenusMateri(),
    ]);
    options.push(buildKendalaUsulanMateri());
    return { options, error: null };
  } catch (err) {
    return { options: [], error: err instanceof Error ? err.message : "Gagal memuat materi presentasi." };
  }
}
