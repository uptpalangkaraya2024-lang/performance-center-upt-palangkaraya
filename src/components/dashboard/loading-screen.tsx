import Image from "next/image";

/** Branded loading screen — a rotating conic-gradient ring (brand's own
 *  navy/orange, same colors as the sidebar's own wordmark gradient) and a
 *  soft pulsing glow behind the real UPT Palangkaraya logo, the logo
 *  itself gently breathing — used by every route-level loading.tsx (see
 *  src/app/dashboard/loading.tsx) in place of the generic skeleton
 *  placeholder that used to sit there, per the user's own request for
 *  something more engaging to look at during a page load. Keyframes live
 *  in src/app/globals.css (loading-ring-spin/loading-breathe/loading-glow/
 *  loading-dot-bounce) so they're defined once, globally, rather than
 *  inlined per instance. Pure CSS, no JS animation library — this is the
 *  one thing a visitor sees before any page content (including this
 *  app's own usual data) has loaded, so it can't itself depend on
 *  anything slow to initialize. */
export function LoadingScreen({ label = "Memuat data" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-16">
      <div className="relative flex size-28 items-center justify-center">
        {/* Soft blurred glow, breathing behind everything else. */}
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: "var(--gradient-accent)",
            animation: "loading-glow 2.4s ease-in-out infinite",
          }}
          aria-hidden
        />
        {/* Rotating ring — a conic gradient masked down to just its own
            outer band, so it reads as a spinning ring rather than a
            spinning disc. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, var(--primary), var(--brand), var(--primary))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))",
            animation: "loading-ring-spin 2.2s linear infinite",
          }}
          aria-hidden
        />
        {/* The logo itself, gently breathing in place. */}
        <div
          className="relative flex size-16 items-center justify-center rounded-full bg-card shadow-lg"
          style={{ animation: "loading-breathe 2.4s ease-in-out infinite" }}
        >
          <Image src="/logo-mark.png" alt="Performance Center UPT Palangkaraya" width={44} height={44} priority className="object-contain" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-primary"
              style={{ animation: "loading-dot-bounce 1.2s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
