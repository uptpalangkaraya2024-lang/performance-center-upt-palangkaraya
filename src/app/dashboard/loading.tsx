import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full rounded-2xl" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="gap-3 py-4">
            <CardHeader className="px-4">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
