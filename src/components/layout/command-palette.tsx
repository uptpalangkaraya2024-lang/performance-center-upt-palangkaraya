"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { navGroups } from "@/config/nav";

// Turns the previously decorative sidebar search input into a real
// navigation search — every module (Active or Coming Soon) is reachable by
// typing its name, no separate data fetch needed since it only searches
// src/config/nav.ts (the same list the sidebar itself renders from). Open
// state is controlled by the caller (SiteHeader) so both the search bar
// click and the Ctrl/Cmd+K shortcut drive the same dialog.
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cari Halaman"
      description="Cari dan buka halaman dashboard"
    >
      <Command>
        <CommandInput placeholder="Cari GI, Trafo, Gangguan, Case..." />
        <CommandList>
          <CommandEmpty>Tidak ada halaman yang cocok.</CommandEmpty>
          {navGroups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem key={item.href} value={item.title} onSelect={() => go(item.href)}>
                  <item.icon />
                  <span>{item.title}</span>
                  {item.comingSoon ? <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span> : null}
                </CommandItem>
              ))}
              {group.items.flatMap((item) =>
                (item.children ?? []).map((child) => (
                  <CommandItem key={child.href} value={`${item.title} ${child.title}`} onSelect={() => go(child.href)}>
                    <span className="ml-6">{child.title}</span>
                    {child.comingSoon ? <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span> : null}
                  </CommandItem>
                )),
              )}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
