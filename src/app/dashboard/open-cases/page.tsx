import { ListChecks } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="Open Case Monitoring"
      heroDescription="Daftar gangguan/case yang belum selesai lengkap dengan status, age, due date, dan priority."
      message="Monitoring open case akan tersedia setelah sumber data operasional terintegrasi."
      icon={ListChecks}
    />
  );
}
