import { ClipboardList } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="RENUS"
      heroDescription="Program, target, realisasi, progress, PIC, deadline, dan priority RENUS UPT Palangkaraya."
      message="Progress program RENUS akan tersedia setelah sumber data RENUS terintegrasi."
      icon={ClipboardList}
    />
  );
}
