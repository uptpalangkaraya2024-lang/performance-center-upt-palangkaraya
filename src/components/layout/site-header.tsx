"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Search, Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/command-palette";
import { AiAssistantChat } from "@/components/ai/ai-assistant-chat";
import type { AppNotification } from "@/lib/notifications";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // Fetched client-side after mount, same non-blocking pattern as the
  // sidebar's nav badges (see src/components/layout/app-sidebar.tsx) —
  // starts empty so the header renders instantly, real notifications pop
  // in once /api/notifications resolves.
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setNotifications(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // A notification failing to load must never break the header.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="relative hidden max-w-sm flex-1 items-center rounded-md border bg-card px-2.5 h-9 text-left text-sm text-muted-foreground hover:bg-muted sm:flex"
      >
        <Search className="mr-2 size-4 shrink-0" />
        <span className="flex-1">Cari GI, Trafo, Gangguan, Case...</span>
        <kbd className="ml-2 hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
          Ctrl K
        </kbd>
      </button>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" className="size-8" aria-label="AI Assistant" onClick={() => setAiOpen(true)}>
          <Sparkles className="size-4" />
        </Button>
        <Sheet open={aiOpen} onOpenChange={setAiOpen}>
          <SheetContent className="flex w-full flex-col gap-3 sm:max-w-lg">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                AI Assistant
              </SheetTitle>
              <SheetDescription>Tanya jawab operasional berbasis data sistem UPT Palangkaraya.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-hidden px-4 pb-4">
              <AiAssistantChat />
            </div>
          </SheetContent>
        </Sheet>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="relative size-8" aria-label="Notifikasi">
                <Bell className="size-4" />
                {notifications.length > 0 && (
                  <span
                    className={
                      "absolute top-1 right-1 size-1.5 rounded-full " +
                      (notifications.some((n) => n.severity === "critical") ? "bg-critical" : "bg-warning")
                    }
                  />
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notifikasi</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                Tidak ada notifikasi saat ini
              </DropdownMenuItem>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem key={n.id} render={<Link href={n.href} />} className="flex-col items-start gap-0.5">
                  <span className="text-sm">{n.text}</span>
                  <span className="text-xs text-muted-foreground">{n.detail}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="h-8 gap-2 px-1.5">
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px]">UP</AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline">UPT Palangkaraya</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Akun</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profil</DropdownMenuItem>
            <DropdownMenuItem>Pengaturan</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Keluar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
