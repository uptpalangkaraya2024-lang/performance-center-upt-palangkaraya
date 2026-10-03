import type { Content } from "@google/genai";
import { NextResponse } from "next/server";

import { AI_ASSISTANT_TOOLS, runAiTool, type AiToolName } from "@/lib/ai-assistant-tools";
import { isRetryableGeminiError, runGeminiToolChat } from "@/lib/gemini-tool-chat";
import type { PresentationSlide } from "@/types";

// The AI half of the Presentasi builder (src/app/dashboard/presentasi):
// the user describes a slide plan in free text (e.g. "slide 1: rekap
// gangguan, slide 2: bagaimana mengatasi gangguan tersebut") and this turns
// it into PresentationSlide[]. Reuses the exact same tool-calling model and
// grounding contract as /api/ai-assistant (same AI_ASSISTANT_TOOLS, same
// "never state a number without a tool call" rule) via the shared
// src/lib/gemini-tool-chat.ts loop — the only thing that differs is the
// system prompt (slide-plan JSON instead of a chat reply) and that this
// endpoint explicitly permits grounded analysis/recommendation content
// (e.g. "bagaimana mengatasi gangguan") for exactly the case the user
// described: when what's wanted isn't fully present as raw data.
export const maxDuration = 60;

const SYSTEM_PROMPT = `Anda adalah asisten penyusun slide presentasi untuk Performance Center UPT Palangkaraya.

Pengguna memberi instruksi berisi daftar slide yang diinginkan (misalnya "slide 1: rekap gangguan, slide 2: bagaimana mengatasi gangguan tersebut, slide 3: ..."). Untuk SETIAP slide yang diminta:

1. Jika isinya data operasional yang tersedia lewat tool (Kinerja UPT/ULTG, Gangguan, ABO, Common Enemy, AHI, 4DX, RENUS, Data Aset), WAJIB panggil tool terkait dan susun isi slide HANYA dari hasil tool tsb — JANGAN PERNAH mengarang angka.
2. Jika isinya analisis/rekomendasi yang TIDAK sepenuhnya tersedia sebagai data mentah (mis. "bagaimana mengatasi gangguan tersebut", "usulan program kerja", "kendala pelaksanaan"), Anda BOLEH menyusun analisis/rekomendasi sendiri, TETAPI wajib mendasarkannya pada data yang sudah diambil lewat tool (contoh: penyebab gangguan terbanyak → sarankan tindakan yang relevan dengan penyebab tsb). Tandai slide seperti ini dengan "aiGenerated": true.
3. Jika benar-benar tidak ada data relevan untuk suatu slide, katakan itu secara jujur di salah satu poin slide tsb (jangan mengarang data).

Setelah seluruh tool yang diperlukan selesai dipanggil, jawaban AKHIR Anda HARUS berupa JSON valid saja — TANPA markdown code fence, TANPA teks lain di luar JSON — persis dengan bentuk:
{"slides": [{"title": string, "bullets": string[], "sourceNote": string | null, "aiGenerated": boolean}]}

Aturan format:
- Jumlah elemen "slides" harus sama dengan jumlah slide yang diminta pengguna, urut sesuai permintaan.
- "title" singkat (maks ~8 kata).
- "bullets" maksimal 6 poin singkat dan padat per slide (bukan paragraf panjang).
- "sourceNote" menyebutkan modul/periode sumber data secara singkat, atau null jika slide murni analisis AI tanpa tool.
- "aiGenerated": true jika sebagian besar isi slide adalah analisis/rekomendasi (poin 2), false jika murni berdasar data tool (poin 1).
- Jawab dalam Bahasa Indonesia.`;

interface RawSlide {
  title?: unknown;
  bullets?: unknown;
  sourceNote?: unknown;
  aiGenerated?: unknown;
}

function parseSlides(text: string): PresentationSlide[] | null {
  // Gemini sometimes wraps JSON in a ```json fence despite the instruction
  // not to — stripped defensively rather than trusting the system prompt
  // to be followed perfectly every time.
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const rawSlides = (parsed as { slides?: unknown })?.slides;
  if (!Array.isArray(rawSlides)) return null;

  const slides: PresentationSlide[] = [];
  rawSlides.forEach((raw: RawSlide, idx) => {
    if (typeof raw?.title !== "string") return;
    const bullets = Array.isArray(raw.bullets) ? raw.bullets.filter((b): b is string => typeof b === "string") : [];
    slides.push({
      id: `ai-${Date.now()}-${idx}`,
      title: raw.title,
      bullets,
      sourceNote: typeof raw.sourceNote === "string" ? raw.sourceNote : null,
      aiGenerated: raw.aiGenerated !== false,
    });
  });
  return slides.length > 0 ? slides : null;
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

  const instruction = (body as { instruction?: unknown })?.instruction;
  if (typeof instruction !== "string" || instruction.trim().length === 0) {
    return NextResponse.json({ error: "Field 'instruction' harus berupa teks yang tidak kosong." }, { status: 400 });
  }

  const contents: Content[] = [{ role: "user", parts: [{ text: instruction }] }];

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

  const slides = parseSlides(result.finalText);
  if (!slides) {
    return NextResponse.json(
      { error: "AI tidak mengembalikan format slide yang valid — coba perjelas instruksi (contoh: \"slide 1: ..., slide 2: ...\")." },
      { status: 502 },
    );
  }

  return NextResponse.json({ slides, toolsUsed: result.toolsUsed });
}
