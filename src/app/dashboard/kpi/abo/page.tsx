import { ShieldCheck } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="ABO Performance"
      heroDescription="Target, actual, achievement, tren bulanan, dan YTD performance ABO."
      message="Performance ABO akan tersedia setelah sumber data ABO terintegrasi."
      icon={ShieldCheck}
    />
  );
}
