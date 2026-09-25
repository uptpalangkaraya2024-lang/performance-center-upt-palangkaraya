"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  isError?: boolean;
}

const STARTER_PROMPTS = [
  "Apa yang perlu perhatian sekarang di UPT Palangkaraya?",
  "Bagaimana kinerja UPT bulan ini?",
  "Ada gangguan apa saja dan penyebab terbanyaknya?",
  "Status ABO dan CE minggu ini bagaimana?",
];

// Human-friendly labels for the tool-call names surfaced under an
// assistant reply — "sumber data" transparency per the system prompt's own
// rule, so a reader can see exactly which module's live data was used
// rather than just trusting free-form prose.
const TOOL_LABELS: Record<string, string> = {
  kinerja_upt: "Kinerja UPT",
  kinerja_ultg: "Kinerja ULTG",
  abo: "ABO",
  common_enemy: "Common Enemy",
  ahi: "AHI",
  gangguan: "Gangguan",
  wig_4dx: "4DX",
  renus: "RENUS",
  management_attention: "Management Attention",
};

export function AiAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) }),
        });
        const data = (await res.json()) as { reply?: string; toolsUsed?: string[]; error?: string };
        if (!res.ok || data.error) {
          setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "Terjadi kesalahan tak terduga.", isError: true }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "", toolsUsed: data.toolsUsed }]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`, isError: true },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="flex h-full min-h-[60vh] flex-col gap-3">
      <ScrollArea className="flex-1 rounded-xl border bg-card">
        <div ref={scrollRef} className="flex flex-col gap-4 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-3 py-6 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <p className="text-sm text-muted-foreground">
                Tanyakan apa saja seputar data operasional UPT Palangkaraya — jawaban selalu diambil dari data sistem, bukan tebakan.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : m.isError
                      ? "border border-critical/40 bg-critical/10 text-critical"
                      : "border bg-background text-foreground",
                )}
              >
                {m.isError ? (
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                    <TriangleAlert className="size-3.5" />
                    Gagal
                  </span>
                ) : null}
                {m.content}
              </div>
              {m.toolsUsed && m.toolsUsed.length > 0 ? (
                <p className="px-1 text-[11px] text-muted-foreground">
                  Sumber: {m.toolsUsed.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
                </p>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Mengambil data & menyusun jawaban...
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Tanya soal Kinerja UPT, Gangguan, ABO, CE, AHI, 4DX, RENUS..."
          className="min-h-11 flex-1 resize-none"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Kirim">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
