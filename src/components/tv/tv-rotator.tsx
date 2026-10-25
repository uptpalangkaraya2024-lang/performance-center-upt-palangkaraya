"use client";

// Rotation timer + kiosk chrome for TV mode (feature #2) — receives its
// panels already server-rendered (each one a reused homepage component, see
// src/app/tv/page.tsx) and only owns which one is currently visible and the
// live clock. Advances on its own; nothing here needs user interaction,
// though left/right arrow keys and a click still work for someone stood in
// front of the screen adjusting it.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

export interface TvPanel {
  title: string;
  content: React.ReactNode;
}

const ROTATE_SECONDS = 20;
// A long-running kiosk tab never naturally re-fetches server data on its
// own — force a full reload periodically so the figures shown don't drift
// stale over a multi-hour display session (force-dynamic re-fetches
// everything fresh on reload, same as a normal page visit).
const RELOAD_MINUTES = 15;

// The clock is read via useSyncExternalStore (React's own prescribed way
// to read a value that changes outside React's control) rather than
// useState+useEffect — ticking every second via setInterval is exactly the
// "subscribe for updates from an external system" case that hook exists
// for, and it renders a consistent server snapshot (null) during
// SSR/hydration with no synchronous setState-in-effect involved.
function subscribeClock(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}
function getClockSnapshot(): number {
  return Date.now();
}
function getServerClockSnapshot(): number {
  return 0;
}
function useClock(): Date | null {
  const ms = useSyncExternalStore(subscribeClock, getClockSnapshot, getServerClockSnapshot);
  return ms === 0 ? null : new Date(ms);
}

export function TvRotator({ panels }: { panels: TvPanel[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROTATE_SECONDS);
  const now = useClock();

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setIndex((i) => (i + 1) % panels.length);
          return ROTATE_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [panels.length]);

  useEffect(() => {
    const id = setTimeout(() => router.refresh(), RELOAD_MINUTES * 60 * 1000);
    return () => clearTimeout(id);
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        setIndex((i) => (i + 1) % panels.length);
        setSecondsLeft(ROTATE_SECONDS);
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => (i - 1 + panels.length) % panels.length);
        setSecondsLeft(ROTATE_SECONDS);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panels.length]);

  const panel = panels[index];
  if (!panel) return null;

  return (
    <div className="flex h-dvh w-dvw flex-col bg-background p-6">
      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Performance Center — UPT Palangkaraya</p>
          <h1 className="text-2xl font-extrabold text-foreground">{panel.title}</h1>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tabular-nums text-foreground">
            {now ? now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
          </p>
          <p className="text-xs text-muted-foreground">
            {now ? now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-5">{panel.content}</div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="flex items-center justify-center gap-2">
          {panels.map((p, i) => (
            <button
              key={p.title}
              type="button"
              onClick={() => {
                setIndex(i);
                setSecondsLeft(ROTATE_SECONDS);
              }}
              className={
                i === index
                  ? "h-2 w-8 rounded-full bg-primary transition-all"
                  : "h-2 w-2 rounded-full bg-border transition-all hover:bg-muted-foreground"
              }
              aria-label={p.title}
            />
          ))}
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${((ROTATE_SECONDS - secondsLeft) / ROTATE_SECONDS) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
