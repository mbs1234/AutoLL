import { useEffect, useRef, useState } from 'react';

import { ParkTime } from '@/datetime';
import { syncTime } from '@/timesync';

import {
  MAX_CONSECUTIVE_FAILURES,
  PollMode,
  backoffMs,
  cadence,
  syncedParkTime,
  withJitter,
} from './schedule';

export interface PollerStatus {
  /** `off` when disabled, `stopped` after giving up on repeated failures. */
  mode: PollMode | 'off' | 'stopped';
  consecutiveFailures: number;
  lastError?: string;
  /** The drop or booking time currently driving the cadence. */
  target?: ParkTime;
  secondsToTarget?: number;
  /** Ticks attempted since the loop started; useful for display and tests. */
  polls: number;
}

export interface PollerOptions {
  enabled: boolean;
  /**
   * One unit of work. Must reject on failure so the loop can back off --
   * the silent `pollExperiences`/`pollPlans` context functions do; the
   * visible `refreshExperiences`/`refreshPlans` do not.
   */
  onTick: () => Promise<void>;
  dropTimes?: ParkTime[];
  nextBookTimes?: ParkTime[];
}

const OFF: PollerStatus = { mode: 'off', consecutiveFailures: 0, polls: 0 };

/**
 * A single coordinated polling loop, paced by the drop-aware cadence policy.
 *
 * One loop, not one per screen. cscull's fork mounts an independent 1-4s
 * timer on each of three tabs, all drawing on the same RateLimit(5) that the
 * user's own taps also draw on; with all three on, they collectively burst
 * well past the limit. Here a single `setTimeout` chain runs strictly
 * sequentially -- the next tick is scheduled only after the previous one
 * settles -- so polls can never overlap or stack up.
 *
 * Note on mobile: background tabs are heavily timer-throttled, so this is
 * reliable only while the page is foregrounded.
 */
export default function usePoller({
  enabled,
  onTick,
  dropTimes,
  nextBookTimes,
}: PollerOptions): PollerStatus {
  const [status, setStatus] = useState<PollerStatus>(OFF);

  // Latest values, read at tick time. Held in refs so that a park change, a
  // new set of booking windows, or a re-created onTick does not tear the loop
  // down and restart it -- a restart fires an immediate extra poll, and
  // ExperiencesProvider re-creates its callback on every park or date change,
  // so the loop would rarely survive.
  const onTickRef = useRef(onTick);
  const dropTimesRef = useRef(dropTimes);
  const nextBookTimesRef = useRef(nextBookTimes);
  onTickRef.current = onTick;
  dropTimesRef.current = dropTimes;
  nextBookTimesRef.current = nextBookTimes;

  useEffect(() => {
    if (!enabled) {
      setStatus(OFF);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let polls = 0;

    const run = async () => {
      let failed = false;
      let lastError: string | undefined;
      try {
        await onTickRef.current();
        failures = 0;
      } catch (error) {
        failed = true;
        failures += 1;
        lastError = error instanceof Error ? error.message : String(error);
        console.error(error);
      }
      ++polls;
      if (cancelled) return;

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        // Give up rather than retry forever. A 401 clears the auth store, so
        // a loop against expired credentials would spin generating noise.
        setStatus({
          mode: 'stopped',
          consecutiveFailures: failures,
          lastError,
          polls,
        });
        return;
      }

      const next = cadence({
        now: syncedParkTime(),
        dropTimes: dropTimesRef.current,
        nextBookTimes: nextBookTimesRef.current,
      });

      // Keep the clock offset fresh while something is actually coming up.
      // syncTime() self-throttles to once every five minutes, so calling it
      // per tick costs nothing, and drop timing depends on it being current.
      if (next.mode !== 'idle') {
        void syncTime().catch(() => undefined);
      }

      setStatus({
        mode: next.mode,
        consecutiveFailures: failures,
        lastError,
        target: next.target,
        secondsToTarget: next.secondsToTarget,
        polls,
      });

      timer = setTimeout(
        run,
        failed ? backoffMs(failures) : withJitter(next.intervalMs)
      );
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Depends only on `enabled` by design; everything else is read from refs
    // at tick time. See the note on the refs above.
  }, [enabled]);

  return status;
}
