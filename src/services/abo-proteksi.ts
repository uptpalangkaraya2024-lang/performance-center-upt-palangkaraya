import "server-only";

import { dataSources } from "@/config/data-sources";
import { getAboSnapshot } from "@/services/abo-shared";
import type { AboSnapshot } from "@/types";

export async function getAboProteksiSnapshot(): Promise<AboSnapshot> {
  return getAboSnapshot(dataSources.aboProteksi, "ABO Proteksi");
}
