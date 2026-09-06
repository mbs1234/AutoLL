import { Experience } from '@/api/ll';
import { ParkTime } from '@/datetime';
import kvdb from '@/kvdb';
import { key } from '@/storageKeys';

/**
 * Learning the real drop schedule from what the poller sees.
 *
 * The hardcoded drop times in src/api/data/wdw.ts are maintained by hand from
 * third-party reports, and the best of those sources bucket their observations
 * to five minutes. Autopilot, meanwhile, is already watching the tipboard at
 * up to one-second resolution whenever it runs. Recording the moments
 * availability actually appears -- and, crucially, *when the poller was
 * looking* -- lets the schedule be checked and corrected from first-hand
 * evidence rather than trusted.
 *
 * Two signals count as a drop:
 *  - an attraction goes from unavailable to available;
 *  - its earliest offered return time jumps *earlier* by a meaningful amount,
 *    which is what a release of new inventory does to the tipboard even when
 *    the attraction was already available.
 *
 * Coverage is recorded alongside events so that "never observed at 15:47" is
 * only ever claimed for days on which the poller was actually running at 15:47.
 */

export const EVENTS_KEY = key('autopilot.dropEvents');
export const COVERAGE_KEY = key('autopilot.coverage');

/** How much earlier the next available time must move to count as a drop. */
export const EARLIER_THRESHOLD_MIN = 15;
/** Bound on stored events; oldest are discarded first. */
export const MAX_EVENTS = 1000;
/** Coverage is tracked in buckets this many minutes wide. */
export const COVERAGE_BUCKET_MIN = 5;
/** Coverage is kept for this many distinct park days. */
export const MAX_COVERAGE_DAYS = 30;
/**
 * Observations this close together are one drop. Polling lands at or just
 * after the release, never before, so a cluster is labelled by its *earliest*
 * minute -- the one nearest the true release time.
 */
export const CLUSTER_TOLERANCE_MIN = 2;

export interface DropEvent {
  experienceId: string;
  /** Park date. */
  date: string;
  /** Park time, HH:MM. */
  time: string;
  kind: 'appeared' | 'earlier';
}

export type Snapshot = Map<string, { available: boolean; next?: ParkTime }>;

/** Minutes since the park day began (4am), which orders correctly across midnight. */
export function dayMinutes(time: ParkTime): number {
  return Math.floor(+time / 60);
}

/** Inverse of dayMinutes. */
export function fromDayMinutes(minutes: number): ParkTime {
  const hour = (ParkTime.dayStart.hour + Math.floor(minutes / 60)) % 24;
  return new ParkTime(hour, minutes % 60);
}

export function snapshotOf(experiences: Experience[]): Snapshot {
  const snap: Snapshot = new Map();
  for (const exp of experiences) {
    if (!exp.flex) continue;
    snap.set(exp.id, {
      available: !!exp.flex.available,
      next: exp.flex.nextAvailableTime,
    });
  }
  return snap;
}

/**
 * Drops that happened between two consecutive polls.
 *
 * An attraction with no entry in the previous snapshot has no baseline and is
 * skipped: the first poll of a session sees everything as "new", which is not
 * a drop.
 */
/**
 * Availability flips worth learning from, restricted to what is being watched.
 *
 * `watchedIds` is the bound that keeps this honest. Recording every attraction
 * on the tipboard sounds strictly better -- more evidence -- but the events
 * feed `learnedDropTimes`, which promotes any minute seen on two distinct days
 * into a burst target. Away from a scheduled drop, an availability flip is
 * somebody cancelling, and cancellations happen all day across a whole park.
 * A promoted one buys a four-minute burst band at 1.2s for an attraction
 * nobody asked about, which costs battery and rate-limit headroom and helps
 * nothing.
 *
 * Watched attractions are also the only ones the schedule is ever consulted
 * for, so nothing actionable is lost.
 */
export function detectDropEvents(
  prev: Snapshot,
  next: Snapshot,
  now: ParkTime,
  date: string,
  watchedIds?: ReadonlySet<string>
): DropEvent[] {
  const time = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  const events: DropEvent[] = [];
  for (const [experienceId, n] of next) {
    if (watchedIds && !watchedIds.has(experienceId)) continue;
    const p = prev.get(experienceId);
    if (!p) continue;
    if (!p.available && n.available) {
      events.push({ experienceId, date, time, kind: 'appeared' });
    } else if (p.available && n.available && p.next && n.next) {
      const earlierBy = (+p.next - +n.next) / 60;
      if (earlierBy >= EARLIER_THRESHOLD_MIN) {
        events.push({ experienceId, date, time, kind: 'earlier' });
      }
    }
  }
  return events;
}

/** Which 5-minute buckets of which park days the poller was running for. */
export type Coverage = Record<string, number[]>;

export function coverageBucket(time: ParkTime): number {
  return Math.floor(dayMinutes(time) / COVERAGE_BUCKET_MIN);
}

/**
 * Note that the poller was active at `now` on `date`.
 *
 * Returns the new coverage and whether anything changed, so callers can skip
 * a save (and a summary recompute) on the overwhelmingly common no-change
 * tick. Prunes to the most recent MAX_COVERAGE_DAYS park days.
 */
