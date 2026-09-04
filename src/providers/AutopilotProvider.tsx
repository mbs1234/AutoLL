import { use, useCallback, useEffect, useRef, useState } from 'react';

import { Guests } from '@/api/ll';
import {
  AlertPermission,
  alertPermission,
  fireAlert,
  primeAudio,
  requestAlertPermission,
} from '@/autopilot/alert';
import {
  AutoBookLedger,
  AutoBookOutcome,
  attemptAutoBook,
} from '@/autopilot/autobook';
import { GuestCache, prewarmGuests } from '@/autopilot/prewarm';
import { syncedParkTime } from '@/autopilot/schedule';
import usePoller from '@/autopilot/usePoller';
import {
  WatchTarget,
  loadWatchList,
  matchWatchList,
  saveWatchList,
  selectNewAlerts,
} from '@/autopilot/watchlist';
import AutopilotContext, {
  AutopilotHit,
  BookingLogEntry,
} from '@/contexts/AutopilotContext';
import BookingDateContext from '@/contexts/BookingDateContext';
import ClientsContext from '@/contexts/ClientsContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import { formatTime } from '@/datetime';
import { now as syncedNow } from '@/timesync';

/**
 * Refresh plans every Nth tick rather than every tick.
 *
 * Plans cost a request and change only when something is booked or cancelled,
 * while experiences carry the availability the poller exists to watch. In
 * burst mode this still refreshes plans roughly every 12 seconds.
 */
export const PLANS_EVERY_N_TICKS = 10;

/**
 * Wires the poller, watch list, alerting, prewarming and auto-booking
 * together.
 *
 * Must sit below ExperiencesProvider, since it consumes both experiences and
 * plans, and PlansProvider is mounted above ExperiencesProvider in Merlock.
 */
