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
  /** When the next Lightning Lane may be booked, from `LLClient.nextBookTime`. */
  nextBookTime?: ParkTime;
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
  nextBookTime,
}: CadenceInput): Cadence {
  const targets = [...dropTimes, ...(nextBookTime ? [nextBookTime] : [])];

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
 * Spread an interval by +/-20% so the request pattern has no fixed period.
 *
 * `rand` is injectable purely so tests can be deterministic.
 */
export function withJitter(intervalMs: number, rand = Math.random): number {
  const spread = intervalMs * 0.2;
  const jittered = intervalMs - spread + rand() * spread * 2;
  return Math.max(MIN_INTERVAL_MS, Math.round(jittered));
}