export function recordCoverage(
  coverage: Coverage,
  date: string,
  now: ParkTime
): { coverage: Coverage; changed: boolean } {
  const bucket = coverageBucket(now);
  const existing = coverage[date] ?? [];
  if (existing.includes(bucket)) return { coverage, changed: false };
  // Numeric comparator on purpose: the default sort is lexicographic and would
  // order [132, 60] as-is.
  const next: Coverage = {
    ...coverage,
    [date]: [...existing, bucket].sort((a, b) => a - b),
  };
  const dates = Object.keys(next).sort();
  for (const stale of dates.slice(
    0,
    Math.max(0, dates.length - MAX_COVERAGE_DAYS)
  )) {
    delete next[stale];
  }
  return { coverage: next, changed: true };
}

export interface ObservedDrop {
  /** Earliest minute in the cluster: the one nearest the true release. */
  time: ParkTime;
  /** Distinct park days on which this drop was seen. */
  days: number;
  /** Total events in the cluster. */
  count: number;
}

export interface ScheduledDropCheck {
  time: ParkTime;
  /** Days a drop was observed at (or just after) this scheduled time. */
  observedDays: number;
  /** Days the poller was actually watching at this time. */
  coveredDays: number;
}

export interface DropSummary {
  experienceId: string;
  observed: ObservedDrop[];
  scheduled: ScheduledDropCheck[];
}

function parseEventMinutes(event: DropEvent): number | undefined {
  try {
    return dayMinutes(ParkTime.from(event.time));
  } catch {
    return undefined;
  }
}

/**
 * Cluster observations per attraction and check them against the schedule.
 *
 * Pure. Attractions with events but no schedule entry are still reported, so a
 * ride that drops on a schedule nobody wrote down becomes visible; scheduled
 * attractions with no events report every scheduled time with zero observed
 * days, which is only meaningful alongside its coveredDays.
 */
export function summarizeDrops(
  events: DropEvent[],
  coverage: Coverage,
  schedule: Map<string, ParkTime[]>
): DropSummary[] {
  const byExp = new Map<string, { minutes: number; date: string }[]>();
  for (const event of events) {
    const minutes = parseEventMinutes(event);
    if (minutes === undefined) continue;
    const list = byExp.get(event.experienceId) ?? [];
    list.push({ minutes, date: event.date });
    byExp.set(event.experienceId, list);
  }

  const ids = new Set([...byExp.keys(), ...schedule.keys()]);
  const summaries: DropSummary[] = [];

  for (const experienceId of ids) {
    const obs = (byExp.get(experienceId) ?? []).sort(
      (a, b) => a.minutes - b.minutes
    );

    // Greedy clustering on sorted minutes.
    const observed: ObservedDrop[] = [];
    let cluster: { start: number; dates: Set<string>; count: number } | null =
      null;
    for (const o of obs) {
      if (cluster && o.minutes - cluster.start <= CLUSTER_TOLERANCE_MIN) {
        cluster.dates.add(o.date);
        cluster.count += 1;
      } else {
        if (cluster) {
          observed.push({
            time: fromDayMinutes(cluster.start),
            days: cluster.dates.size,
            count: cluster.count,
          });
        }
        cluster = { start: o.minutes, dates: new Set([o.date]), count: 1 };
      }
    }
    if (cluster) {
      observed.push({
        time: fromDayMinutes(cluster.start),
        days: cluster.dates.size,
        count: cluster.count,
      });
    }

    const scheduled: ScheduledDropCheck[] = (
      schedule.get(experienceId) ?? []
    ).map(time => {
      const m = dayMinutes(time);
      // A drop scheduled for :47 is typically observed at :47 or :48, and
      // occasionally a minute early when the clock offset is slightly off.
      const lo = m - 1;
      const hi = m + CLUSTER_TOLERANCE_MIN + 1;
      const observedDates = new Set(
        obs.filter(o => o.minutes >= lo && o.minutes <= hi).map(o => o.date)
      );
      const bucket = coverageBucket(time);
      const coveredDates = Object.entries(coverage).filter(
        ([, buckets]) =>
          buckets.includes(bucket) || buckets.includes(bucket + 1)
      );
      return {
        time,
        observedDays: observedDates.size,
        coveredDays: coveredDates.length,
      };
    });

    summaries.push({ experienceId, observed, scheduled });
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// Storage. Not day-scoped: the whole point is accumulating evidence across
// visits.

export function loadDropEvents(): DropEvent[] {
  const stored = kvdb.get<DropEvent[]>(EVENTS_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    e =>
      typeof e?.experienceId === 'string' &&
      typeof e.date === 'string' &&
      typeof e.time === 'string' &&
      (e.kind === 'appeared' || e.kind === 'earlier')
  );
}

/** Append and cap, keeping the newest. */
export function appendDropEvents(events: DropEvent[]): DropEvent[] {
  if (events.length === 0) return loadDropEvents();
  const all = [...loadDropEvents(), ...events].slice(-MAX_EVENTS);
  kvdb.set<DropEvent[]>(EVENTS_KEY, all);
  return all;
}

export function loadCoverage(): Coverage {
  const stored = kvdb.get<Coverage>(COVERAGE_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const out: Coverage = {};
  for (const [date, buckets] of Object.entries(stored)) {
    if (Array.isArray(buckets)) {
      out[date] = buckets.filter(b => Number.isInteger(b));
    }
  }
  return out;
}

export function saveCoverage(coverage: Coverage): void {
  kvdb.set<Coverage>(COVERAGE_KEY, coverage);
}
