"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PresentationSlide } from "@/types";
import { SlideBody } from "./slide-body";
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

/**
 * Renders a composed deck two ways at once — a stacked, printable list (one
 * section per slide, `print:break-after-page`) and an on-demand fullscreen
 * "Mulai Presentasi" overlay with prev/next + keyboard navigation — the same
 * pattern already proven for Gangguan's own Mode Presentasi
 * (src/components/disturbances/disturbance-presentation-view.tsx), reused
 * here so a cross-module deck feels native to the rest of the app instead of
 * introducing a second, different presentation UX.
 */
export function PresentationSlideDeck({ slides, title }: { slides: PresentationSlide[]; title: string }) {
  useLandscapePrint();
  const [mode, setMode] = useState<"edit" | "present">("edit");
  const [activeSlide, setActiveSlide] = useState(0);

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
        {slides.map((s) => (
          <section
            key={s.id}
            className="flex min-h-[60vh] flex-col gap-4 rounded-2xl border bg-card p-6 print:min-h-[calc(100vh-24mm)] print:break-after-page print:rounded-none print:border-0 print:shadow-none"
          >
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{s.title}</h2>
              {s.subtitle ? <p className="text-base text-muted-foreground">{s.subtitle}</p> : null}
            </div>
            <SlideBody slide={s} />
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
