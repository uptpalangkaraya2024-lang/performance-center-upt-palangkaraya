import { NextResponse } from "next/server";
import { getNavBadges } from "@/lib/nav-badges";

// Called client-side by AppSidebar after mount — deliberately not fetched
// from src/app/dashboard/layout.tsx directly, since that layout wraps every
// dashboard route (including statically-generated ones) and awaiting this
// there blocked static generation for pages that have nothing to do with
// ABO/4DX. Client-side keeps every page's own render fully static/instant;
// badges simply pop in a moment after the sidebar mounts.
export const maxDuration = 60;

export async function GET() {
  const badges = await getNavBadges();
  return NextResponse.json(badges);
}
