// Root-cause linking ("Penautan Otomatis Antar Modul") — cross-references
// each recent disturbance event against AHI/CE findings already on record
// at the SAME GI, surfacing a possible connection (e.g. "this trip
// happened at a GI that already had a Critical AHI finding") instead of
// leaving Gangguan, AHI, and CE as three siloed modules. A plain GI-level
// time-window join, not a causal claim — every link is presented as
// "worth checking," never as a confirmed cause, since nothing in these
// sheets records an actual causal chain.
import { canonicalGiKey } from "@/lib/gi-name";
import type { AhiAnomalyRecord, CeItem, DisturbanceBayEventRecord } from "@/types";

export interface RootCauseLink {
  event: DisturbanceBayEventRecord;
  relatedAhiFindings: AhiAnomalyRecord[];
  relatedCeFindings: CeItem[];
}

// A disturbance more than this many days old is no longer "recent enough"
// to usefully cross-reference against CURRENT open findings — old news by
// the time anyone would act on it.
const LOOKBACK_DAYS = 90;

function giMatches(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return canonicalGiKey(a) === canonicalGiKey(b);
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

/** Every recent disturbance event (within LOOKBACK_DAYS of `todayISO`) that
 *  has at least one AHI Poor/Critical finding or CE OPEN finding at the
 *  SAME GI — sorted most-recent-event-first. Events with no GI recorded,
 *  or with no related finding at all, are simply not included (there's
 *  nothing to link). */
export function findRootCauseLinks(params: {
  events: DisturbanceBayEventRecord[];
  anomalies: AhiAnomalyRecord[];
  ceItems: CeItem[];
  todayISO: string;
}): RootCauseLink[] {
  const { events, anomalies, ceItems, todayISO } = params;

  const recentEvents = events.filter((e) => {
    if (!e.gi) return false;
    const age = daysBetween(e.dateISO, todayISO);
    return age >= 0 && age <= LOOKBACK_DAYS;
  });

  const links: RootCauseLink[] = [];
  for (const event of recentEvents) {
    const relatedAhiFindings = anomalies.filter((a) => giMatches(a.gi, event.gi) && (a.kategoriAhi === 4 || a.kategoriAhi === 5));
    const relatedCeFindings = ceItems.filter((c) => !c.done && giMatches(c.gardu, event.gi));
    if (relatedAhiFindings.length > 0 || relatedCeFindings.length > 0) {
      links.push({ event, relatedAhiFindings, relatedCeFindings });
    }
  }

  return links.sort((a, b) => b.event.dateISO.localeCompare(a.event.dateISO));
}
