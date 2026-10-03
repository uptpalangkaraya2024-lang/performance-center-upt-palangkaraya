import type { Content } from "@google/genai";
import { NextResponse } from "next/server";

import { AI_ASSISTANT_TOOLS, runAiTool, type AiToolName } from "@/lib/ai-assistant-tools";
import { isRetryableGeminiError, runGeminiToolChat } from "@/lib/gemini-tool-chat";
import { buildChart, parseNameValuePoints, stripJsonFence } from "@/lib/presentation-chart-compute";
import type { PresentationChartSpec } from "@/types";

// Per-slide AI editing for the Presentasi deck — distinct from
// /api/presentation-assistant (which plans a whole NEW set of slides from
// scratch). This one revises ONE existing slide in place: "tambahkan grafik
// rekap gangguan dan paretonya" on a slide that already has its own title/
// bullets/charts should only add what was asked, not silently reproduce (and
// risk mangling) everything else. So the model is asked for a PATCH — title/
// bullets only when they actually change (null otherwise), plus a list of
// NEW charts to add and the titles of any existing chart to remove — rather
// than echoing back the slide's entire state, which the client already has
// and can merge in locally.
export const maxDuration = 60;

const SYSTEM_PROMPT = `Anda adalah asisten pengeditan SATU slide presentasi untuk Performance Center UPT Palangkaraya.

Anda akan diberi isi SATU slide yang sudah ada (judul, subjudul, poin-poin, dan daftar grafik yang sudah ditampilkan jika ada) beserta instruksi perubahan dari pengguna (mis. "tambahkan grafik rekap gangguan dan paretonya", "ubah judul jadi ...", "tambahkan poin tentang ...", "hapus grafik pie-nya").

ATURAN:
1. Terapkan PERSIS perubahan yang diminta instruksi — jangan menambah perubahan lain yang tidak diminta.
2. Jika instruksi meminta grafik/data yang BELUM ada di slide ini (mis. data dari modul lain seperti Gangguan, ABO, dll), WAJIB panggil tool yang sesuai untuk mengambil data NYATA — JANGAN PERNAH mengarang angka. Gunakan "pareto" untuk ranking/kontributor terbesar (sertakan SEMUA kontributor dari hasil tool, bukan hanya beberapa teratas — sistem akan menghitung persentase kumulatif dari total sebenarnya lalu memotongnya ke titik-titik teratas untuk tampilan), "pie" untuk proporsi/komposisi, "bar" untuk perbandingan antar kategori.
3. Jika instruksi minta menghapus sebuah grafik yang sudah ada, sebutkan JUDUL PERSIS grafik tsb (sesuai daftar yang diberikan) di "removeChartTitles".
4. Jika instruksi tidak menyinggung judul, biarkan "title": null. Jika tidak menyinggung poin-poin, biarkan "bullets": null — JANGAN mengosongkan atau mengarang ulang poin yang sudah ada kecuali diminta.
5. Jika instruksi tidak bisa dipenuhi dengan data yang tersedia, kembalikan "newCharts": [] dan jelaskan keterbatasannya lewat "bullets" (jangan mengarang data).

Jawaban AKHIR Anda HARUS berupa JSON valid saja — TANPA markdown code fence, TANPA teks lain di luar JSON — persis dengan bentuk:
{"title": string | null, "bullets": string[] | null, "newCharts": [{"type": "bar"|"pie"|"pareto", "title": string, "data": [{"name": string, "value": number}]}], "removeChartTitles": string[], "sourceNote": string | null}

Aturan tambahan:
- "newCharts" boleh array kosong [] jika tidak ada grafik baru yang perlu ditambahkan.
- "newCharts[].data" untuk tipe "bar"/"pie": 3-8 titik paling signifikan. Untuk tipe "pareto": SEMUA kontributor dari tool (lihat aturan 2).
- "sourceNote" singkat menyebutkan modul/periode sumber data baru (jika ada), atau null jika tidak berubah.
- Jawab dalam Bahasa Indonesia.`;

interface SlideContext {
  title?: unknown;
  subtitle?: unknown;
  bullets?: unknown;
  charts?: unknown;
}

function isSlideContext(v: unknown): v is SlideContext {
  return typeof v === "object" && v !== null;
}

