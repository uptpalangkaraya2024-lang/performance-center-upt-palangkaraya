import { PackageSearch } from "lucide-react";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-24 text-center">
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
