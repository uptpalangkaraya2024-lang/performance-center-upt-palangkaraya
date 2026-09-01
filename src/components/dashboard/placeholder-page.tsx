import { PackageSearch } from "lucide-react";
import { PageHero } from "./page-hero";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHero title={title} description={description} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-24 text-center">
        <PackageSearch className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Modul ini sedang dalam pengembangan</p>
          <p className="text-sm text-muted-foreground">
            Akan aktif setelah integrasi spreadsheet pada tahap berikutnya.
          </p>
        </div>
      </div>
    </div>
  );
}
