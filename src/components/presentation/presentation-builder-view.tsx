"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Loader2, Sparkles, TriangleAlert, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PresentationMateriOption, PresentationSlide } from "@/types";
import { PresentationSlideDeck } from "./presentation-slide-deck";

const AI_STARTER_EXAMPLES = [
  "Slide 1: rekap gangguan bulan ini. Slide 2: bagaimana cara mengatasi penyebab gangguan terbanyak tersebut.",
  "Buatkan 1 slide kesimpulan kinerja UPT secara umum berdasarkan seluruh modul yang ada.",
];

/** A materi's slide(s) go into the deck as an independent COPY the moment
 *  its checkbox is checked — editing that copy afterward (title, bullets,
 *  which chart is shown) never reaches back into the catalog, so toggling
 *  the checkbox off and back on always gives a fresh, un-edited version
 *  again, and editing one slide never affects another checkbox's slides. */
function cloneSlide(s: PresentationSlide): PresentationSlide {
  return {
    ...s,
    bullets: [...s.bullets],
    stats: s.stats?.map((x) => ({ ...x })),
    table: s.table ? { headers: [...s.table.headers], rows: s.table.rows.map((r) => [...r]) } : undefined,
    chartOptions: s.chartOptions?.map((c) => ({ ...c, data: [...c.data] })),
    activeChartIds: s.activeChartIds ? [...s.activeChartIds] : undefined,
  };
}

/** One selectable card in the materi picker — "data" materi toggle on/off
 *  directly (slides already computed server-side); "ai-prompt" materi (only
 *  "Kendala & Usulan" today) have no slides of their own, so its card offers
 *  a shortcut into the AI Assistant box below instead of a checkbox, per the
 *  user's own framing: AI is for exactly the content no module tracks as data. */
function MateriCard({
  option,
  selected,
  onToggle,
  onUseAiPrompt,
}: {
  option: PresentationMateriOption;
  selected: boolean;
  onToggle: () => void;
  onUseAiPrompt: (prompt: string) => void;
}) {
  const unavailable = option.kind === "data" && option.slides.length === 0;

  if (option.kind === "ai-prompt") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">{option.label}</p>
            <p className="text-xs text-muted-foreground">{option.description}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit gap-1.5"
          onClick={() => onUseAiPrompt(option.suggestedPrompt ?? "")}
        >
          <Wand2 className="size-3.5" />
          Isi instruksi AI
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={unavailable ? undefined : onToggle}
      disabled={unavailable}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
        unavailable
          ? "cursor-not-allowed opacity-50"
          : selected
            ? "border-primary bg-primary/10"
            : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
      >
        {selected ? <Check className="size-3" /> : null}
      </span>
      <div>
        <p className="text-sm font-bold text-foreground">{option.label}</p>
        <p className="text-xs text-muted-foreground">
          {unavailable ? "Data tidak tersedia saat ini." : option.description}
        </p>
      </div>
    </button>
  );
}

export function PresentationBuilderView({ catalog }: { catalog: PresentationMateriOption[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stagedSlides, setStagedSlides] = useState<PresentationSlide[]>([]);
  const [instruction, setInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, PresentationMateriOption[]>();
    for (const option of catalog) {
      const list = byGroup.get(option.group) ?? [];
      list.push(option);
      byGroup.set(option.group, list);
    }
    return [...byGroup.entries()];
  }, [catalog]);

  function toggleMateri(option: PresentationMateriOption) {
    const wasSelected = selectedIds.has(option.id);
    const nextIds = new Set(selectedIds);
    if (wasSelected) nextIds.delete(option.id);
    else nextIds.add(option.id);
    setSelectedIds(nextIds);

    if (wasSelected) {
      const ownedIds = new Set(option.slides.map((s) => s.id));
      setStagedSlides((prev) => prev.filter((s) => !ownedIds.has(s.id)));
    } else {
      setStagedSlides((prev) => [...prev, ...option.slides.map(cloneSlide)]);
    }
  }

  function removeSlide(id: string) {
    const owner = catalog.find((o) => o.slides.some((s) => s.id === id));
    if (owner) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(owner.id);
        return next;
      });
    }
    setStagedSlides((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSlide(id: string, patch: Partial<PresentationSlide>) {
    setStagedSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  // "Menggeser" a slide up/down one position — a reliable click target
  // beats a drag handle for a deck that's often a dozen+ slides tall, and
  // it's what the user explicitly asked for.
  function moveSlide(id: string, direction: "up" | "down") {
    setStagedSlides((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  function useAiPrompt(prompt: string) {
    setInstruction(prompt);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function generateWithAi() {
    const trimmed = instruction.trim();
    if (!trimmed || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/presentation-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: trimmed }),
      });
      const data = (await res.json()) as { slides?: PresentationSlide[]; error?: string };
      if (!res.ok || data.error || !data.slides) {
        setAiError(data.error ?? "Terjadi kesalahan tak terduga.");
        return;
      }
      setStagedSlides((prev) => [...prev, ...data.slides!]);
      setInstruction("");
    } catch (err) {
      setAiError(`Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-bold tracking-wide text-foreground uppercase">1. Pilih Materi Presentasi</p>
        {grouped.map(([group, options]) => (
          <div key={group} className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((option) => (
                <MateriCard
                  key={option.id}
                  option={option}
                  selected={selectedIds.has(option.id)}
                  onToggle={() => toggleMateri(option)}
                  onUseAiPrompt={useAiPrompt}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">2. AI Assistant — untuk materi yang belum tersedia sebagai data</p>
            <p className="text-xs text-muted-foreground">
              Ketik rencana slide dalam bahasa natural (mis. &quot;slide 1: rekap gangguan, slide 2: bagaimana mengatasi gangguan
              tersebut&quot;) — AI akan mengambil data nyata lewat modul terkait, menyertakan grafik bila relevan, dan menyusun
              analisis berdasar data tsb untuk slide yang butuh rekomendasi/kesimpulan. Sudah ada slide di bawah? Buka tombol
              pensil pada slide itu sendiri untuk perintah AI yang lebih spesifik (mis. &quot;tambahkan grafik ...&quot;).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {AI_STARTER_EXAMPLES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setInstruction(p)}
              className="rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='Contoh: "slide 1: rekap gangguan, slide 2: bagaimana mengatasi gangguan tersebut, slide 3: kesimpulan"'
            className="min-h-20 flex-1 resize-none"
            disabled={aiLoading}
          />
          <Button type="button" className="gap-1.5" onClick={generateWithAi} disabled={aiLoading || !instruction.trim()}>
            {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Buat Slide
          </Button>
        </div>

        {aiLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Mengambil data & menyusun slide...
          </p>
        ) : null}

        {aiError ? (
          <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/10 p-3 text-sm text-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {aiError}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold tracking-wide text-foreground uppercase">
          3. Slide Presentasi {stagedSlides.length > 0 ? `(${stagedSlides.length})` : ""}
        </p>
        {stagedSlides.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Pilih materi di atas atau gunakan AI Assistant untuk mulai menyusun presentasi.
          </p>
        ) : (
          <PresentationSlideDeck
            slides={stagedSlides}
            title="Presentasi UPT Palangkaraya"
            onUpdateSlide={updateSlide}
            onRemoveSlide={removeSlide}
            onMoveSlide={moveSlide}
          />
        )}
      </div>
    </div>
  );
}
