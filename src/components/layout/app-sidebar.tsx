"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { navGroups } from "@/config/nav";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

// A small "needs attention" count next to a nav entry — e.g. how many ABO
// programs or 4DX Lead Measures are currently "belum" — so a user can tell
// where to look without opening every module first. See src/lib/nav-badges.ts.
function NavBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto inline-flex min-w-4.5 items-center justify-center rounded-full bg-warning/25 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground group-data-[collapsible=icon]:hidden">
      {count}
    </span>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  // Fetched client-side after mount, not passed down from the layout — see
  // src/app/dashboard/layout.tsx for why. Starts empty so the sidebar
  // renders instantly; badges pop in a moment later once this resolves.
  const [badges, setBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/nav-badges")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (!cancelled) setBadges(data ?? {});
      })
      .catch(() => {
        // A badge count failing must never break the sidebar.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Sidebar collapsible="icon" className="border-none">
      {/* `relative isolate` makes this div the positioning AND stacking
          context for the gradient overlay below. Without `isolate`, the
          overlay's negative z-index escapes past the (unpositioned)
          bg-sidebar div from the shadcn Sidebar primitive and paints behind
          the sidebar's own *fixed* outer container instead — fully hidden
          under the solid --sidebar color, which is why the sidebar looked
          completely flat despite this div existing. */}
      <div className="relative isolate flex h-full flex-col">
        {/* A thin diagonal sheen, not a bold two-tone block — the sidebar
            stays this deep navy regardless of the light/dark toggle, it's a
            fixed structural element per the brand's visual identity. Just
            enough gradient to read as "not flat" without looking gaudy. */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "linear-gradient(160deg, rgba(255, 255, 255, 0.05) 0%, rgba(36, 87, 166, 0.16) 45%, rgba(17, 26, 94, 0) 100%)",
          }}
          aria-hidden
        />
        <SidebarHeader className="px-1 py-3.5">
          {/* min-w-0 is required here — a flex child's default min-width:auto
              would otherwise refuse to shrink below the wordmark's unwrapped
              width and silently overflow/clip past the sidebar's edge instead
              of wrapping or truncating (the classic flexbox text-overflow bug). */}
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 px-2 py-2">
            <span className="relative flex size-9 shrink-0 items-center justify-center">
              <Image
                src="/logo-mark.png"
                alt="Logo UPT Palangkaraya"
                width={36}
                height={36}
                className="object-contain"
                priority
              />
            </span>
            <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate bg-gradient-to-r from-sidebar-foreground to-brand bg-clip-text text-[15px] font-extrabold tracking-tight text-transparent">
                PERFORMANCE CENTER
              </span>
              <span className="truncate text-[11px] font-medium tracking-wide text-sidebar-foreground/60">
                UPT PALANGKARAYA
              </span>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="gap-1 px-1">
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-sidebar-foreground/45 text-[10px] font-semibold tracking-widest uppercase">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    // A parent with children shows the SUM across its children
                    // (each child also shows its own) — the parent's own href
                    // usually duplicates its first child's, so summing avoids
                    // double-counting that one entry while still surfacing the
                    // others (e.g. KPI shows ABO + 4DX combined).
                    const itemBadge = item.children
                      ? item.children.reduce((sum, c) => sum + (badges[c.href] ?? 0), 0)
                      : (badges[item.href] ?? 0);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={item.comingSoon ? `${item.title} (Coming Soon)` : item.title}
                          className={cn(
                            "rounded-md border-l-2 border-transparent transition-colors",
                            item.comingSoon ? "text-sidebar-foreground/50" : "text-sidebar-foreground/80",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            isActive &&
                              "border-brand bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                          )}
                          render={
                            <Link href={item.href}>
                              <item.icon />
                              <span>{item.title}</span>
                              {itemBadge > 0 ? <NavBadge count={itemBadge} /> : null}
                            </Link>
                          }
                        />
                        {item.children ? (
                          <SidebarMenuSub className="border-sidebar-border">
                            {item.children.map((child) => {
                              const childActive = pathname === child.href;
                              const childBadge = badges[child.href] ?? 0;
                              return (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton
                                    isActive={childActive}
                                    className={cn(
                                      child.comingSoon ? "text-sidebar-foreground/45" : "text-sidebar-foreground/70",
                                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                      childActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                                    )}
                                    render={
                                      <Link href={child.href}>
                                        <span>{child.title}</span>
                                        {childBadge > 0 ? <NavBadge count={childBadge} /> : null}
                                      </Link>
                                    }
                                  />
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </div>
    </Sidebar>
  );
}
