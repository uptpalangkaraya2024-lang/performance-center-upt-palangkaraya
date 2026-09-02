import { Sparkles } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      title="AI Assistant"
      heroDescription="Tanya jawab operasional berbasis data sistem, dengan sumber dan periode data yang jelas."
      message="Fitur ini sedang dipersiapkan untuk integrasi data operasional."
      icon={Sparkles}
    />
  );
}