export default function AutopilotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { park } = use(ParkContext);
  const { ll } = use(ClientsContext);
  const { bookingDate } = use(BookingDateContext);
  const { pollExperiences } = use(ExperiencesContext);
  const { pollPlans } = use(PlansContext);

  // Deliberately not persisted. A poller that resumes on page load has no
  // user gesture behind it, so it could not play sound, and silently issuing
  // requests -- let alone bookings -- on load is a surprising default. This is
  // also what makes persisting per-target autoBook safe.
  const [enabled, setEnabledState] = useState(false);
  const [targets, setTargets] = useState<WatchTarget[]>(loadWatchList);
  const [notifications, setNotifications] =
    useState<AlertPermission>(alertPermission);
  const [lastHit, setLastHit] = useState<AutopilotHit>();
  const [bookingLog, setBookingLog] = useState<BookingLogEntry[]>([]);

  const alertedRef = useRef<ReadonlySet<string>>(new Set());
  const tickCountRef = useRef(0);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const bookingDateRef = useRef(bookingDate);
  bookingDateRef.current = bookingDate;

  const cacheRef = useRef(new GuestCache());
  const ledgerRef = useRef(new AutoBookLedger());
  const [bookedCount, setBookedCount] = useState(0);

  // Block body on purpose: an expression body would return saveWatchList's
  // value, which React would treat as a cleanup function.
  useEffect(() => {
    saveWatchList(targets);
  }, [targets]);

  const clock = useCallback(
    () => ({ ms: syncedNow(), time: syncedParkTime() }),
    []
  );

  /** Cached eligibility if warm, otherwise fetched and cached. */
  const guestsFor = useCallback(
    async (experienceId: string): Promise<Guests> => {
      const date = bookingDateRef.current;
      const cached = cacheRef.current.get(experienceId, date, clock());
      if (cached) return cached;
      const fetched = await ll.guests({ id: experienceId }, date);
      cacheRef.current.set(experienceId, date, fetched, clock().ms);
      return fetched;
    },
    [ll, clock]
  );

  const logOutcome = useCallback((name: string, outcome: AutoBookOutcome) => {
    setBookingLog(prev =>
      [
        {
          name,
          at: syncedParkTime(),
          ...(outcome.status === 'booked'
            ? { status: 'booked' as const, returnTime: outcome.returnTime }
            : outcome.status === 'failed'
              ? { status: 'failed' as const, detail: outcome.error }
              : { status: 'skipped' as const, detail: outcome.reason }),
        },
        ...prev,
      ].slice(0, 20)
    );
  }, []);

  const onTick = useCallback(async () => {
    // Let this reject: the poller needs the failure to drive backoff.
    const experiences = await pollExperiences();

    if (tickCountRef.current++ % PLANS_EVERY_N_TICKS === 0) {
      try {
        await pollPlans();
      } catch (error) {
        // Supplementary. A plans failure must not stall availability polling
        // or count against the poller's failure budget.
        console.error(error);
      }
    }

    const hits = matchWatchList(experiences, targetsRef.current);
    const { toAlert, alerted } = selectNewAlerts(hits, alertedRef.current);
    alertedRef.current = alerted;

    for (const hit of toAlert) {
      fireAlert({
        title: `${hit.experience.name} is available`,
        body: `Return time ${formatTime(hit.returnTime)}`,
        // Same tag per ride, so a repeat alert replaces rather than stacks.
        tag: `bg1-autopilot-${hit.experience.id}`,
      });
    }

    const first = toAlert[0];
    if (first) {
      setLastHit({
        experienceId: first.experience.id,
        name: first.experience.name,
        returnTime: first.returnTime,
      });
    }

    // Booking comes before prewarming: when a drop lands, the good return
    // times are gone within a minute, so nothing may sit ahead of it.
    for (const hit of hits) {
      if (!hit.target.autoBook) continue;
      if (ledgerRef.current.hasAttempted(hit.experience.id)) continue;
      if (ledgerRef.current.remaining <= 0) break;

      let outcome: AutoBookOutcome;
      try {
        outcome = await attemptAutoBook(hit.target, hit.experience, {
          createOffer: (experience, guests) =>
            ll.offer(experience, guests, { date: bookingDateRef.current }),
          book: offer => ll.book(offer),
          guests: await guestsFor(hit.experience.id),
          ledger: ledgerRef.current,
        });
      } catch (error) {
        // Only guestsFor can throw out here; attemptAutoBook handles its own.
        console.error(error);
        outcome = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Skips are the common case mid-drop and would swamp the log.
      if (outcome.status !== 'skipped') {
        logOutcome(hit.experience.name, outcome);
      }

      if (outcome.status === 'booked') {
        // A booking shifts eligibility across every experience at once via
        // party, tier and overlap limits, so the whole cache is invalid.
        cacheRef.current.clear();
        setBookedCount(ledgerRef.current.bookedCount);
        fireAlert({
          title: `Booked ${hit.experience.name}`,
          body: `Return time ${formatTime(outcome.returnTime)}`,
          tag: `bg1-autopilot-booked-${hit.experience.id}`,
        });
        try {
          await pollPlans();
        } catch (error) {
          console.error(error);
        }
      }
    }

    // Prewarm only auto-book targets. Eligibility is the one request in the
    // three-request booking path that does not change second to second, so
    // having it cached removes a third of the round trips from the moment a
    // drop lands. Limiting it to auto-book targets bounds the extra requests,
    // and prewarmGuests skips anything already warm.
    const toWarm = targetsRef.current
      .filter(t => t.autoBook)
      .map(t => ({ id: t.experienceId }));
    if (toWarm.length > 0) {
      await prewarmGuests(toWarm, bookingDateRef.current, {
        fetchGuests: (experience, date) => ll.guests(experience, date),
        cache: cacheRef.current,
        now: clock,
      });
    }
  }, [pollExperiences, pollPlans, ll, guestsFor, clock, logOutcome]);

  const status = usePoller({
    enabled,
    onTick,
    dropTimes: park.dropTimes,
    // Set as a side effect of ll.experiences(), so it is current as of the
    // last poll. Read fresh each tick by usePoller.
    nextBookTime: ll.nextBookTime,
  });

  const setEnabled = useCallback((on: boolean) => {
    if (on) {
      // Both of these must be initiated inside the user gesture that turned
      // autopilot on -- primeAudio synchronously, and the permission request
      // at least called from here.
      primeAudio();
      void requestAlertPermission().then(setNotifications);
      // Forget past alerts so turning it back on re-alerts anything already
      // available, rather than staying silent about it.
      alertedRef.current = new Set();
      tickCountRef.current = 0;
      // Fresh allowance and a clear cache per run, so a stale eligibility
      // result from an earlier session cannot drive a booking.
      ledgerRef.current.reset();
      cacheRef.current.clear();
      setBookedCount(0);
    }
    setEnabledState(on);
  }, []);

  // Reads `targets` rather than the ref: a stable identity over a ref would
  // never re-render a watch toggle when the list changed.
  const isWatched = useCallback(
    (experienceId: string) =>
      targets.some(t => t.experienceId === experienceId),
    [targets]
  );

  const addTarget = useCallback((target: WatchTarget) => {
    setTargets(prev => [
      ...prev.filter(t => t.experienceId !== target.experienceId),
      target,
    ]);
  }, []);

  const removeTarget = useCallback((experienceId: string) => {
    setTargets(prev => prev.filter(t => t.experienceId !== experienceId));
  }, []);

  const toggleAutoBook = useCallback((experienceId: string) => {
    setTargets(prev =>
      prev.map(t =>
        t.experienceId === experienceId ? { ...t, autoBook: !t.autoBook } : t
      )
    );
  }, []);

  return (
    <AutopilotContext
      value={{
        enabled,
        setEnabled,
        status,
        targets,
        isWatched,
        addTarget,
        removeTarget,
        toggleAutoBook,
        notifications,
        lastHit,
        bookingLog,
        bookedCount,
        bookingsRemaining: ledgerRef.current.maxPerSession - bookedCount,
      }}
    >
      {children}
    </AutopilotContext>
  );
}
