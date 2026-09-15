import { AboPageShell } from "@/components/abo/abo-page-shell";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function AboPage() {
  const [proteksi, hargi] = await Promise.all([getAboProteksiSnapshot(), getAboHargiSnapshot()]);
  return <AboPageShell proteksi={proteksi} hargi={hargi} />;
}
