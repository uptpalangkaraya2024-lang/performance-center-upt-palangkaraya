"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Maximize2, Pencil, Printer, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PresentationSlide } from "@/types";
import { SlideBody } from "./slide-body";
import { SlideEditorPanel } from "./slide-editor-panel";
import { ExportPptxButton } from "./export-pptx-button";

/** Injects `@page { size: landscape; }` only while this view is mounted —
 *  same precedent as disturbance-presentation-view.tsx's own
 *  useLandscapePrint (not a global globals.css rule, since that would also
 *  affect every other page's own print flow). */
function useLandscapePrint() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "@page { size: landscape; margin: 12mm; }";
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

/** Move-up / move-down / edit / delete, attached directly to the slide they
 *  act on — per explicit user feedback that the old top-of-page "Slide
 *  Terpilih" list forced scrolling back up for every edit. Hidden from print
 *  and from the fullscreen "present" mode (that view is for presenting to an
 *  audience, not editing). */
function SlideToolbar({
  isFirst,
  isLast,
  isEditing,
  onMoveUp,
  onMoveDown,
  onToggleEdit,
  onRemove,
}: {
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 print:hidden">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={isFirst}
        aria-label="Pindahkan slide ke atas"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={isLast}
        aria-label="Pindahkan slide ke bawah"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown className="size-4" />
      </button>
      <button
        type="button"
        onClick={onToggleEdit}
        aria-label="Ubah slide"
        className={cn(
          "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
          isEditing && "bg-muted text-foreground",
        )}
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Hapus slide"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * Renders a composed deck two ways at once — a stacked, printable, EDITABLE
 * list (one section per slide, each with its own move/edit/delete controls)
 * and an on-demand fullscreen "Mulai Presentasi" overlay with prev/next +
 * keyboard navigation — the same pattern already proven for Gangguan's own
 * Mode Presentasi (src/components/disturbances/disturbance-presentation-view.tsx),
 * reused here so a cross-module deck feels native to the rest of the app
 * instead of introducing a second, different presentation UX.
 */
export function PresentationSlideDeck({
  slides,
  title,
  onUpdateSlide,
  onRemoveSlide,
  onMoveSlide,
}: {
  slides: PresentationSlide[];
  title: string;
  onUpdateSlide: (id: string, patch: Partial<PresentationSlide>) => void;
  onRemoveSlide: (id: string) => void;
  onMoveSlide: (id: string, direction: "up" | "down") => void;
}) {
  useLandscapePrint();
  const [mode, setMode] = useState<"edit" | "present">("edit");
  const [activeSlide, setActiveSlide] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const clampSlide = useCallback((i: number) => Math.max(0, Math.min(slides.length - 1, i)), [slides.length]);

  useEffect(() => {
    if (mode !== "present") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") setActiveSlide((i) => clampSlide(i + 1));
      else if (e.key === "ArrowLeft") setActiveSlide((i) => clampSlide(i - 1));
      else if (e.key === "Escape") setMode("edit");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, clampSlide]);

  if (slides.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <p className="text-sm font-bold tracking-wide text-foreground uppercase">
          Preview Presentasi · {slides.length} slide
        </p>
        <div className="ml-auto flex items-center gap-2">
          <ExportPptxButton slides={slides} title={title} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Cetak / Simpan PDF
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setActiveSlide(0);
              setMode("present");
            }}
          >
            <Maximize2 className="size-3.5" />
            Mulai Presentasi
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {slides.map((s, i) => (
          <section
            key={s.id}
            className="flex min-h-[60vh] flex-col gap-4 rounded-2xl border bg-card p-6 print:min-h-[calc(100vh-24mm)] print:break-after-page print:rounded-none print:border-0 print:shadow-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-1 text-sm font-bold tabular-nums text-muted-foreground print:hidden">{i + 1}.</span>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{s.title}</h2>
                  {s.subtitle ? <p className="text-base text-muted-foreground">{s.subtitle}</p> : null}
                </div>
                {s.aiGenerated ? (
                  <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary print:hidden">
                    <Sparkles className="size-2.5" />
                    AI
                  </span>
                ) : null}
              </div>
              <SlideToolbar
                isFirst={i === 0}
                isLast={i === slides.length - 1}
                isEditing={editingId === s.id}
                onMoveUp={() => onMoveSlide(s.id, "up")}
                onMoveDown={() => onMoveSlide(s.id, "down")}
                onToggleEdit={() => setEditingId((prev) => (prev === s.id ? null : s.id))}
                onRemove={() => {
                  if (editingId === s.id) setEditingId(null);
                  onRemoveSlide(s.id);
                }}
              />
            </div>

            {editingId === s.id ? (
              <SlideEditorPanel
                slide={s}
                onSave={(patch) => {
                  onUpdateSlide(s.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <SlideBody slide={s} />
            )}
          </section>
        ))}
      </div>

      {mode === "present" ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background p-8 sm:p-12">
          <button
            type="button"
            onClick={() => setMode("edit")}
            aria-label="Keluar dari mode presentasi"
            className="absolute top-5 right-5 z-10 flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>

          <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 overflow-y-auto">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{slides[activeSlide].title}</h2>
              {slides[activeSlide].subtitle ? (
                <p className="text-base text-muted-foreground sm:text-lg">{slides[activeSlide].subtitle}</p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              <SlideBody slide={slides[activeSlide]} />
            </div>
          </div>

          <div className="mx-auto mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSlide((i) => clampSlide(i - 1))}
              disabled={activeSlide === 0}
              className="flex size-10 items-center justify-center rounded-full border bg-card text-foreground disabled:opacity-30"
              aria-label="Slide sebelumnya"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-16 text-center text-sm tabular-nums text-muted-foreground">
              {activeSlide + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => setActiveSlide((i) => clampSlide(i + 1))}
              disabled={activeSlide === slides.length - 1}
              className="flex size-10 items-center justify-center rounded-full border bg-card text-foreground disabled:opacity-30"
              aria-label="Slide berikutnya"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
