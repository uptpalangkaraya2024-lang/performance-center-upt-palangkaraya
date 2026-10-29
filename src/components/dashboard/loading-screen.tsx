import Image from "next/image";

import { cn } from "@/lib/utils";

/** Branded loading screen — the real UPT Palangkaraya logo breathing at
 *  the center of two counter-rotating conic-gradient rings (brand's own
 *  navy/orange, same colors as the sidebar's own wordmark gradient), a
 *  soft pulsing glow behind it, and three radar-style pings expanding
 *  outward — used everywhere a whole page's content is still loading, in
 *  place of the plain gray skeleton that used to sit there. Keyframes
 *  live in src/app/globals.css (loading-ring-spin/-reverse, loading-
 *  breathe, loading-glow, loading-ping, loading-dot-bounce) so they're
 *  defined once, globally, rather than inlined per instance.
 *
 *  `compact` is for a smaller IN-PAGE loading region (e.g. one tab/panel
 *  of an already-rendered page, like AHI's own Report tab) — same look,
 *  scaled down, so a sub-section loading doesn't compete for attention
 *  with a full-size logo the way one would in a tight space. Every
 *  whole-page Suspense fallback across this app uses the default
 *  (non-compact) size, for one consistent "this page is loading" moment
 *  no matter which page it is — previously some pages fell back to their
 *  own bespoke skeleton the instant their OWN inner Suspense boundary
 *  took over from the route-level loading.tsx, so the brand animation
 *  would flash briefly then get replaced by plain boxes; this component
 *  is now what every one of those inner fallbacks renders too, closing
 *  that gap. Pure CSS, no JS animation library — this is the first thing
 *  a visitor sees before any page content has loaded, so it can't itself
 *  depend on anything slow to initialize. */
export function LoadingScreen({ label = "Memuat data", compact = false }: { label?: string; compact?: boolean }) {
  const ringSize = compact ? "size-28" : "size-44";
  const logoSize = compact ? "size-16" : "size-28";
  const imagePx = compact ? 44 : 76;
  const minHeight = compact ? "min-h-[28vh]" : "min-h-[65vh]";

  return (
    <div className={cn("flex flex-col items-center justify-center gap-7 py-16", minHeight)}>
      <div className={cn("relative flex items-center justify-center", ringSize)}>
        {/* Radar pings — three, staggered, continuously expanding outward. */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border-2"
            style={{
              borderColor: "var(--primary)",
              animation: "loading-ping 2.8s cubic-bezier(0,0.4,0.6,1) infinite",
              animationDelay: `${i * 0.9}s`,
            }}
            aria-hidden
          />
        ))}
        {/* Soft blurred glow, breathing behind everything else. */}
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: "var(--gradient-accent)",
            animation: "loading-glow 2.4s ease-in-out infinite",
          }}
          aria-hidden
        />
        {/* Outer ring, spinning one way. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, var(--primary), var(--brand), var(--primary))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))",
            animation: "loading-ring-spin 2.4s linear infinite",
          }}
          aria-hidden
        />
        {/* Inner ring, spinning the other way and faster — the two visibly
            counter-rotate against each other instead of reading as one. */}
        <div
          className="absolute inset-3 rounded-full"
          style={{
            background: "conic-gradient(from 90deg, var(--brand), var(--primary), var(--brand))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            animation: "loading-ring-spin-reverse 1.6s linear infinite",
          }}
          aria-hidden
        />
        {/* The logo itself, gently breathing in place. */}
        <div
          className={cn("relative flex items-center justify-center rounded-full bg-card shadow-xl", logoSize)}
          style={{ animation: "loading-breathe 2.4s ease-in-out infinite" }}
        >
          <Image
            src="/logo-mark.png"
            alt="Performance Center UPT Palangkaraya"
            width={imagePx}
            height={imagePx}
            priority
            className="object-contain"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <p className={cn("font-bold tracking-wide text-foreground", compact ? "text-sm" : "text-base")}>{label}</p>
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn("rounded-full bg-primary", compact ? "size-1.5" : "size-2")}
              style={{ animation: "loading-dot-bounce 1.2s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
