import { DateTime, ParkTime } from '@/datetime';
import { now as syncedNow } from '@/timesync';

/**
 * How aggressively to poll right now.
 *
 * - `idle`     nothing interesting is near; keep data merely fresh
 * - `approach` a target is coming up; poll moderately so the list is warm
 * - `burst`    we are in the window around a target; poll hard
 */
export type PollMode = 'idle' | 'approach' | 'burst';

/**
 * Start bursting slightly *before* the target. Disney sometimes releases
 * inventory a few seconds early, and arriving warm beats arriving on time.
 */
export const BURST_LEAD_S = 30;
/**
 * Keep bursting after the target: dropped inventory trickles in rather than
 * appearing all at once, and the good return times get taken within a minute.
 */
export const BURST_TRAIL_S = 120;
/** Poll moderately this far ahead of a target. */
export const APPROACH_LEAD_S = 300;

/**
 * Floor on the poll interval, in ms.
 *
 * ApiClient shares a RateLimit(5) across every request, including the user's
 * own taps. Each poll costs 1-2 requests, and the scheduler runs strictly
 * sequentially (one poll in flight at a time), so a 1s floor bounds polling at
 * roughly 2 requests/second and leaves real headroom for user actions. Do not
 * lower this: tripping the limiter costs a cooldown, and near a drop that is
 * exactly when it hurts.
 */
export const MIN_INTERVAL_MS = 1000;

export const BURST_INTERVAL_MS = 1200;
export const APPROACH_INTERVAL_MS = 6000;
export const IDLE_INTERVAL_MS = 45_000;

export interface CadenceInput {
  /** Current park time, ideally drift-corrected -- see `syncedParkTime()`. */
  now: ParkTime;
  /** Drop times for the park, e.g. `park.dropTimes`. */
  dropTimes?: ParkTime[];
  /**
   * Every moment a booking window opens, from `LLClient.nextBookTimes`.
   *
   * Plural because a party's slots free at different times. Taking only the
   * first left the loop idling at 45 seconds through the rest.
   */
  nextBookTimes?: ParkTime[];
}

export interface Cadence {
  mode: PollMode;
  intervalMs: number;
  /** The target driving this decision, if any. */
  target?: ParkTime;
  /**
   * Seconds until `target`. Negative once the target has passed and we are
   * still inside its trailing window.
   */
  secondsToTarget?: number;
}

/** Drift-corrected current park time. */
export function syncedParkTime(): ParkTime {
  return DateTime.from(syncedNow()).time;
}

/**
 * Seconds from `now` until `target`; negative if `target` has passed.
 *
 * `ParkTime.valueOf()` measures from a 4am day start, so times after midnight
 * sort correctly after late-evening ones. This assumes both values fall within
 * the same park day, which holds for drop times and booking windows.
 */
export function secondsUntil(now: ParkTime, target: ParkTime): number {
  return +target - +now;
}

/**
 * Decide how fast to poll, given the current time and what is coming up.
 *
 * Deliberately pure: no clock, no randomness, no I/O. That keeps the policy
 * exhaustively testable, and it is the part most worth getting right --
 * cscull's fork polls a flat random 1-4s forever regardless of context, which
 * is simultaneously too fast when nothing is happening and no faster when a
 * drop is seconds away.
 */
export function cadence({
  now,
  dropTimes = [],
  nextBookTimes = [],
}: CadenceInput): Cadence {
  // Defaulting to an empty array rather than testing for undefined keeps the
  // two kinds of target symmetrical, which is what lets the loop below score
  // every one of them without knowing where it came from.
  const targets = [...dropTimes, ...nextBookTimes];

  let burst: { target: ParkTime; secondsToTarget: number } | undefined;
  let approach: { target: ParkTime; secondsToTarget: number } | undefined;

  for (const target of targets) {
    const secondsToTarget = secondsUntil(now, target);
    if (secondsToTarget <= BURST_LEAD_S && secondsToTarget >= -BURST_TRAIL_S) {
      // Prefer the nearest burst target, measured by absolute distance, so a
      // drop we are sitting on top of wins over one 30s out.
      if (
        !burst ||
        Math.abs(secondsToTarget) < Math.abs(burst.secondsToTarget)
      ) {
        burst = { target, secondsToTarget };
      }
    } else if (secondsToTarget > 0 && secondsToTarget <= APPROACH_LEAD_S) {
      if (!approach || secondsToTarget < approach.secondsToTarget) {
        approach = { target, secondsToTarget };
      }
    }
  }

  if (burst) return { mode: 'burst', intervalMs: BURST_INTERVAL_MS, ...burst };
  if (approach) {
    return { mode: 'approach', intervalMs: APPROACH_INTERVAL_MS, ...approach };
  }
  return { mode: 'idle', intervalMs: IDLE_INTERVAL_MS };
}

/**
 * Consecutive failures after which the poller stops rather than retrying.
 *
 * A stuck poller is worse than a stopped one: `ApiClient.request()` clears the
 * auth store on a 401, so a loop that keeps firing against expired
 * credentials generates noise and gets nowhere. Stopping surfaces the problem
 * instead of hiding it behind an endless retry.
 */
export const MAX_CONSECUTIVE_FAILURES = 8;
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_CAP_MS = 60_000;

/**
 * Delay before the next attempt after `consecutiveFailures` failures.
 *
 * Doubles from 2s, capped at 60s. The cap matters: without one, backoff after
 * a handful of failures would exceed the length of a drop window entirely.
 */
export function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(
    BACKOFF_CAP_MS,
    BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1)
  );
}

/**
 * Spread an interval by +/-20% so the request pattern has no fixed period.
 *
 * `rand` is injectable purely so tests can be deterministic.
 */
export function withJitter(intervalMs: number, rand = Math.random): number {
  const spread = intervalMs * 0.2;
  const jittered = intervalMs - spread + rand() * spread * 2;
  return Math.max(MIN_INTERVAL_MS, Math.round(jittered));
}
