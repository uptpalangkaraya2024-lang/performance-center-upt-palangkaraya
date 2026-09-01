"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function AppSidebar() {
  const pathname = usePathname();

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
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={item.title}
                          className={cn(
                            "text-sidebar-foreground/80 rounded-md border-l-2 border-transparent transition-colors",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            isActive &&
                              "border-brand bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                          )}
                          render={
                            <Link href={item.href}>
                              <item.icon />
                              <span>{item.title}</span>
                            </Link>
                          }
                        />
                        {item.children ? (
                          <SidebarMenuSub className="border-sidebar-border">
                            {item.children.map((child) => {
                              const childActive = pathname === child.href;
                              return (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton
                                    isActive={childActive}
                                    className={cn(
                                      "text-sidebar-foreground/70",
                                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                      childActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                                    )}
                                    render={
                                      <Link href={child.href}>
                                        <span>{child.title}</span>
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
