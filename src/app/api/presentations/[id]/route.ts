import { NextResponse } from "next/server";

import { deleteSavedPresentation, getSavedPresentation, upsertSavedPresentation } from "@/services/saved-presentations";
import type { PresentationSlide } from "@/types";

export const maxDuration = 30;

function isSlideArray(v: unknown): v is PresentationSlide[] {
  return Array.isArray(v) && v.every((s) => typeof s === "object" && s !== null && typeof (s as { title?: unknown }).title === "string");
}

// params is a Promise in this Next.js version (route handlers were made
// async-params starting Next 15) — see node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/dynamic-routes.md.
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const presentation = await getSavedPresentation(id);
    if (!presentation) {
      return NextResponse.json({ error: "Presentasi tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ presentation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body permintaan tidak valid." }, { status: 400 });
  }

  const name = (body as { name?: unknown })?.name;
  const slides = (body as { slides?: unknown })?.slides;
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Nama presentasi tidak boleh kosong." }, { status: 400 });
  }
  if (!isSlideArray(slides) || slides.length === 0) {
    return NextResponse.json({ error: "Presentasi harus memiliki minimal 1 slide." }, { status: 400 });
  }

  try {
    const existing = await getSavedPresentation(id);
    if (!existing) {
      return NextResponse.json({ error: "Presentasi tidak ditemukan." }, { status: 404 });
    }
    const saved = await upsertSavedPresentation({ id, name: name.trim(), slides });
    return NextResponse.json({ presentation: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await deleteSavedPresentation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
