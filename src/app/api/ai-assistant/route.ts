import type { Content } from "@google/genai";
import { NextResponse } from "next/server";

import { AI_ASSISTANT_TOOLS, runAiTool, type AiToolName } from "@/lib/ai-assistant-tools";
import { isRetryableGeminiError, runGeminiToolChat } from "@/lib/gemini-tool-chat";

// AI Assistant chat backend — the one place in this app that actually calls
// an LLM (see src/lib/ai-assistant-tools.ts's own top comment for why the
// homepage's rule-based insights deliberately don't). Every factual claim
// the model makes has to come from a tool call against live service data;
// the system prompt below forbids answering from memory, and every tool
// call is round-tripped through the exact same compute functions the
// dashboard's own pages use — never a re-derived number.
//
// Gemini (not Claude) per the user's own choice — a genuinely free tier
// (no card required) via a Google AI Studio API key, vs. Anthropic's
// pay-as-you-go-only Console.
export const maxDuration = 60;

// Model selection / retry-fallback logic lives in src/lib/gemini-tool-chat.ts
// (shared with /api/presentation-assistant) — see that file's own comment
// for why "gemini-flash-latest" is an alias rather than a pinned version.

const SYSTEM_PROMPT = `Anda adalah AI Assistant Performance Center UPT Palangkaraya — asisten operasional untuk tim UPT Palangkaraya (unit transmisi listrik PLN).

ATURAN MUTLAK:
1. JANGAN PERNAH mengarang atau menebak angka/data operasional. Setiap fakta (KPI, jumlah gangguan, status ABO/CE/4DX/AHI/RENUS, dll) HARUS berasal dari hasil pemanggilan tool yang tersedia. Jika tidak yakin data mana yang relevan, panggil tool yang sesuai terlebih dahulu — jangan menjawab langsung dari asumsi.
2. Jika sebuah tool mengembalikan error atau data tidak tersedia, katakan itu dengan jujur ke pengguna — jangan menutupinya dengan tebakan.
3. SELALU sebutkan secara singkat sumber & periode data yang dipakai dalam jawaban (contoh: "Berdasarkan data Kinerja UPT periode Agustus 2026...").
4. Jawab dalam Bahasa Indonesia, singkat, jelas, dan langsung ke inti — gunakan poin-poin bila menjelaskan beberapa hal sekaligus. Hindari basa-basi panjang.
5. Anda BUKAN asisten umum — hanya menjawab pertanyaan seputar data operasional UPT Palangkaraya yang tersedia lewat tool (Kinerja UPT/ULTG, ABO, CE, AHI, Gangguan, 4DX, RENUS). Untuk pertanyaan di luar itu, katakan bahwa Anda hanya bisa membantu seputar data dashboard ini.
6. Jika pengguna bertanya sesuatu yang butuh beberapa modul (mis. "bagaimana kondisi UPT secara umum"), panggil tool "management_attention" dan/atau beberapa tool relevan sekaligus, lalu rangkum.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function isChatMessage(v: unknown): v is ChatMessage {
  return (
    typeof v === "object" &&
    v !== null &&
    ((v as { role?: unknown }).role === "user" || (v as { role?: unknown }).role === "assistant") &&
    typeof (v as { content?: unknown }).content === "string"
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY belum diatur di server. Buat API key gratis di Google AI Studio (aistudio.google.com/apikey), tambahkan sebagai environment variable (lokal: .env.local, produksi: pengaturan project Vercel), lalu deploy ulang.",
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

  const rawMessages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(rawMessages) || !rawMessages.every(isChatMessage) || rawMessages.length === 0) {
    return NextResponse.json({ error: "Field 'messages' harus berupa array {role, content} yang tidak kosong." }, { status: 400 });
  }
  const messages: ChatMessage[] = rawMessages;

  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

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
        { error: "Layanan Gemini sedang mengalami lonjakan permintaan tinggi (masalah sementara dari Google, bukan konfigurasi Anda) — coba lagi dalam beberapa saat." },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal menghubungi Gemini API: ${message}` }, { status: 502 });
  }

  if (result.finalText === null) {
    return NextResponse.json(
      { error: "Asisten tidak memberikan jawaban akhir dalam batas percakapan yang wajar — coba pertanyaan yang lebih spesifik." },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply: result.finalText, toolsUsed: result.toolsUsed });
}
