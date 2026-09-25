import "server-only";

// Tool definitions + execution for the AI Assistant (src/app/api/ai-assistant/route.ts).
//
// Design principle: the model NEVER answers from memory/training data about
// this UPT's operations — every number it states must come from calling one
// of these tools, which each call the exact same service + compute
// functions the dashboard's own pages already use (never a re-derived or
// approximated calculation). This is deliberate: src/lib/executive-insights.ts
// stays rule-based (cheap, instant, runs on every homepage load) precisely
// because an LLM can be wrong about operational numbers — this Assistant is
// the separate, opt-in feature where that risk is acceptable BECAUSE every
// fact it can state is grounded in a live tool call, never free-form
// generation, and the system prompt (see the route) requires it to say so
// explicitly when a tool has no data rather than guess.
//
// Provider-neutral on purpose: {name, description, parameters} is plain JSON
// Schema, understood as-is by Gemini's functionDeclarations.parametersJsonSchema
// (see src/app/api/ai-assistant/route.ts) — kept generic rather than named
// after one SDK's shape in case the backend model ever changes again.
//
// Each tool returns a compact, LLM-sized JSON object — never the full raw
// arrays some of these services return (e.g. a bare-bay breakdown or a
// per-row ABO checklist can run into the hundreds), since that would blow
// the model's context budget for no benefit; the truncation points below are
// chosen per tool to keep the top-N actually useful for a question while
// staying well under a few KB each.

import { getUptPerformance } from "@/services/upt-performance";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getDisturbances } from "@/services/disturbances";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getRenusData } from "@/services/renus";
import { isRenusCancelled, isRenusDone } from "@/lib/renus-helpers";
import {
  buildAboSnapshotComputed,
  collectAboAttentionItems,
  defaultAboWeekLabel,
} from "@/lib/abo-proteksi-compute";
import { buildCeSummary, buildCeAttentionItems, defaultCeWeekLabel } from "@/lib/ce-compute";
import {
  buildFourDxWigs,
  buildFourDxAchievementSummaries,
  resolvePeriodRange,
} from "@/lib/four-dx-compute";
import { buildManagementAttention } from "@/lib/executive-insights";
import type { AboProgramComputed, DisturbanceCategoryResult } from "@/types";

// --- Tool schemas -----------------------------------------------------------

export const AI_ASSISTANT_TOOLS = [
  {
    name: "kinerja_upt",
    description:
      "Kinerja 19 KPI kontrak UPT Palangkaraya (TRAF, CCAF, MTTR, dll) untuk periode berjalan: target, realisasi, pencapaian, status, dan skor bobot keseluruhan.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "kinerja_ultg",
    description: "Kinerja per ULTG (unit layanan transmisi gardu) — target/realisasi/pencapaian per ULTG.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "abo",
    description:
      "ABO (Anggaran Belanja Operasi) checklist ruas Proteksi & Hargi untuk minggu berjalan: status tercapai/belum per program, dan daftar item yang perlu perhatian (BA belum diupload, kondisi NOT OK).",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "common_enemy",
    description:
      "CE (Common Enemy) — temuan/anomali aset (elektrik & sipil) yang perlu ditindaklanjuti: total, close/open, breakdown per ULTG dan jenis aset, dan daftar temuan Critical/Alert/terlambat.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "ahi",
    description:
      "AHI (Asset Health Index) — skor kesehatan MTU, Catu Daya, Trafo, Reaktor, dan daftar temuan anomali kondisi Poor/Critical.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "gangguan",
    description:
      "Data gangguan Transmisi, Trafo HV, dan Trafo LV untuk bulan tertentu: total kejadian, Trip vs AR Sukses/Reclose, penyebab terbanyak, ULTG/ruas paling terdampak, dan durasi rata-rata.",
    parameters: {
      type: "object" as const,
      properties: {
        kategori: {
          type: "string",
          enum: ["transmisi", "trafo-hv", "trafo-lv", "semua"],
          description: "Kategori gangguan yang ingin dilihat. Default 'semua' jika tidak disebutkan.",
        },
        bulan: {
          type: "integer",
          description: "Bulan (1-12). Default bulan berjalan jika tidak disebutkan.",
        },
        tahun: {
          type: "integer",
          description: "Tahun (mis. 2026). Default tahun berjalan jika tidak disebutkan.",
        },
      },
    },
  },
  {
    name: "wig_4dx",
    description:
      "4DX (Wildly Important Goals / Lead Measure) — target dan realisasi tiap WIG & Lead Measure untuk minggu berjalan, plus pencapaian year-to-date per WIG.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "renus",
    description:
      "RENUS (rencana pemeliharaan/pekerjaan) — pekerjaan terlambat, hari ini, minggu berjalan (berisiko tinggi), dan rencana bulan depan.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "management_attention",
    description:
      "Ringkasan lintas-modul 'apa yang perlu perhatian sekarang' — gabungan sinyal dari Kinerja UPT, Gangguan, AHI, ABO, 4DX, dan CE, sama seperti yang tampil di overview beranda.",
    parameters: { type: "object" as const, properties: {} },
  },
] satisfies { name: string; description: string; parameters: object }[];

