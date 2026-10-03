"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, TriangleAlert, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PresentationChartSpec, PresentationSlide } from "@/types";

interface AiEditPatch {
  title: string | null;
  bullets: string[] | null;
  newCharts: PresentationChartSpec[];
  removeChartTitles: string[];
  sourceNote: string | null;
}

const AI_EDIT_EXAMPLES = ["Tambahkan grafik rekap gangguan dan paretonya", "Tambahkan poin tentang rencana tindak lanjut"];

/** The inline editor that opens on a slide when its pencil button is
 *  clicked (presentation-slide-deck.tsx) — manual fields (title/subtitle/
 *  bullets/which precomputed charts are shown) PLUS a free-text AI command
 *  box for exactly the case manual editing can't cover: pulling in a chart
 *  from a DIFFERENT module's data that this slide never had to begin with
 *  (e.g. "tambahkan grafik rekap gangguan dan paretonya" on a Kinerja UPT
 *  slide). An AI edit updates this panel's own draft state, not the slide
 *  directly — "Simpan" commits everything at once, so a few AI edits can be
 *  chained and reviewed before anything actually changes on the deck. */
export function SlideEditorPanel({
  slide,
  onSave,
  onCancel,
}: {
  slide: PresentationSlide;
  onSave: (patch: Partial<PresentationSlide>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(slide.title);
  const [subtitle, setSubtitle] = useState(slide.subtitle ?? "");
  const [bulletsText, setBulletsText] = useState(slide.bullets.join("\n"));
  const [activeChartIds, setActiveChartIds] = useState<string[]>(slide.activeChartIds ?? []);
  const [chartOptions, setChartOptions] = useState<PresentationChartSpec[]>(slide.chartOptions ?? []);
  const [sourceNote, setSourceNote] = useState(slide.sourceNote ?? "");

  const [instruction, setInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  function toggleChart(id: string) {
    setActiveChartIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handleSave() {
    onSave({
      title: title.trim() || slide.title,
      subtitle: subtitle.trim() || undefined,
      bullets: bulletsText
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean),
      chartOptions: chartOptions.length > 0 ? chartOptions : undefined,
      activeChartIds: activeChartIds.length > 0 ? activeChartIds : undefined,
      sourceNote: sourceNote.trim() || null,
    });
  }

  async function runAiEdit() {
    const trimmed = instruction.trim();
    if (!trimmed || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/presentation-slide-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slide: {
            title,
            subtitle,
            bullets: bulletsText
              .split("\n")
              .map((b) => b.trim())
              .filter(Boolean),
            charts: chartOptions.map((c) => ({ title: c.title, type: c.type })),
          },
          instruction: trimmed,
        }),
      });
      const data = (await res.json()) as { patch?: AiEditPatch; error?: string };
      if (!res.ok || data.error || !data.patch) {
        setAiError(data.error ?? "Terjadi kesalahan tak terduga.");
        return;
      }
      const patch = data.patch;
      // Existing charts stay unless the AI explicitly named them in
      // removeChartTitles — the AI was told to send only NEW charts, never
      // reproduce the whole set, so "merge" here just means "append" plus
      // an opt-in removal list, never a wholesale replace.
      const keptCharts = chartOptions.filter((c) => !patch.removeChartTitles.includes(c.title ?? ""));
      const nextChartOptions = [...keptCharts, ...patch.newCharts];
      const keptActiveIds = activeChartIds.filter((id) => keptCharts.some((c) => c.id === id));
      const nextActiveChartIds = [...keptActiveIds, ...patch.newCharts.map((c) => c.id)];

      if (patch.title !== null) setTitle(patch.title);
      if (patch.bullets !== null) setBulletsText(patch.bullets.join("\n"));
      setChartOptions(nextChartOptions);
      setActiveChartIds(nextActiveChartIds);
      if (patch.sourceNote !== null) setSourceNote(patch.sourceNote);
      setInstruction("");
    } catch (err) {
      setAiError(`Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3 print:hidden">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Judul Slide
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Subjudul (opsional)
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="—" />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
        Poin-poin (satu baris = satu poin)
        <Textarea value={bulletsText} onChange={(e) => setBulletsText(e.target.value)} className="min-h-24 resize-y" />
      </label>

      {chartOptions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Grafik yang ditampilkan di slide ini</p>
          <div className="flex flex-wrap gap-2">
            {chartOptions.map((c) => {
              const active = activeChartIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChart(c.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {active ? <Check className="size-3" /> : null}
                  {c.title ?? c.type}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Atau perintahkan AI untuk mengubah slide ini
        </div>
        <div className="flex flex-wrap gap-2">
          {AI_EDIT_EXAMPLES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setInstruction(p)}
              className="rounded-full border bg-background px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='Contoh: "tambahkan grafik rekap gangguan dan paretonya"'
            className="min-h-16 flex-1 resize-none bg-background"
            disabled={aiLoading}
          />
          <Button type="button" size="sm" className="gap-1.5" onClick={runAiEdit} disabled={aiLoading || !instruction.trim()}>
            {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            Terapkan
          </Button>
        </div>
        {aiLoading ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Mengambil data & menerapkan perubahan...
          </p>
        ) : null}
        {aiError ? (
          <div className="flex items-start gap-1.5 rounded-md border border-critical/40 bg-critical/10 p-2 text-xs text-critical">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {aiError}
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Batal
        </Button>
        <Button type="button" size="sm" onClick={handleSave}>
          Simpan
        </Button>
      </div>
    </div>
  );
}
