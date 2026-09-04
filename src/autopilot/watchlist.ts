import { Experience, FlexExperience } from '@/api/ll';
import { ParkTime } from '@/datetime';
import kvdb from '@/kvdb';

export const WATCHLIST_KEY = 'bg1.autopilot.watchlist';

export interface WatchTarget {
  experienceId: string;
  /** Earliest acceptable return time, inclusive. */
  after?: ParkTime;
  /** Latest acceptable return time, inclusive. */
  before?: ParkTime;
  /**
   * Book this automatically when it appears within the window.
   *
   * Opt-in per attraction, and off by default: alerting is cheap to get wrong
   * while booking is not, so the two are deliberately separate decisions.
   */
  autoBook?: boolean;
}

export interface WatchHit {
  target: WatchTarget;
  experience: FlexExperience;
  returnTime: ParkTime;
}

/**
 * An experience with a Lightning Lane actually on offer.
 *
 * `FlexExperience` only makes `flex` required -- `nextAvailableTime` stays
 * optional within it -- so it is not enough to guarantee a return time. This
 * narrows both, which is the invariant a `WatchHit` depends on.
 */
type FlexOffer = FlexExperience & {
  flex: FlexExperience['flex'] & { nextAvailableTime: ParkTime };
};

function hasFlexOffer(exp: Experience): exp is FlexOffer {
  return !!exp.flex?.available && !!exp.flex.nextAvailableTime;
}

/**
 * Whether a return time falls inside a target's window.
 *
 * Comparison goes through `ParkTime.valueOf()`, which measures from a 4am day
 * start, so a window ending after midnight still orders correctly.
 */
export function inWindow(returnTime: ParkTime, target: WatchTarget): boolean {
  if (target.after && +returnTime < +target.after) return false;
  if (target.before && +returnTime > +target.before) return false;
  return true;
}

/**
 * Watched experiences that are bookable right now within their window.
 *
 * Pure: takes the experience list the poller just fetched and returns matches,
 * so the interesting logic is testable without a clock, a network, or React.
 */
export function matchWatchList(
  experiences: Experience[],
  targets: WatchTarget[]
): WatchHit[] {
  if (targets.length === 0) return [];
  const byId = new Map(targets.map(t => [t.experienceId, t]));
  const hits: WatchHit[] = [];
  for (const experience of experiences) {
    const target = byId.get(experience.id);
    if (!target) continue;
    // `experienced` means the party has already used this attraction or hit
    // its limit, so an offer here is not actually bookable.
    if (experience.experienced) continue;
    if (!hasFlexOffer(experience)) continue;
    const returnTime = experience.flex.nextAvailableTime;
    if (!inWindow(returnTime, target)) continue;
    hits.push({ target, experience, returnTime });
  }
  return hits;
}

/**
 * Pick which hits are newly worth alerting on.
 *
 * Alerts are edge-triggered, keyed on experience id: in burst mode the poller
 * ticks about once a second, so alerting on every matching tick would fire
 * sixty notifications a minute for one available ride. An experience alerts
 * when it starts matching, stays quiet while it keeps matching, and becomes
 * eligible again only after it stops matching (sold out, moved outside the
 * window, or got booked).
 *
 * Returns the next "already alerted" set alongside the hits to fire, so the
 * caller holds the state and this stays a pure function.
 */
export function selectNewAlerts(
  hits: WatchHit[],
  alreadyAlerted: ReadonlySet<string>
): { toAlert: WatchHit[]; alerted: Set<string> } {
  const alerted = new Set(hits.map(h => h.experience.id));
  const toAlert = hits.filter(h => !alreadyAlerted.has(h.experience.id));
  return { toAlert, alerted };
}

interface StoredTarget {
  experienceId: string;
  after?: string;
  before?: string;
  /**
   * Persisted so a party set up once keeps working all day. Safe because the
   * autopilot on/off state is deliberately *not* persisted -- nothing can book
   * until the user turns it on again, in person, after a reload.
   */
  autoBook?: boolean;
}

/** `ParkTime.from` throws on garbage; treat an unparseable bound as absent. */
function parseBound(value?: string): ParkTime | undefined {
  if (!value) return undefined;
  try {
    return ParkTime.from(value);
  } catch {
    return undefined;
  }
}

/**
 * Load the saved watch list.
 *
 * Stored as plain strings because `ParkTime` serializes to `"HH:MM:SS"` via
 * `toJSON()` but does not revive itself from JSON.
 *
 * Bounds are parsed independently of the entry: a corrupt `after`/`before`
 * drops just that bound and keeps the target. Dropping the whole target would
 * silently discard a watch the user deliberately set, and a missed alert is
 * harder to notice than an early one.
 */
export function loadWatchList(): WatchTarget[] {
  const stored = kvdb.get<StoredTarget[]>(WATCHLIST_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.flatMap(t => {
    if (typeof t?.experienceId !== 'string') return [];
    const after = parseBound(t.after);
    const before = parseBound(t.before);
    return [
      {
        experienceId: t.experienceId,
        ...(after ? { after } : {}),
        ...(before ? { before } : {}),
        // Only a literal `true` enables booking. Anything else stored here --
        // a truthy string, a number from a hand-edited value -- reads as off,
        // since the failure mode of guessing wrong is an unwanted booking.
        ...(t.autoBook === true ? { autoBook: true } : {}),
      },
    ];
  });
}

export function saveWatchList(targets: WatchTarget[]): void {
  kvdb.set<StoredTarget[]>(
    WATCHLIST_KEY,
    targets.map(t => ({
      experienceId: t.experienceId,
      ...(t.after ? { after: String(t.after) } : {}),
      ...(t.before ? { before: String(t.before) } : {}),
      ...(t.autoBook ? { autoBook: true } : {}),
    }))
  );
}
