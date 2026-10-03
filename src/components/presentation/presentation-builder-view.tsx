"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, FilePlus, FolderOpen, Loader2, Save, Sparkles, Trash2, TriangleAlert, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PresentationMateriOption, PresentationSlide, SavedPresentation, SavedPresentationSummary } from "@/types";
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

function formatSavedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

/** The "Presentasi Tersimpan" browser at the top of the page — every saved
 *  deck as a row (name, slide count, last-updated), with Buka/Hapus per
 *  row and a "Presentasi Baru" reset so a user can keep several distinct
 *  presentations around and switch between them, per the user's own
 *  "bisa menambahkan presentasi yang lain juga sesuai kebutuhan" request. */
function SavedPresentationsPanel({
  savedList,
  savedListError,
  currentId,
  openLoadingId,
  deleteLoadingId,
  onOpen,
  onDelete,
  onNew,
}: {
  savedList: SavedPresentationSummary[];
  savedListError: string | null;
  currentId: string | null;
  openLoadingId: string | null;
  deleteLoadingId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-primary" />
          <p className="text-sm font-bold text-foreground">Presentasi Tersimpan</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onNew}>
          <FilePlus className="size-3.5" />
          Presentasi Baru
        </Button>
      </div>

      {savedListError ? (
        <p className="text-xs text-muted-foreground">
          Daftar presentasi tersimpan tidak dapat dimuat: {savedListError}
        </p>
      ) : savedList.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Belum ada presentasi tersimpan — susun slide di bawah lalu simpan untuk membukanya lagi nanti.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {savedList.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2",
                currentId === p.id ? "border-primary bg-primary/5" : "bg-muted/30",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.slideCount} slide · Diperbarui {formatSavedDate(p.updatedAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onOpen(p.id)}
                disabled={openLoadingId === p.id}
              >
                {openLoadingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
                Buka
              </Button>
              <button
                type="button"
                onClick={() => onDelete(p.id, p.name)}
                disabled={deleteLoadingId === p.id}
                aria-label={`Hapus ${p.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical disabled:opacity-50"
              >
                {deleteLoadingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PresentationBuilderView({
  catalog,
  initialSavedList,
  savedListError,
}: {
  catalog: PresentationMateriOption[];
  initialSavedList: SavedPresentationSummary[];
  savedListError: string | null;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stagedSlides, setStagedSlides] = useState<PresentationSlide[]>([]);
  const [instruction, setInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [savedList, setSavedList] = useState<SavedPresentationSummary[]>(initialSavedList);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openLoadingId, setOpenLoadingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  // Compared against the current {name, slides} on every render to drive
  // the "Perubahan belum disimpan" indicator and the confirm() guard before
  // a destructive open/reset — cheap enough at this deck's scale, and
  // avoids having to intercept every single mutation call site just to flip
  // one boolean. State, not a ref: reading a ref's `.current` during render
  // (as this comparison would, inside useMemo) trips the
  // react-hooks/refs lint rule — refs are for values the component itself
  // never reads while rendering, which this one is.
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify({ name: "", slides: [] }));
  const isDirty = useMemo(
    () => JSON.stringify({ name: currentName, slides: stagedSlides }) !== savedSnapshot,
    [currentName, stagedSlides, savedSnapshot],
  );

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

  async function refreshSavedList() {
    try {
      const res = await fetch("/api/presentations");
      const data = (await res.json()) as { presentations?: SavedPresentationSummary[] };
      if (res.ok && data.presentations) setSavedList(data.presentations);
    } catch {
      // Best-effort refresh only — the mutating call that triggered this
      // already surfaced its own error if something actually failed.
    }
  }

  function confirmDiscardIfDirty(message: string): boolean {
    if (!isDirty || stagedSlides.length === 0) return true;
    return window.confirm(message);
  }

  function startNewPresentation() {
    if (!confirmDiscardIfDirty("Ada perubahan yang belum disimpan. Mulai presentasi baru tanpa menyimpan?")) return;
    setStagedSlides([]);
    setSelectedIds(new Set());
    setCurrentId(null);
    setCurrentName("");
    setSaveError(null);
    setSavedSnapshot(JSON.stringify({ name: "", slides: [] }));
  }

  async function openSavedPresentation(id: string) {
    if (!confirmDiscardIfDirty("Ada perubahan yang belum disimpan pada presentasi saat ini. Buka presentasi lain tanpa menyimpan?")) return;
    setOpenLoadingId(id);
    setSaveError(null);
    try {
      const res = await fetch(`/api/presentations/${id}`);
      const data = (await res.json()) as { presentation?: SavedPresentation; error?: string };
      if (!res.ok || data.error || !data.presentation) {
        setSaveError(data.error ?? "Gagal membuka presentasi.");
        return;
      }
      setStagedSlides(data.presentation.slides);
      setSelectedIds(new Set());
      setCurrentId(data.presentation.id);
      setCurrentName(data.presentation.name);
      setSavedSnapshot(JSON.stringify({ name: data.presentation.name, slides: data.presentation.slides }));
    } catch (err) {
      setSaveError(`Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOpenLoadingId(null);
    }
  }

  async function saveCurrentPresentation(asNew: boolean) {
    if (stagedSlides.length === 0 || saveLoading) return;
    const name = currentName.trim() || "Presentasi Tanpa Nama";
    setSaveLoading(true);
    setSaveError(null);
    try {
      const isUpdate = currentId !== null && !asNew;
      const res = await fetch(isUpdate ? `/api/presentations/${currentId}` : "/api/presentations", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slides: stagedSlides }),
      });
      const data = (await res.json()) as { presentation?: SavedPresentation; error?: string };
      if (!res.ok || data.error || !data.presentation) {
        setSaveError(data.error ?? "Gagal menyimpan presentasi.");
        return;
      }
      setCurrentId(data.presentation.id);
      setCurrentName(data.presentation.name);
      setSavedSnapshot(JSON.stringify({ name: data.presentation.name, slides: data.presentation.slides }));
      await refreshSavedList();
    } catch (err) {
      setSaveError(`Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaveLoading(false);
    }
  }

  async function deleteSavedPresentationById(id: string, name: string) {
    if (!window.confirm(`Hapus presentasi "${name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeleteLoadingId(id);
    setSaveError(null);
    try {
      const res = await fetch(`/api/presentations/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setSaveError(data.error ?? "Gagal menghapus presentasi.");
        return;
      }
      setSavedList((prev) => prev.filter((p) => p.id !== id));
      // Keep the slides on screen even if the saved copy is gone — they're
      // just "unsaved" now (currentId cleared), not silently discarded.
      if (currentId === id) setCurrentId(null);
    } catch (err) {
      setSaveError(`Gagal menghubungi server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleteLoadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SavedPresentationsPanel
        savedList={savedList}
        savedListError={savedListError}
        currentId={currentId}
        openLoadingId={openLoadingId}
        deleteLoadingId={deleteLoadingId}
        onOpen={openSavedPresentation}
        onDelete={deleteSavedPresentationById}
        onNew={startNewPresentation}
      />

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
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 print:hidden">
              <Input
                value={currentName}
                onChange={(e) => setCurrentName(e.target.value)}
                placeholder="Nama presentasi..."
                className="max-w-xs bg-background"
              />
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => saveCurrentPresentation(false)}
                disabled={saveLoading}
              >
                {saveLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {currentId ? "Simpan Perubahan" : "Simpan Presentasi"}
              </Button>
              {currentId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => saveCurrentPresentation(true)}
                  disabled={saveLoading}
                >
                  <Copy className="size-3.5" />
                  Simpan sebagai Baru
                </Button>
              ) : null}
              {isDirty ? (
                <span className="text-xs font-medium text-warning-foreground">Perubahan belum disimpan</span>
              ) : currentId ? (
                <span className="text-xs text-success">Tersimpan</span>
              ) : null}
            </div>

            {saveError ? (
              <div className="flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/10 p-3 text-sm text-critical print:hidden">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {saveError}
              </div>
            ) : null}

            <PresentationSlideDeck
              slides={stagedSlides}
              title={currentName.trim() || "Presentasi UPT Palangkaraya"}
              onUpdateSlide={updateSlide}
              onRemoveSlide={removeSlide}
              onMoveSlide={moveSlide}
            />
          </>
        )}
      </div>
    </div>
  );
}
