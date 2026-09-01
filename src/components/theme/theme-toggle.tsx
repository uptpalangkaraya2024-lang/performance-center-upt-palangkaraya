"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "theme";

export function ThemeToggle() {
  // Starts false on both server and client's first render to avoid a
  // hydration mismatch — the blocking inline script in layout.tsx already
  // set the real class on <html> before paint, this just syncs the icon
  // to match right after mount (see AGENTS.md note on useIsMobile()'s
  // hydration bug for why this can't read `document` in the initializer).
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Synced from the DOM after mount, not derived from render-time state —
    // same reasoning as useIsMobile()'s effect (see its comment): the real
    // value lives on `document.documentElement`, set by the blocking inline
    // script before hydration, so this only ever corrects the icon once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable, skip persisting */
    }
  }

  return (
    <Button variant="ghost" size="icon" className="size-8" aria-label="Ganti tema terang/gelap" onClick={toggle}>
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
