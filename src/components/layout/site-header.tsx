"use client";

import { useState } from "react";
import { Bell, Search, Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/command-palette";
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

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="relative hidden max-w-sm flex-1 items-center rounded-md border bg-background px-2.5 h-9 text-left text-sm text-muted-foreground hover:bg-muted sm:flex"
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
        <Button variant="ghost" size="icon" className="size-8" aria-label="AI Assistant">
          <Sparkles className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="relative size-8" aria-label="Notifikasi">
                <Bell className="size-4" />
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-critical" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notifikasi</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex-col items-start gap-0.5">
              <span className="text-sm">3 Open Case overdue</span>
              <span className="text-xs text-muted-foreground">10 menit lalu</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-col items-start gap-0.5">
              <span className="text-sm">2 aset masuk kategori Critical</span>
              <span className="text-xs text-muted-foreground">1 jam lalu</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-col items-start gap-0.5">
              <span className="text-sm">Data gangguan belum diperbarui 6 jam</span>
              <span className="text-xs text-muted-foreground">2 jam lalu</span>
            </DropdownMenuItem>
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
