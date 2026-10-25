"use client";

// Calendar subscription entry point (feature #5) — surfaces the .ics feed
// URL so staff can add it to whatever calendar app they already use
// (Google Calendar "From URL", Apple Calendar "New Calendar Subscription",
// Outlook "Subscribe from web") instead of needing a new app. Computed
// client-side from window.location.origin since the feed must point at
// THIS deployment's own host, not a hardcoded domain.
import { useState, useSyncExternalStore } from "react";
import { Calendar, Check, Copy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// window.location.origin never changes for the life of the page, so this
// is read via useSyncExternalStore rather than useState+useEffect — the
// React-recommended way to read a browser-only value that must still
// render something consistent during SSR/hydration (an empty
// subscribe/unsubscribe pair, since the value truly never changes here).
function subscribe() {
  return () => {};
}
function getOriginSnapshot(): string {
  return window.location.origin;
}
function getServerOriginSnapshot(): string {
  return "";
}

export function CalendarSubscribeCard() {
  const origin = useSyncExternalStore(subscribe, getOriginSnapshot, getServerOriginSnapshot);
  const [copied, setCopied] = useState(false);

  const icsUrl = origin ? `${origin}/api/calendar/renus.ics` : "";
  const webcalUrl = icsUrl.replace(/^https?:\/\//, "webcal://");

  async function copyUrl() {
    if (!icsUrl) return;
    try {
      await navigator.clipboard.writeText(icsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (older browser, non-HTTPS) — the
      // URL is still visible/selectable in the input below either way.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base font-extrabold">
          <Calendar className="size-4.5 text-primary" />
          Langganan Kalender Jadwal Padam
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tambahkan jadwal padam RENUS ke kalender HP/komputer — pengingat muncul otomatis di kalender yang sudah
          dipakai, tanpa aplikasi baru.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={icsUrl || "Memuat..."}
            onFocus={(e) => e.currentTarget.select()}
            className="h-8 flex-1 rounded-lg border bg-muted/40 px-2.5 text-xs text-foreground"
          />
          <Button type="button" size="sm" variant="outline" onClick={copyUrl} disabled={!icsUrl} className="gap-1.5">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Tersalin" : "Salin"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <a
            href={webcalUrl || undefined}
            className="rounded-full border bg-muted/40 px-2.5 py-1 font-medium text-foreground hover:bg-muted"
          >
            Buka di Aplikasi Kalender
          </a>
          <a
            href={icsUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icsUrl)}` : undefined}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border bg-muted/40 px-2.5 py-1 font-medium text-foreground hover:bg-muted"
          >
            Tambahkan ke Google Calendar
          </a>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Apple Calendar: Berkas → Kalender Baru → Langganan Kalender, lalu tempel tautan di atas. Outlook: Tambah
          Kalender → Berlangganan dari web.
        </p>
      </CardContent>
    </Card>
  );
}