export type AiToolName = (typeof AI_ASSISTANT_TOOLS)[number]["name"];

// --- Small shared helpers --------------------------------------------------

function summarizeCategory(label: string, cat: DisturbanceCategoryResult) {
  return {
    kategori: label,
    total: cat.summary.total,
    trip: cat.summary.trip,
    arSukses: cat.summary.arSukses,
    tidakTrip: cat.summary.tidakTrip,
    gangguanTerakhir: cat.summary.latestDisturbance,
    rataRataDurasiTripMenit: cat.avgDurationMinutes,
    penyebabTerbanyak: cat.causePareto.slice(0, 5),
    ultgTerbanyak: cat.ultgBreakdown.slice(0, 5).map((u) => ({ ultg: u.ultg, total: u.total, open: u.followUp.open })),
    ruasTerbanyak: cat.topBay.slice(0, 5),
    gangguanTerlama: cat.longestDisturbances.slice(0, 3),
  };
}

function summarizeAboPrograms(programs: AboProgramComputed[]) {
  return programs.map((p) => ({
    kode: p.code,
    deskripsi: p.description,
    status: p.status,
    persenRealisasi: p.percentRealisasi,
    gap: p.gap,
    targetTotal: p.master,
  }));
}

// --- Tool execution ----------------------------------------------------------

