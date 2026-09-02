import { Gauge } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="CE Performance"
      heroDescription="Target, actual, achievement, tren bulanan, YTD, dan gap CE."
      message="Performance CE akan tersedia setelah sumber data CE terintegrasi."
      icon={Gauge}
    />
  );
}
