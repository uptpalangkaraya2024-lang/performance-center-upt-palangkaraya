import { BatteryCharging } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="Asset Intelligence"
      heroDescription="Data aset yang dapat dicari, difilter, dan didetailkan lengkap dengan riwayat inspeksi."
      message="Pencarian dan riwayat inspeksi aset akan tersedia setelah sumber data aset terintegrasi."
      icon={BatteryCharging}
    />
  );
}
