import "server-only";

import type { MeetingScheduleData } from "@/types";

// Jadwal Rapat Rutin (feature #3) — data source not yet configured. The
// user will send a Google Sheet with the actual recurring-meeting
// schedule; once it arrives, this stub gets replaced with a real
// src/config/data-sources.ts entry + a parser following the same
// "load once, derive many" pattern every other module here uses (see
// src/services/renus.ts for the closest shape: one flat sheet of
// date-keyed rows). Kept as its own function now so the page already
// calls the real shape and needs no rewiring beyond this one file.
export async function getMeetingSchedule(): Promise<MeetingScheduleData> {
  return {
    rows: [],
    error: "Sumber data jadwal rapat rutin belum dikonfigurasi — menunggu file Google Sheet dari user.",
  };
}
