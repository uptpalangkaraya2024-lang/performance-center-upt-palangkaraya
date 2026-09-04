"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AhiCategory, AhiSectionSummary } from "@/types";
import { formatCount, formatPercent } from "./format";
import { AhiStatusBadge } from "./ahi-status-badge";

function CategoryCard({ category }: { category: AhiCategory }) {
  const [expanded, setExpanded] = useState(false);
  const { distribution } = category;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{category.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {formatCount(category.jumlahDataTercatat)} data · Kualitas {formatPercent(category.kualitasData)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums text-foreground">{formatPercent(category.score)}</span>
          <AhiStatusBadge status={category.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 border-t px-4 py-3">
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <div className="rounded-md bg-muted/50 py-1.5">
            <div className="font-semibold text-foreground">{formatCount(distribution.best)}</div>
            <div className="text-muted-foreground">1-Best</div>
          </div>
          <div className="rounded-md bg-muted/50 py-1.5">
            <div className="font-semibold text-foreground">{formatCount(distribution.good)}</div>
            <div className="text-muted-foreground">2-Good</div>
          </div>
          <div className="rounded-md bg-muted/50 py-1.5">
            <div className="font-semibold text-foreground">{formatCount(distribution.fair)}</div>
            <div className="text-muted-foreground">3-Fair</div>
          </div>
          <div className="rounded-md bg-warning/10 py-1.5">
            <div className="font-semibold text-warning-foreground">{formatCount(distribution.poor)}</div>
            <div className="text-muted-foreground">4-Poor</div>
          </div>
          <div className="rounded-md bg-critical/10 py-1.5">
            <div className="font-semibold text-critical">{formatCount(distribution.critical)}</div>
            <div className="text-muted-foreground">5-Critical</div>
          </div>
        </div>

        {category.parameters.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center justify-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Sembunyikan parameter" : `Lihat ${category.parameters.length} parameter pemeriksaan`}
          </button>
        ) : null}

        {expanded ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parameter</TableHead>
                  <TableHead className="text-right">Kosong</TableHead>
                  <TableHead className="text-right">1-Best</TableHead>
                  <TableHead className="text-right">2-Good</TableHead>
                  <TableHead className="text-right">3-Fair</TableHead>
                  <TableHead className="text-right">4-Poor</TableHead>
                  <TableHead className="text-right">5-Critical</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {category.parameters.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="whitespace-nowrap">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(p.kosong)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(p.best)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(p.good)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(p.fair)}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning-foreground">
                      {formatCount(p.poor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-critical">{formatCount(p.critical)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AhiCategoryDetail({ sections }: { sections: AhiSectionSummary[] }) {
  const searchParams = useSearchParams();
  // A Management Attention / Top Issue / GI correlation link can point here
  // with ?section=trafo (an AhiSectionKey) to open straight to that tab
  // instead of defaulting to the first one.
  const requestedSection = searchParams.get("section");
  const defaultValue = sections.some((s) => s.key === requestedSection) ? requestedSection! : sections[0]?.key;

  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        {sections.map((section) => (
          <TabsTrigger key={section.key} value={section.key}>
            {section.displayName.replace("AHI ", "")}
          </TabsTrigger>
        ))}
      </TabsList>
      {sections.map((section) => (
        <TabsContent key={section.key} value={section.key} className="mt-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {section.categories.map((category) => (
              <CategoryCard key={category.key} category={category} />
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
