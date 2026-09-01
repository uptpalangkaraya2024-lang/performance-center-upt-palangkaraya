import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Card>
        <CardContent className="py-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
