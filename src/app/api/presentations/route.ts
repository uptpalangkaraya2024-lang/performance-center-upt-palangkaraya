import { NextResponse } from "next/server";

import { listSavedPresentations, upsertSavedPresentation } from "@/services/saved-presentations";
import type { PresentationSlide } from "@/types";

// List + create for saved Presentasi decks. GET/[id]/PUT/[id]/DELETE live in
// ./[id]/route.ts — this file only handles the collection-level verbs.
export const maxDuration = 30;

function isSlideArray(v: unknown): v is PresentationSlide[] {
  return Array.isArray(v) && v.every((s) => typeof s === "object" && s !== null && typeof (s as { title?: unknown }).title === "string");
}

export async function GET() {
  try {
    const list = await listSavedPresentations();
    return NextResponse.json({ presentations: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
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
    const saved = await upsertSavedPresentation({ name: name.trim(), slides });
    return NextResponse.json({ presentation: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