export async function runAiTool(name: AiToolName, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "kinerja_upt": {
      const result = await getUptPerformance();
      if (!result.data) return { error: result.error ?? "Data Kinerja UPT tidak tersedia." };
      const d = result.data;
      return {
        periode: d.periodLabel,
        skorBobotKeseluruhan: d.overallWeightedScore,
        ringkasan: d.overall,
        kpis: d.kpis.map((k) => ({
          nama: k.displayName,
          singkatan: k.abbreviation,
          kategori: k.category,
          target: k.targetLabel,
          realisasi: k.actualLabel,
          pencapaian: k.achievement,
          status: k.status,
        })),
      };
    }
    case "kinerja_ultg": {
      const result = await getUltgPerformance();
      if (result.error) return { error: result.error };
      return {
        data: result.data.map((u) => ({
          ultg: u.name,
          kpi: u.kpi,
          target: u.target,
          realisasi: u.actual,
          pencapaian: u.achievement,
          status: u.status,
          tren: u.trend,
        })),
      };
    }
    case "abo": {
      const [proteksi, hargi] = await Promise.all([getAboProteksiSnapshot(), getAboHargiSnapshot()]);
      const weekLabel = defaultAboWeekLabel();
      const proteksiPrograms = proteksi.error ? [] : buildAboSnapshotComputed(proteksi, weekLabel);
      const hargiPrograms = hargi.error ? [] : buildAboSnapshotComputed(hargi, weekLabel);
      if (proteksiPrograms.length === 0 && hargiPrograms.length === 0) {
        return { error: proteksi.error ?? hargi.error ?? "Data ABO tidak tersedia." };
      }
      const attention = [
        ...collectAboAttentionItems(proteksiPrograms, weekLabel),
        ...collectAboAttentionItems(hargiPrograms, weekLabel),
      ];
      return {
        mingguBerjalan: weekLabel,
        proteksi: summarizeAboPrograms(proteksiPrograms),
        hargi: summarizeAboPrograms(hargiPrograms),
        perluPerhatian: attention.slice(0, 15).map((a) => ({
          ultg: a.ultg,
          asset: a.asset,
          program: a.programCode,
          masalah: a.issue,
        })),
      };
    }
    case "common_enemy": {
      const snapshot = await getCeSnapshot();
      if (snapshot.error) return { error: snapshot.error };
      const summary = buildCeSummary(snapshot.items);
      const attention = buildCeAttentionItems(snapshot.items, defaultCeWeekLabel());
      return {
        ringkasan: summary,
        perluPerhatian: attention.slice(0, 15).map((a) => ({
          gardu: a.item.gardu,
          bay: a.item.bay,
          jenisAsset: a.item.jenisAsset,
          masalah: a.issue,
          status: a.item.status,
        })),
      };
    }
    case "ahi": {
      const result = await getAhiPerformance();
      if (!result.data) return { error: result.error ?? "Data AHI tidak tersedia." };
      const d = result.data;
      const priorityAnomalies = d.anomalies.filter((a) => a.kategoriAhi >= 4).slice(0, 15);
      return {
        pembaruanTerakhir: d.lastUpdate,
        sections: d.sections.map((s) => ({ nama: s.displayName, skor: s.score, status: s.status })),
        temuanPoorCritical: priorityAnomalies.map((a) => ({
          ultg: a.ultg,
          gi: a.gi,
          bay: a.bay,
          jenisAset: a.jenisAset,
          kategoriAhi: a.kategoriAhi >= 5 ? "Critical" : "Poor",
          keterangan: a.keterangan,
          rencanaTindakLanjut: a.rencanaTindakLanjut,
          targetWaktu: a.targetWaktu,
        })),
      };
    }
    case "gangguan": {
      const result = await getDisturbances();
      if (result.error) return { error: result.error };
      const kategori = typeof input.kategori === "string" ? input.kategori : "semua";
      // Month/year filtering isn't wired here yet — every category's data
      // already carries its own current-vs-history breakdown (causePareto,
      // ultgBreakdown, etc. are all-time aggregates, same as the module's
      // own overview cards), so this tool reports the same all-time-to-date
      // figures the Gangguan page's own summary cards show by default.
      const categories: [string, DisturbanceCategoryResult][] = [
        ["Transmisi", result.transmisi],
        ["Trafo HV", result.trafoHv],
        ["Trafo LV", result.trafoLv],
      ];
      const filtered =
        kategori === "transmisi"
          ? categories.filter(([l]) => l === "Transmisi")
          : kategori === "trafo-hv"
            ? categories.filter(([l]) => l === "Trafo HV")
            : kategori === "trafo-lv"
              ? categories.filter(([l]) => l === "Trafo LV")
              : categories;
      return { data: filtered.map(([label, cat]) => summarizeCategory(label, cat)) };
    }
    case "wig_4dx": {
      const snapshot = await getFourDxSnapshot();
      if (snapshot.error) return { error: snapshot.error };
      const period = resolvePeriodRange(snapshot.currentPeriodLabel, snapshot.periodBoundaries, snapshot.currentYear);
      const wigs = buildFourDxWigs(snapshot.wigs, period, snapshot.realizations, snapshot.monitoring);
      const achievement = buildFourDxAchievementSummaries(
        snapshot.wigs,
        snapshot.periodBoundaries,
        snapshot.realizations,
        snapshot.monitoring,
        snapshot.currentPeriodLabel,
        snapshot.currentYear,
      );
      return {
        periodeBerjalan: snapshot.currentPeriodLabel,
        wigs: wigs.map((w) => ({
          nomor: w.number,
          judul: w.title,
          leadMeasures: w.lms.map((lm) => ({
            kode: lm.code,
            deskripsi: lm.description,
            targetMingguan: lm.targetMingguan,
            realisasiMingguan: lm.realisasiMingguan,
            persenRealisasi: lm.percentRealisasiMingguan,
            status: lm.status,
          })),
        })),
        pencapaianYtd: achievement.map((a) => ({
          wig: a.wigNumber,
          persenYtd: a.ytdPercent,
          tercapaiYtd: a.ytdTercapai,
          totalYtd: a.ytdTotal,
        })),
      };
    }
    case "renus": {
      const data = await getRenusData();
      if (data.error) return { error: data.error };
      const isActive = (r: (typeof data.rows)[number]) => !isRenusCancelled(r);
      const overdue = data.rows.filter((r) => isActive(r) && !isRenusDone(r) && r.rencanaDate < data.today);
      const today = data.rows.filter((r) => isActive(r) && r.rencanaDate === data.today);
      return {
        hariIni: data.today,
        periodeMinggu: data.weekPeriod.label,
        ringkasan: data.summary,
        catatan: data.reminders.map((r) => r.text),
        terlambat: overdue.slice(0, 10).map((r) => ({ ultg: r.ultg, gi: r.gi, pekerjaan: r.workDetail, tanggalRencana: r.rencanaDate })),
        hariIniDaftar: today.slice(0, 10).map((r) => ({ ultg: r.ultg, gi: r.gi, pekerjaan: r.workDetail })),
      };
    }
    case "management_attention": {
      const [upt, disturbances, ahiResult, proteksi, hargi, fourDxSnapshot, ceSnapshot, renus] = await Promise.all([
        getUptPerformance(),
        getDisturbances(),
        getAhiPerformance(),
        getAboProteksiSnapshot(),
        getAboHargiSnapshot(),
        getFourDxSnapshot(),
        getCeSnapshot(),
        getRenusData(),
      ]);
      const aboWeekLabel = defaultAboWeekLabel();
      const proteksiPrograms = proteksi.error ? [] : buildAboSnapshotComputed(proteksi, aboWeekLabel);
      const hargiPrograms = hargi.error ? [] : buildAboSnapshotComputed(hargi, aboWeekLabel);
      const abo =
        proteksiPrograms.length > 0 || hargiPrograms.length > 0
          ? { proteksiPrograms, hargiPrograms, weekLabel: aboWeekLabel }
          : null;
      const fourDxPeriod = fourDxSnapshot.error
        ? null
        : resolvePeriodRange(fourDxSnapshot.currentPeriodLabel, fourDxSnapshot.periodBoundaries, fourDxSnapshot.currentYear);
      const fourDxWigs = fourDxPeriod
        ? buildFourDxWigs(fourDxSnapshot.wigs, fourDxPeriod, fourDxSnapshot.realizations, fourDxSnapshot.monitoring)
        : null;

      const insights = buildManagementAttention({
        upt: upt.data,
        transmisi: disturbances.error ? null : disturbances.transmisi,
        trafoHv: disturbances.error ? null : disturbances.trafoHv,
        trafoLv: disturbances.error ? null : disturbances.trafoLv,
        ahi: ahiResult.data,
        bayLineReports: null,
        renusReminders: renus.error ? null : renus.reminders,
        abo,
        fourDx: fourDxWigs,
        ce: ceSnapshot.error ? null : ceSnapshot,
      });
      return { insights: insights.map((i) => ({ modul: i.module, tingkat: i.tone, teks: i.text })) };
    }
    default:
      return { error: `Tool tidak dikenal: ${name}` };
  }
}
