import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { AI_ASSISTANT_TOOLS, runAiTool, type AiToolName } from "@/lib/ai-assistant-tools";

// AI Assistant chat backend — the one place in this app that actually calls
// an LLM (see src/lib/ai-assistant-tools.ts's own top comment for why the
// homepage's rule-based insights deliberately don't). Every factual claim
// the model makes has to come from a tool call against live service data;
// the system prompt below forbids answering from memory, and every tool
// call is round-tripped through the exact same compute functions the
// dashboard's own pages use — never a re-derived number.
export const maxDuration = 60;

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
    (v as { role?: unknown }).role !== undefined &&
    ((v as { role?: unknown }).role === "user" || (v as { role?: unknown }).role === "assistant") &&
    typeof (v as { content?: unknown }).content === "string"
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY belum diatur di server. Tambahkan environment variable ini (lokal: .env.local, produksi: pengaturan project Vercel) lalu deploy ulang.",
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

  const client = new Anthropic({ apiKey });
  const conversation: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolsUsed = new Set<string>();

  // Tool-use loop: Claude may call one or more tools before giving a final
  // text answer. Capped at a handful of round-trips as a safety net against
  // a runaway loop — every tool here is a fast, cheap read (existing service
  // caches), so this cap is generous relative to how many calls a real
  // question ever needs.
  const MAX_ROUNDS = 6;
  let finalText: string | null = null;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: AI_ASSISTANT_TOOLS,
        messages: conversation,
      });

      conversation.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        finalText = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        break;
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        toolsUsed.add(block.name);
        let output: unknown;
        try {
          output = await runAiTool(block.name as AiToolName, (block.input as Record<string, unknown>) ?? {});
        } catch (err) {
          output = { error: `Gagal memanggil data: ${err instanceof Error ? err.message : String(err)}` };
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
      }
      conversation.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal menghubungi Claude API: ${message}` }, { status: 502 });
  }

  if (finalText === null) {
    return NextResponse.json(
      { error: "Asisten tidak memberikan jawaban akhir dalam batas percakapan yang wajar — coba pertanyaan yang lebih spesifik." },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply: finalText, toolsUsed: [...toolsUsed] });
}