function describeSlide(ctx: SlideContext): string {
  const title = typeof ctx.title === "string" ? ctx.title : "(tanpa judul)";
  const subtitle = typeof ctx.subtitle === "string" && ctx.subtitle ? ctx.subtitle : "-";
  const bullets = Array.isArray(ctx.bullets) ? ctx.bullets.filter((b): b is string => typeof b === "string") : [];
  const charts = Array.isArray(ctx.charts)
    ? ctx.charts
        .map((c) => {
          const title = (c as { title?: unknown })?.title;
          const type = (c as { type?: unknown })?.type;
          return typeof title === "string" ? `"${title}" (${typeof type === "string" ? type : "?"})` : null;
        })
        .filter((c): c is string => c !== null)
    : [];

  return [
    `Judul: ${title}`,
    `Subjudul: ${subtitle}`,
    `Poin-poin:\n${bullets.length > 0 ? bullets.map((b) => `- ${b}`).join("\n") : "(tidak ada)"}`,
    `Grafik yang sudah ada: ${charts.length > 0 ? charts.join(", ") : "Tidak ada"}`,
  ].join("\n");
}

interface ParsedPatch {
  title: string | null;
  bullets: string[] | null;
  newCharts: PresentationChartSpec[];
  removeChartTitles: string[];
  sourceNote: string | null;
}

function parsePatch(text: string): ParsedPatch | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const raw = parsed as {
    title?: unknown;
    bullets?: unknown;
    newCharts?: unknown;
    removeChartTitles?: unknown;
    sourceNote?: unknown;
  };

  const bullets = Array.isArray(raw.bullets) ? raw.bullets.filter((b): b is string => typeof b === "string") : null;

  const newCharts: PresentationChartSpec[] = [];
  if (Array.isArray(raw.newCharts)) {
    raw.newCharts.forEach((c, idx) => {
      const type = (c as { type?: unknown })?.type;
      const title = (c as { title?: unknown })?.title;
      const data = parseNameValuePoints((c as { data?: unknown })?.data);
      if ((type === "bar" || type === "pie" || type === "pareto") && data.length > 0) {
        newCharts.push(buildChart(`ai-edit-chart-${Date.now()}-${idx}`, type, typeof title === "string" ? title : "Grafik", data));
      }
    });
  }

  const removeChartTitles = Array.isArray(raw.removeChartTitles)
    ? raw.removeChartTitles.filter((t): t is string => typeof t === "string")
    : [];

  return {
    title: typeof raw.title === "string" ? raw.title : null,
    bullets,
    newCharts,
    removeChartTitles,
    sourceNote: typeof raw.sourceNote === "string" ? raw.sourceNote : null,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY belum diatur di server. Buat API key gratis di Google AI Studio (aistudio.google.com/apikey), tambahkan sebagai environment variable, lalu deploy ulang.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body permintaan tidak valid." }, { status: 400 });
  }

  const { slide, instruction } = (body as { slide?: unknown; instruction?: unknown }) ?? {};
  if (!isSlideContext(slide)) {
    return NextResponse.json({ error: "Field 'slide' tidak valid." }, { status: 400 });
  }
  if (typeof instruction !== "string" || instruction.trim().length === 0) {
    return NextResponse.json({ error: "Field 'instruction' harus berupa teks yang tidak kosong." }, { status: 400 });
  }

  const userMessage = `${describeSlide(slide)}\n\nInstruksi perubahan: "${instruction.trim()}"`;
  const contents: Content[] = [{ role: "user", parts: [{ text: userMessage }] }];

  let result;
  try {
    result = await runGeminiToolChat({
      apiKey,
      systemPrompt: SYSTEM_PROMPT,
      initialContents: contents,
      tools: AI_ASSISTANT_TOOLS,
      runTool: (name, args) => runAiTool(name as AiToolName, args),
    });
  } catch (err) {
    if (isRetryableGeminiError(err)) {
      return NextResponse.json(
        { error: "Layanan Gemini sedang mengalami lonjakan permintaan tinggi — coba lagi dalam beberapa saat." },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal menghubungi Gemini API: ${message}` }, { status: 502 });
  }

  if (result.finalText === null) {
    return NextResponse.json(
      { error: "Asisten tidak memberikan hasil dalam batas percobaan yang wajar — coba instruksi yang lebih spesifik." },
      { status: 502 },
    );
  }

  const patch = parsePatch(result.finalText);
  if (!patch) {
    return NextResponse.json(
      { error: "AI tidak mengembalikan format yang valid — coba perjelas instruksi." },
      { status: 502 },
    );
  }

  return NextResponse.json({ patch, toolsUsed: result.toolsUsed });
}
