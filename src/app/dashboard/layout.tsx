import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// Deliberately NOT async / not fetching nav badge counts here — this layout
// wraps every dashboard route, including statically-generated ones (e.g.
// the various ComingSoon pages). An earlier version awaited getNavBadges()
// here directly and it blocked static generation for those pages (each
// build worker has its own module cache, so several ended up making live
// Apps Script calls during `next build`, some taking 60+ seconds). Badge
// counts are fetched client-side instead — see AppSidebar's own effect,
// which calls GET /api/nav-badges after mount so this layout, and every
// static page under it, stays fully static/instant.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="print:hidden">
        <AppSidebar />
      </div>
      <SidebarInset>
        <div className="print:hidden">
          <SiteHeader />
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
