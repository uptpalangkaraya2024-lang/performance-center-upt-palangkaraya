import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Network,
  Zap,
  ListChecks,
  Gauge,
  BatteryCharging,
  ClipboardList,
  DatabaseZap,
  Sparkles,
  Settings,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  children?: { title: string; href: string }[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Monitoring",
    items: [
      { title: "Kinerja UPT", href: "/dashboard/performance/upt", icon: Building2 },
      { title: "Kinerja ULTG", href: "/dashboard/performance/ultg", icon: Network },
      { title: "Gangguan", href: "/dashboard/disturbances", icon: Zap },
      { title: "Open Case", href: "/dashboard/open-cases", icon: ListChecks },
    ],
  },
  {
    label: "Performance",
    items: [
      {
        title: "KPI",
        href: "/dashboard/kpi/abo",
        icon: Gauge,
        children: [
          { title: "ABO", href: "/dashboard/kpi/abo" },
          { title: "4DX", href: "/dashboard/kpi/4dx" },
          { title: "CE", href: "/dashboard/kpi/ce" },
          { title: "AHI", href: "/dashboard/kpi/ahi" },
        ],
      },
    ],
  },
  {
    label: "Asset",
    items: [{ title: "Data Aset", href: "/dashboard/assets", icon: BatteryCharging }],
  },
  {
    label: "Planning",
    items: [{ title: "RENUS", href: "/dashboard/renus", icon: ClipboardList }],
  },
  {
    label: "Data",
    items: [
      { title: "Data & Sync", href: "/dashboard/data-sync", icon: DatabaseZap },
      { title: "AI Assistant", href: "/dashboard/ai", icon: Sparkles },
    ],
  },
  {
    label: "System",
    items: [{ title: "Settings", href: "/dashboard/settings", icon: Settings }],
  },
];

// Flat list retained for places that need every route regardless of
// grouping (e.g. global search) — derived from navGroups so the two never
// drift apart.
export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);
