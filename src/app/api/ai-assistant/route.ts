import { ApiError, GoogleGenAI, type Content, type GenerateContentResponse, type Part } from "@google/genai";
import { NextResponse } from "next/server";

import { AI_ASSISTANT_TOOLS, runAiTool, type AiToolName } from "@/lib/ai-assistant-tools";

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

// A hardcoded version number turned out to churn fast: gemini-2.5-flash was
// rejected live ("no longer available to new users"), and its suggested
// replacement gemini-3.8-flash then came back 503 "high demand" (a brand-new
// model's launch-week capacity crunch). "gemini-flash-latest" is Google's
// own alias for "whichever flash model is currently the recommended,
// generally-available one" — it sidesteps this exact version-pin churn
// instead of chasing it again next time a model gets retired/replaced.
//
// Even the alias hit a sustained 503 "high demand" live (confirmed across
// several retries a minute apart — not a one-off blip), which free-tier
// flash capacity is apparently prone to. FALLBACK_MODEL gives one more
// shot on a separate, usually-less-congested capacity pool before giving up.
const MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

function isRetryableApiError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 503 || err.status === 429);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calls generateContent against MODEL, retrying a transient 503/429 with a
 *  short backoff, then falling back to FALLBACK_MODEL for the rest of this
 *  request if MODEL is still unavailable — rather than failing the whole
 *  question over what Google itself calls a "usually temporary" spike. */
async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
  currentModel: { name: string },
): Promise<GenerateContentResponse> {
  const attempts: { model: string; delayMs: number }[] = [
    { model: currentModel.name, delayMs: 0 },
    { model: currentModel.name, delayMs: 1500 },
    { model: FALLBACK_MODEL, delayMs: 0 },
    { model: FALLBACK_MODEL, delayMs: 1500 },
  ];
  let lastErr: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) await sleep(attempt.delayMs);
    try {
      const response = await ai.models.generateContent({ ...params, model: attempt.model });
      currentModel.name = attempt.model; // stick with whichever model actually answered for the rest of this request
      return response;
    } catch (err) {
      lastErr = err;
      if (!isRetryableApiError(err)) throw err;
    }
  }
  throw lastErr;
}

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

  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const toolsUsed = new Set<string>();

  // Tool-use loop: Gemini may call one or more tools before giving a final
  // text answer. Capped at a handful of round-trips as a safety net against
  // a runaway loop — every tool here is a fast, cheap read (existing service
  // caches), so this cap is generous relative to how many calls a real
  // question ever needs.
  const MAX_ROUNDS = 6;
  let finalText: string | null = null;
  const currentModel = { name: MODEL };

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await generateContentWithRetry(
        ai,
        {
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [
              {
                functionDeclarations: AI_ASSISTANT_TOOLS.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.parameters,
                })),
              },
            ],
          },
        },
        currentModel,
      );

      const functionCalls = response.functionCalls ?? [];
      if (functionCalls.length === 0) {
        finalText = (response.text ?? "").trim();
        break;
      }

      // Echo the model's own function-call turn back into the conversation
      // before appending the results — Gemini expects to see its own
      // request alongside the matching response on the next turn.
      const modelContent = response.candidates?.[0]?.content;
      contents.push(modelContent ?? { role: "model", parts: functionCalls.map((fc) => ({ functionCall: fc })) });

      const responseParts: Part[] = [];
      for (const call of functionCalls) {
        const name = call.name as AiToolName;
        toolsUsed.add(name);
        let output: unknown;
        try {
          output = await runAiTool(name, call.args ?? {});
        } catch (err) {
          output = { error: `Gagal memanggil data: ${err instanceof Error ? err.message : String(err)}` };
        }
        responseParts.push({ functionResponse: { id: call.id, name: call.name, response: { output } } });
      }
      contents.push({ role: "user", parts: responseParts });
    }
  } catch (err) {
    if (isRetryableApiError(err)) {
      return NextResponse.json(
        { error: "Layanan Gemini sedang mengalami lonjakan permintaan tinggi (masalah sementara dari Google, bukan konfigurasi Anda) — coba lagi dalam beberapa saat." },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal menghubungi Gemini API: ${message}` }, { status: 502 });
  }

  if (finalText === null) {
    return NextResponse.json(
      { error: "Asisten tidak memberikan jawaban akhir dalam batas percakapan yang wajar — coba pertanyaan yang lebih spesifik." },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply: finalText, toolsUsed: [...toolsUsed] });
}
