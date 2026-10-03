import "server-only";

import { ApiError, GoogleGenAI, type Content, type GenerateContentResponse, type Part } from "@google/genai";

// Shared Gemini tool-calling round-trip, extracted out of
// src/app/api/ai-assistant/route.ts so the new presentation assistant
// (src/app/api/presentation-assistant/route.ts) doesn't have to duplicate
// the model-fallback/retry logic — see that file's own history for why it's
// not just a hardcoded model name (gemini-2.5-flash got retired mid-session,
// its suggested replacement then hit a sustained 503 "high demand").
const MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

export function isRetryableGeminiError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 503 || err.status === 429);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      currentModel.name = attempt.model;
      return response;
    } catch (err) {
      lastErr = err;
      if (!isRetryableApiError(err)) throw err;
    }
  }
  throw lastErr;
}

function isRetryableApiError(err: unknown): boolean {
  return isRetryableGeminiError(err);
}

export interface GeminiToolDef {
  name: string;
  description: string;
  parameters: object;
}

export interface GeminiToolChatResult {
  /** Null only if the round cap was hit without a final text answer. */
  finalText: string | null;
  toolsUsed: string[];
}

/**
 * Runs a full tool-calling conversation against Gemini: sends `initialContents`,
 * executes any function calls the model makes via `runTool`, feeds the results
 * back, and repeats until the model gives a plain-text final answer (or
 * `maxRounds` is hit). Used by both /api/ai-assistant (chat) and
 * /api/presentation-assistant (one-shot slide-plan instruction) — same
 * grounding contract either way: every operational fact the model states has
 * to come from a tool call, never training-data memory.
 */
export async function runGeminiToolChat({
  apiKey,
  systemPrompt,
  initialContents,
  tools,
  runTool,
  maxRounds = 6,
}: {
  apiKey: string;
  systemPrompt: string;
  initialContents: Content[];
  tools: GeminiToolDef[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxRounds?: number;
}): Promise<GeminiToolChatResult> {
  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = [...initialContents];
  const toolsUsed = new Set<string>();
  const currentModel = { name: MODEL };
  let finalText: string | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const response = await generateContentWithRetry(
      ai,
      {
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [
            {
              functionDeclarations: tools.map((t) => ({
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

    const modelContent = response.candidates?.[0]?.content;
    contents.push(modelContent ?? { role: "model", parts: functionCalls.map((fc) => ({ functionCall: fc })) });

    const responseParts: Part[] = [];
    for (const call of functionCalls) {
      toolsUsed.add(call.name ?? "");
      let output: unknown;
      try {
        output = await runTool(call.name ?? "", call.args ?? {});
      } catch (err) {
        output = { error: `Gagal memanggil data: ${err instanceof Error ? err.message : String(err)}` };
      }
      responseParts.push({ functionResponse: { id: call.id, name: call.name, response: { output } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return { finalText, toolsUsed: [...toolsUsed] };
}
