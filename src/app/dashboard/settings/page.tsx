import { Settings as SettingsIcon } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="Settings"
      heroDescription="Pengelolaan sumber data, konfigurasi KPI, user, threshold, dan sistem."
      message="Pengaturan sistem akan tersedia pada tahap pengembangan berikutnya."
      icon={SettingsIcon}
    />
  );
}
