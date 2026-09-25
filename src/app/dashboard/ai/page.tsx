import { PageHero } from "@/components/dashboard/page-hero";
import { AiAssistantChat } from "@/components/ai/ai-assistant-chat";

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="AI Assistant"
        description="Tanya jawab operasional berbasis data sistem — setiap jawaban diambil langsung dari modul terkait (Kinerja UPT/ULTG, Gangguan, ABO, CE, AHI, 4DX, RENUS), dengan sumber data yang selalu ditampilkan."
      />
      <AiAssistantChat />
    </div>
  );
}
