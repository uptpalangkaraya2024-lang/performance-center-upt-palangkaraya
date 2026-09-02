import { Network } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="Kinerja ULTG"
      heroDescription="Tabel KPI, target, actual, achievement, ranking, dan gap to target tiap ULTG."
      message="Ranking dan gap to target tiap ULTG akan tersedia setelah sumber data ULTG terintegrasi."
      icon={Network}
    />
  );
}
