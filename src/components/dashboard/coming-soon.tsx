import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

import { PageHero } from "./page-hero";

// The one Coming Soon experience for every not-yet-integrated module —
// bounded card, not a near-empty full-height panel, so it reads as an
// intentional state rather than a broken/unfinished page. See AGENTS.md
// "COMING SOON" polish task.
export function ComingSoon({
  title,
  heroDescription,
  message,
  icon: Icon = Sparkles,
}: {
  /** Page title, shown in both the hero and the Coming Soon card. */
  title: string;
  /** Hero subtitle — what the module will eventually show. */
  heroDescription: string;
  /** One professional sentence explaining what's pending, tailored per module. */
  message: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHero title={title} description={heroDescription} />
      <div className="flex flex-1 items-center justify-center py-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-card px-8 py-10 text-center shadow-sm">
          <span className="flex size-14 items-center justify-center rounded-full bg-info/10 text-info">
            <Icon className="size-6" />
          </span>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-info uppercase">Coming Soon</p>
            <h2 className="mt-1.5 text-lg font-semibold text-foreground">{title}</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{message}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-3 py-1 text-xs font-medium text-info">
            <span className="size-1.5 rounded-full bg-info" />
            Data integration pending
          </span>
        </div>
      </div>
    </div>
  );
}
