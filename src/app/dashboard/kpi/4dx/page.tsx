import { Target } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="4DX Performance"
      heroDescription="Overall score, lead & lag measures, target, achievement, dan tren mingguan/bulanan."
      message="Lead & lag measures 4DX akan tersedia setelah sumber data 4DX terintegrasi."
      icon={Target}
    />
  );
}
