import "server-only";

import { dataSources } from "@/config/data-sources";
import { getAboSnapshot } from "@/services/abo-shared";
import type { AboSnapshot } from "@/types";

export async function getAboHargiSnapshot(): Promise<AboSnapshot> {
  return getAboSnapshot(dataSources.aboHargi, "ABO Hargi", {
    fixedUltgOrder: ["PALANGKARAYA", "MUARA TEWEH", "PANGKALAN BUN"],
  });
}
