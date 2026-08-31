import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Network,
  Zap,
  ListChecks,
  Gauge,
  BatteryCharging,
  Sparkles,
  DatabaseZap,
  Settings,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  children?: { title: string; href: string }[];
}

export const navItems: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Kinerja UPT", href: "/dashboard/performance/upt", icon: Building2 },
  { title: "Kinerja ULTG", href: "/dashboard/performance/ultg", icon: Network },
  { title: "Gangguan", href: "/dashboard/disturbances", icon: Zap },
  { title: "Open Case", href: "/dashboard/open-cases", icon: ListChecks },
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
  { title: "Asset", href: "/dashboard/assets", icon: BatteryCharging },
  { title: "RENUS", href: "/dashboard/renus", icon: ListChecks },
  { title: "AI Assistant", href: "/dashboard/ai", icon: Sparkles },
  { title: "Data & Sync", href: "/dashboard/data-sync", icon: DatabaseZap },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];
