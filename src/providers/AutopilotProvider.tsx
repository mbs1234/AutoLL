import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Booking } from '@/api/itinerary';
import { Guests } from '@/api/ll';
import {
  AlertPermission,
  alertPermission,
  fireAlert,
  primeAudio,
  requestAlertPermission,
} from '@/autopilot/alert';
import {
  ActionKind,
  AutoBookLedger,
  AutoBookOutcome,
  ClashCheck,
  MAX_ACTIONS_PER_DAY,
  REFILL_ACTIONS,
  attemptAutoBook,
  shouldAttempt,
} from '@/autopilot/autobook';
import {
  ModifyOutcome,
  attemptAutoModify,
  findExistingLL,
  shouldModify,
} from '@/autopilot/automodify';
import {
  MAX_HELD_MP,
  SwapOutcome,
  attemptAutoSwap,
  heldMPToday,
  shouldSwap,
} from '@/autopilot/autoswap';
import { learnedDropTimes, mergeDropTimes } from '@/autopilot/learned';
import {
  Coverage,
  DropSummary,
  Snapshot,
  appendDropEvents,
  detectDropEvents,
  loadCoverage,
  loadDropEvents,
  recordCoverage,
  saveCoverage,
  snapshotOf,
  summarizeDrops,
} from '@/autopilot/observe';
import { overlappingPlans } from '@/autopilot/overlap';
import { wholePartyEligible } from '@/autopilot/party';
import {
  GuestCache,
  entitlementsChanged,
  heldEntitlements,
  prewarmGuests,
} from '@/autopilot/prewarm';
import { orderByPriority, shouldHoldTierSlot } from '@/autopilot/priority';
import { NO_REFUSALS, RefusalState, observeAction } from '@/autopilot/refusal';
import { syncedParkTime } from '@/autopilot/schedule';
import {
  loadBookingLog,
  loadBudget,
  loadSettings,
  sanitizeBudget,
  saveBookingLog,
  saveBudget,
  saveSettings,
} from '@/autopilot/storage';
import usePoller from '@/autopilot/usePoller';
import { holdScreenAwake, releaseScreenAwake } from '@/autopilot/wakelock';
import {
  WATCHLIST_KEY,
  WatchTarget,
  inWindow,
  loadWatchList,
  matchWatchList,
  parseBound,
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
import { ParkTime, formatDate, formatTime, parkDate } from '@/datetime';
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
 * How long a rejected action waits before it may be tried again.
 *
 * Only `repeatMoves` retries at all, and the wait is what makes retrying safe
 * rather than merely legal. A rejection changes none of the inputs to the
 * decision that produced it: the reservation did not move, plans are only
 * re-polled after a *success*, and the tipboard is served through a CDN that
 * may well hand back the same bytes. So the next tick would re-run the same
 * three requests against the same evidence, 600ms later, indefinitely -- and
 * `RateLimit(5)` is shared with the other provider and with the user's own
 * taps, where tripping it costs every call in the app a five-second cooldown
 * at the worst possible moment.
 *
 * Twenty seconds is long enough that a stuck search costs a request every
 * thirty-odd ticks instead of every one, and short enough that a lost race
 * during a drop is retried while the drop is still running.
 */
export const RETRY_AFTER_MS = 20_000;

/**
 * Wires the poller, watch list, alerting, prewarming and auto-booking
 * together.
 *
 * Must sit below ExperiencesProvider, since it consumes both experiences and
 * plans, and PlansProvider is mounted above ExperiencesProvider in Merlock.
 */
export default function AutopilotProvider({
  children,
  watchListKey = WATCHLIST_KEY,
  rapid = false,
  budgeted = true,
  repeatMoves = false,
}: {
  children: React.ReactNode;
  /**
   * Where this build's watch list lives. Both bookmarklets run on Disney's
   * origin and share one `localStorage`, so a build with a different purpose
   * needs a different key or it overwrites the other's list.
   */
  watchListKey?: string;
  /** Poll flat-out rather than pacing to the drop schedule. */
  rapid?: boolean;
  /**
   * Whether the park day's action budget applies.
   *
   * It exists so a bug in matching cannot burn a day of Lightning Lanes, which
   * is a real risk for something armed in the morning and left running. A
   * hand-started search for one named attraction, watched by the person who
   * started it, is bounded by its own shape instead -- and sharing the budget
   * would mean a morning of Autopilot silently disabling an afternoon search.
   */
  budgeted?: boolean;
  /** Allow the same reservation to be moved more than once. */
  repeatMoves?: boolean;
}) {
  const { park } = use(ParkContext);
  const { ll } = use(ClientsContext);
  const { bookingDate } = use(BookingDateContext);
  const { experiences, pollExperiences } = use(ExperiencesContext);
  const { plans, pollPlans } = use(PlansContext);

  // Deliberately not persisted. A poller that resumes on page load has no
  // user gesture behind it, so it could not play sound, and silently issuing
  // requests -- let alone bookings -- on load is a surprising default. This is
  // also what makes persisting per-target autoBook safe.
  const [enabled, setEnabledState] = useState(false);
  const [targets, setTargets] = useState<WatchTarget[]>(() =>
    loadWatchList(watchListKey)
  );
  const [notifications, setNotifications] =
    useState<AlertPermission>(alertPermission);
  const [lastHit, setLastHit] = useState<AutopilotHit>();
  // The day's log survives a reload; the on/off state deliberately does not.
  const [bookingLog, setBookingLog] =
    useState<BookingLogEntry[]>(loadBookingLog);
  const [settings, setSettings] = useState(loadSettings);
  const [skipCounts, setSkipCounts] = useState<Record<string, number>>({});
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Which booking-path calls Disney is refusing, and for how long. Held in
  // a ref as well as state because the tick reads and writes it between
  // renders; the state copy exists only so the screen can show it.
  const refusalRef = useRef<RefusalState>(NO_REFUSALS);
  const [refusals, setRefusals] = useState<RefusalState>(NO_REFUSALS);

  // Identifies this provider to the wake-lock module, which is a singleton
  // shared with any other provider mounted at the same time -- NextLL nests a
  // second one inside the app's own. Without it, this component's unmount
  // released the lock a different, still-running provider was holding.
  const wakeLockOwner = useRef({}).current;

  // When each rejected action may be tried again, keyed `kind:experienceId`.
  // Session state like the ledger's own locks, and cleared with them.
  const retryAtRef = useRef(new Map<string, number>());

  const alertedRef = useRef<ReadonlySet<string>>(new Set());
  const tickCountRef = useRef(0);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const bookingDateRef = useRef(bookingDate);
  bookingDateRef.current = bookingDate;
  // Read at tick time for the same reason as the date: `onTick` closes over
  // `park`, so a tick already running still holds the park it started in.
  const parkIdRef = useRef(park.id);
  parkIdRef.current = park.id;
  // Read at tick time: setState from a plans poll has not re-rendered yet
  // when the booking loop runs immediately afterwards.
  const plansRef = useRef(plans);
  plansRef.current = plans;

  // Today's record, read once on mount. `kvdb's daily helpers give a fresh one
  // on a new park day -- but only to a fresh mount, and this provider does not
  // remount: a phone tab that backgrounds overnight is still holding yesterday
  // at 7am. `setDaily` stamps the date at *write* time, so a write from that
  // tab would republish yesterday's spend under today, and a reload would then
  // start the new day already exhausted.
  const budgetTodayRef = useRef(loadBudget());
  const budgetDateRef = useRef(parkDate());
  const grantedRef = useRef(budgetTodayRef.current.granted);
  // Whether the exhausted skip has already been counted for this exhaustion.
  const budgetSkipRef = useRef(false);

  /**
   * Write the day's charge, unless the park day has turned under us.
   *
   * Both writers funnel through here. Refusing the write leaves the stale tab
   * showing yesterday's count until it reloads, which is no worse than the
   * `bookingDate` beside it -- that is captured once too. What matters is that
   * the staleness is not written down where tomorrow will read it as fact.
   */
  const persistBudget = (spent: number) => {
    if (parkDate() !== budgetDateRef.current) return;
    saveBudget({ spent, granted: grantedRef.current });
  };

  const cacheRef = useRef(new GuestCache());
  // What the party held as of the last plans poll. Undefined until the first
  // poll of a run establishes the baseline rather than firing on it.
  const entitlementsRef = useRef<ReadonlySet<string> | undefined>(undefined);
  const ledgerRef = useRef(
    new AutoBookLedger(
      // Clamped on the sum, not just on the setting: `granted` is persisted,
      // so an edited value must not be able to lift the ceiling. Read from
      // `settings` rather than `loadSettings()`: `useRef` keeps only the first
      // value but evaluates its argument on every render, so a load here would
      // parse localStorage on each one.
      budgeted
        ? Math.min(
            MAX_ACTIONS_PER_DAY,
            settings.maxActionsPerDay + budgetTodayRef.current.granted
          )
        : Infinity,
      budgeted ? budgetTodayRef.current.spent : 0,
      spent => (budgeted ? persistBudget(spent) : undefined)
    )
  );

  // Drop learning: the previous tipboard state, plus what the poller has seen
  // and when it was looking. Events and coverage accumulate across visits.
  const snapshotRef = useRef<Snapshot>(new Map());
  const coverageRef = useRef<Coverage>(loadCoverage());
  const [dropSummaries, setDropSummaries] = useState<DropSummary[]>(() => {
    // Whatever was learned on earlier visits, before today's first poll.
    return summarizeDrops(loadDropEvents(), coverageRef.current, new Map());
  });
  const [bookedCount, setBookedCount] = useState(0);
  // Mirrors the ledger rather than being derived from `bookedCount`: an
  // attempt still awaiting confirmation holds a slot too.
  const [bookingsRemaining, setBookingsRemaining] = useState(
    () => ledgerRef.current.remaining
  );
  const [actionBudget, setActionBudget] = useState(
    () => ledgerRef.current.budgetToday
  );

  /**
   * Push the current ceiling into the ledger and onto the screen.
   *
   * The ceiling is the setting plus whatever refills have been granted today,
   * clamped to `MAX_ACTIONS_PER_DAY` on the sum. Changing it never changes what
   * has been spent -- lowering the allowance below today's spend simply leaves
   * nothing remaining.
   */
  const applyBudget = useCallback(() => {
    if (!budgeted) return;
    const budget = Math.min(
      MAX_ACTIONS_PER_DAY,
      settingsRef.current.maxActionsPerDay + grantedRef.current
    );
    ledgerRef.current.setBudget(budget);
    setActionBudget(budget);
    setBookingsRemaining(ledgerRef.current.remaining);
  }, [budgeted]);

  // Block body on purpose: an expression body would return saveWatchList's
  // value, which React would treat as a cleanup function.
  useEffect(() => {
    saveWatchList(targets, watchListKey);
  }, [targets, watchListKey]);
  useEffect(() => {
    saveBookingLog(bookingLog);
  }, [bookingLog]);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  // The allowance lives in settings but is enforced by the ledger, so a change
  // has to reach it -- otherwise raising the number would show a larger budget
  // while autopilot kept refusing to act.
  useEffect(() => {
    applyBudget();
  }, [settings.maxActionsPerDay, applyBudget]);

  // Unmount is the one path that bypasses `setEnabled(false)`, and a wake lock
  // outliving the screen that requested it would keep the phone awake with
  // nothing running.
  useEffect(
    () => () => void releaseScreenAwake(wakeLockOwner),
    [wakeLockOwner]
  );

  const refillBudget = useCallback(() => {
    grantedRef.current = Math.min(
      MAX_ACTIONS_PER_DAY,
      grantedRef.current + REFILL_ACTIONS
    );
    persistBudget(ledgerRef.current.spent);
    budgetSkipRef.current = false;
    applyBudget();
  }, [applyBudget]);

  const bumpSkip = useCallback((reason: string) => {
    setSkipCounts(prev => ({ ...prev, [reason]: (prev[reason] ?? 0) + 1 }));
  }, []);

  const clock = useCallback(
    () => ({ ms: syncedNow(), time: syncedParkTime() }),
    []
  );

  /**
   * Cached eligibility if warm, otherwise fetched and cached.
   *
   * Takes the date rather than reading the ref. This is called from inside the
   * acting loop, after several awaits, and it supplies the guest list the
   * offer is built from -- so a date change landing mid-tick would fetch
   * eligibility for one day and spend it booking another.
   */
  const guestsFor = useCallback(
    async (experienceId: string, date: string): Promise<Guests> => {
      const cached = cacheRef.current.get(experienceId, date, clock());
      if (cached) return cached;
      const fetched = await ll.guests({ id: experienceId }, date);
      cacheRef.current.set(experienceId, date, fetched, clock().ms);
      return fetched;
    },
    [ll, clock]
  );

  type DryRunOutcome = {
    status: 'dry-run';
    kind: ActionKind;
    returnTime: ParkTime;
  };

  const logOutcome = useCallback(
    (
      name: string,
      outcome: AutoBookOutcome | ModifyOutcome | SwapOutcome | DryRunOutcome
    ) => {
      setBookingLog(prev =>
        [
          {
            name,
            at: syncedParkTime(),
            ...(outcome.status === 'booked'
              ? { status: 'booked' as const, returnTime: outcome.returnTime }
              : outcome.status === 'modified'
                ? {
                    status: 'modified' as const,
                    fromTime: outcome.from,
                    returnTime: outcome.to,
                  }
                : outcome.status === 'swapped'
                  ? {
                      status: 'swapped' as const,
                      replacedName: outcome.replaced.name,
                      fromTime: outcome.replaced.time,
                      returnTime: outcome.to,
                    }
                  : outcome.status === 'dry-run'
                    ? {
                        status: 'dry-run' as const,
                        detail: outcome.kind,
                        returnTime: outcome.returnTime,
                      }
                    : outcome.status === 'failed'
                      ? { status: 'failed' as const, detail: outcome.error }
                      : {
                          status: 'skipped' as const,
                          detail: outcome.reason,
                        }),
          },
          ...prev,
        ].slice(0, 20)
      );
    },
    []
  );

  const onTick = useCallback(
    async (cancelled: () => boolean) => {
      // One date for the whole tick, read once. The ref is assigned during
      // render and this function awaits repeatedly, so re-reading it lets a date
      // change land between two decisions -- eligibility fetched for one day and
      // spent booking another. Same reasoning as `currentPlans` below.
      const date = bookingDateRef.current;
      const forToday = date === parkDate();

      /**
       * Whether this tick is still acting on the plan it started from.
       *
       * `cancelled` is the poller's own signal and covers only turning
       * autopilot off and unmounting -- the polling effect depends on
       * `enabled` alone, deliberately, so that a park or date change does not
       * tear the loop down and fire an extra immediate poll. The cost of that
       * choice is that a tick already in flight keeps the park and date it
       * captured, and would happily spend an entitlement against a day the
       * user has since moved off. So the tick asks about all three.
       */
      const stale = () =>
        cancelled() ||
        bookingDateRef.current !== date ||
        parkIdRef.current !== park.id;

      // Let this reject: the poller needs the failure to drive backoff.
      const experiences = await pollExperiences();

      // Learn from what just came back. Only on the current park day: a future
      // date's tipboard changes with cancellations, which are not drops, and its
      // times would be filed under the wrong day.
      if (forToday) {
        const observedAt = syncedParkTime();
        const obsDate = date;
        const next = snapshotOf(experiences);
        const events = detectDropEvents(
          snapshotRef.current,
          next,
          observedAt,
          obsDate,
          new Set(targetsRef.current.map(target => target.experienceId))
        );
        snapshotRef.current = next;
        const cov = recordCoverage(coverageRef.current, obsDate, observedAt);
        if (cov.changed) {
          coverageRef.current = cov.coverage;
          saveCoverage(cov.coverage);
        }
        // Recompute only when something is new -- a drop, or a first look at a
        // 5-minute window -- never on the ordinary tick.
        if (events.length > 0 || cov.changed) {
          const all = appendDropEvents(events);
          const schedule = new Map(
            experiences
              .filter(exp => exp.dropTimes && exp.dropTimes.length > 0)
              .map(exp => [exp.id, exp.dropTimes!])
          );
          setDropSummaries(summarizeDrops(all, coverageRef.current, schedule));
        }
      }

      // Held only when the poll actually succeeded this tick. `plansRef` lags a
      // render behind, so it cannot distinguish "never booked" from "booked
      // moments ago" -- and settling booking doubt needs exactly that.
      let freshPlans: Booking[] | undefined;
      if (tickCountRef.current++ % PLANS_EVERY_N_TICKS === 0) {
        try {
          freshPlans = await pollPlans();
        } catch (error) {
          // Supplementary. A plans failure must not stall availability polling
          // or count against the poller's failure budget.
          console.error(error);
        }
      }

      // One view of plans for the whole tick. `plansRef` is assigned during
      // render, so on a tick that polled plans it still holds the pre-poll
      // snapshot -- React cannot have re-rendered between the await above and
      // here. Reading it while the settle loop below reads `freshPlans` would
      // let autopilot believe two things about the same party in the same tick:
      // that a slot has just come free, and that all three are still taken.
      const currentPlans = freshPlans ?? plansRef.current;
      const heldToday = (experienceId: string) =>
        findExistingLL(currentPlans, experienceId, date);
      const allHeldToday = heldMPToday(currentPlans, date);
      const partyIsFull = allHeldToday.length >= MAX_HELD_MP;

      /**
       * Whether a return time lands on top of something already planned.
       *
       * Called twice per action: once on the advertised time before an offer is
       * requested, which is what keeps a doomed round trip out of a drop and
       * makes the guard rehearsable in dry run, and once on the offer's real
       * time, which is usually later and is the one actually booked. The
       * offer's own itinerary is unioned in rather than trusted alone, since a
       * booking made a minute ago may be in plans and not yet in the offer.
       */
      const clashes: ClashCheck = (time, itinerary, release) => {
        if (!settingsRef.current.avoidOverlaps) return false;
        const inPlans = overlappingPlans(time, currentPlans, {
          date,
          ...(release ? { ignoreIds: [release.id] } : {}),
        });
        if (inPlans.length > 0) return true;
        return !!itinerary?.some(
          item =>
            item.facilityId !== release?.facilityId &&
            item.overlap.contains(time)
        );
      };

      // Settle any booking whose fate was unknown. Disney allows booking,
      // cancelling and rebooking the same attraction, so a permanent attempt
      // lock would forfeit a better time that appears after a manual cancel.
      // Only plans fetched during this tick count as evidence.
      if (freshPlans) {
        const settled = freshPlans;
        for (const id of ledgerRef.current.attemptedBookIds) {
          ledgerRef.current.resolveBook(
            id,
            !!findExistingLL(settled, id, date),
            // A redeemed or lapsed pass leaves plans looking exactly like a
            // cancelled one, and only the tracker can tell the two apart.
            forToday && ll.experienced({ id })
          );
        }
        // Settling can charge the allowance for a booking whose request never
        // returned, so the on-screen count has to follow the ledger rather than
        // only successful actions.
        setBookedCount(ledgerRef.current.bookedCount);
        setBookingsRemaining(ledgerRef.current.remaining);

        // Eligibility moves for reasons no clock predicts. A tap-in, an expiry,
        // a reservation cancelled by hand, or one booked in Disney's own app all
        // change what the party may book, and the cache was cleared only for
        // actions autopilot took itself -- so a party that tapped in mid-drop sat
        // out the rest of it, skipping on `no-eligible-guests` for up to the full
        // three-minute TTL while the slot it had just freed went unbooked.
        //
        // Cleared wholesale rather than by ineligibility reason. At the moment of
        // a first redemption nothing in the party is fully eligible, so a
        // reason-based predicate would drop every entry anyway; and in the other
        // direction a booking made by hand is exactly what makes the *eligible*
        // entries the wrong ones. The cost is one sequential re-prewarm at the end
        // of this tick, which is the honest price of eligibility having changed.
        const held = heldEntitlements(settled, date);
        if (entitlementsChanged(entitlementsRef.current, held)) {
          cacheRef.current.clear();
        }
        entitlementsRef.current = held;
      }

      // Book-then-move: while nothing is held, the window is stripped so any
      // offered time matches and gets booked -- holding *something* beats
      // holding nothing. Once a reservation exists, the original target (with
      // its window) governs the modify step. The effective target is what
      // matching and booking see; the real one is looked up for moving.
      const effectiveTargets = targetsRef.current.map(target =>
        target.bookThenMove && !heldToday(target.experienceId)
          ? { ...target, after: undefined, before: undefined }
          : target
      );
      const realTarget = (experienceId: string) =>
        targetsRef.current.find(t => t.experienceId === experienceId);

      const hits = matchWatchList(experiences, effectiveTargets);
      const { toAlert, alerted } = selectNewAlerts(hits, alertedRef.current);
      alertedRef.current = alerted;

      for (const hit of toAlert) {
        fireAlert({
          title: `${hit.experience.name} is available`,
          // The date, when it is not today. An alert reading only "Return time
          // 11:05 AM", arriving at two in the morning, is read as this morning --
          // and looking like a booking for today is the one thing a future-date
          // find must never do.
          body: forToday
            ? `Return time ${formatTime(hit.returnTime)}`
            : `Return time ${formatTime(hit.returnTime)} on ${formatDate(date, 'short')}`,
          // Same tag per ride, so a repeat alert replaces rather than stacks.
          tag: `autoll-autopilot-${date}-${hit.experience.id}`,
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

      const expsById = new Map(experiences.map(exp => [exp.id, exp]));
      const nowTime = syncedParkTime();

      // The one-Tier-1-at-a-time rule lifts after the party's first redemption
      // of the day. LLTracker marks a redeemed attraction `experienced` (its
      // booking turns cancellable-but-not-modifiable, or it disappears with
      // EXPERIENCE_LIMIT_REACHED), and the tipboard carries that flag, so this
      // is readable right here without another request.
      // `forToday` as well as the flag: the tipboard's `experienced` is a fact
      // about the current park day, so riding something this morning must not
      // lift the Tier 1 hold on a booking for next Tuesday.
      const redeemedToday =
        forToday && experiences.some(exp => exp.experienced);

      // Targets that could still consume a Tier 1 slot: armed for booking, and
      // not already held. The tier hold has to reason about attractions that
      // have *not* become available yet, so it cannot work from `hits` alone,
      // and an attraction already booked is no reason to hold anything back.
      const armed = targetsRef.current.flatMap(target => {
        // Pausing an attraction says "not now", so it must not hold a slot back
        // for itself either.
        if (target.paused) return [];
        if (!target.autoBook && !target.bookThenMove) return [];
        if (heldToday(target.experienceId)) return [];
        const experience = expsById.get(target.experienceId);
        return experience ? [{ target, experience }] : [];
      });

      // Acting comes before prewarming: when a drop lands, the good return
      // times are gone within a minute, so nothing may sit ahead of it.
      //
      // Ordered by priority rather than tipboard order. The first booking
      // constrains what the next can be, so when two attractions drop in the
      // same tick the order is the decision, not an implementation detail.
      for (const hit of orderByPriority(hits)) {
        const { experience } = hit;
        // hit.target may carry a stripped window; the real one governs moving.
        const target = realTarget(experience.id) ?? hit.target;
        /**
         * Whether the current watch list still authorises this exact action.
         *
         * Re-runs the admission test the loop ran, against the live list,
         * rather than trusting the copy captured before the awaits. Every
         * input can change while a request is in flight: the toggles, the
         * window, pausing, unstarring.
         */
        const stillWantsAction = (
          experienceId: string,
          actionKind: 'book' | 'modify' | 'swap',
          returnTime: ParkTime
        ) => {
          const now = realTarget(experienceId);
          if (!now || now.paused) return false;
          if (actionKind === 'modify') {
            // Moving respects the window against the *real* target: that is
            // exactly what the window is for once something is held, and
            // book-then-move strips it only for the initial booking.
            return (
              !!(now.autoModify || now.bookThenMove) &&
              inWindow(returnTime, now)
            );
          }
          if (actionKind === 'swap') {
            return !!now.autoSwap && inWindow(returnTime, now);
          }
          if (!(now.autoBook || now.bookThenMove || now.autoSwap)) return false;
          // Book-then-move takes any time while nothing is held, which is what
          // strips the window in the first place; every other book respects it.
          return now.bookThenMove ? true : inWindow(returnTime, now);
        };
        if (target.paused) continue;
        const wantsBook = !!(
          target.autoBook ||
          target.bookThenMove ||
          target.autoSwap
        );
        const wantsModify = !!(target.autoModify || target.bookThenMove);
        const wantsSwap = !!target.autoSwap;
        if (!wantsBook && !wantsModify && !wantsSwap) continue;
        if (ledgerRef.current.remaining <= 0) {
          // Dry run stops here too. It spends nothing, so exempting it looks
          // free -- but a rehearsal exists to show what the live run would have
          // done, and a live run with no budget left does nothing. Exempting it
          // also achieved the opposite of its intent: the three pure guards
          // check `remaining` themselves, so the rehearsal skipped anyway and
          // logged `budget-exhausted` once per armed hit per tick, which is the
          // flood the counter below is written to avoid.
          //
          // Counted once per exhaustion rather than once per tick. This break
          // sits ahead of every other skip the loop can report, so a tally here
          // would climb 50/min in a burst, pin itself to the top of "Why nothing
          // was booked", and freeze every diagnostic reason beneath it at its
          // morning value.
          if (!budgetSkipRef.current) {
            budgetSkipRef.current = true;
            bumpSkip('budget-exhausted');
          }
          break;
        }
        budgetSkipRef.current = false;

        // Holding a reservation already makes booking a second one pointless --
        // Disney would reject it -- so the only useful action is re-timing. With
        // nothing held and every slot full, the only way in is to swap.
        const existing = heldToday(experience.id);
        const kind = existing
          ? 'modify'
          : partyIsFull && wantsSwap
            ? 'swap'
            : 'book';
        if (ledgerRef.current.hasAttempted(experience.id, kind)) {
          // Held for good, unless this is a rejection whose wait has run out.
          const retryAt = retryAtRef.current.get(`${kind}:${experience.id}`);
          if (retryAt === undefined || Date.now() < retryAt) {
            if (retryAt !== undefined) bumpSkip('waiting-to-retry');
            continue;
          }
          retryAtRef.current.delete(`${kind}:${experience.id}`);
          ledgerRef.current.releaseAttempt(experience.id, kind);
        }
        if (kind === 'modify' && !wantsModify) continue;
        if (kind === 'book' && !wantsBook) continue;

        // The window gates acting, not alerting: `matchWatchList` reports every
        // available match and flags it, so an out-of-window time is still worth
        // a notification. Modifying re-checks the window itself, against the
        // real target rather than the one book-then-move strips.
        if (kind !== 'modify' && !hit.inWindow) {
          bumpSkip('outside-window');
          continue;
        }

        // Not for a swap: which reservation would be released is decided inside
        // `attemptAutoSwap`, so the pre-offer check cannot exclude it and would
        // refuse every swap into the slot the victim occupies. The post-offer
        // check knows the victim and does the work.
        if (kind !== 'swap' && clashes(hit.returnTime, undefined, existing)) {
          bumpSkip('overlaps-plans');
          continue;
        }

        // Immediately before the three-request booking path, after every
        // other guard has passed. Without this the tick already running would
        // carry on and book after the user had stopped it, which is the one
        // thing a stop button cannot do.
        if (stale()) break;

        let outcome: AutoBookOutcome | ModifyOutcome | SwapOutcome;
        try {
          const guests = await guestsFor(experience.id, date);

          // Asked again, because eligibility is a round trip and the check
          // above is only as fresh as the moment it ran. Stopping autopilot,
          // or changing the day, while that request is outstanding used to
          // land in the offer and booking calls regardless.
          if (stale()) break;
          // And the plan itself, re-read rather than remembered. Checking only
          // that the target still exists and is unpaused was too weak: turning
          // Auto-book off, or narrowing the return-time window, leaves it
          // present and unpaused while the action it authorised is gone.
          if (!stillWantsAction(experience.id, kind, hit.returnTime)) continue;
          // A Lightning Lane for part of the group is often worse than none: it
          // splits the party and spends the slot. Opt-in, since booking by hand
          // in bg1 or Disney's app books for whoever is eligible.
          if (
            settingsRef.current.requireWholeParty &&
            !wholePartyEligible(guests)
          ) {
            bumpSkip('partial-party');
            continue;
          }

          /**
           * Whether the day's own settings still permit committing.
           *
           * The three global controls are all read once, before the offer is
           * requested -- and each of them exists to *prevent* an action, so
           * turning one on while a request is in flight and having the
           * booking go through anyway is the wrong way round. Re-read at the
           * gate, from the same refs the guards above use.
           */
          const stillPermitted = () =>
            // A rehearsal that commits is not a rehearsal.
            !settingsRef.current.dryRun &&
            !(
              settingsRef.current.requireWholeParty &&
              !wholePartyEligible(guests)
            ) &&
            ledgerRef.current.remaining > 0;

          // Only new bookings can spend the party's Tier 1 slot; re-timing or
          // swapping one already held does not. Checked here, ahead of the
          // branches, so a dry run rehearses it as well.
          if (
            kind === 'book' &&
            forToday &&
            shouldHoldTierSlot(hit, armed, nowTime, redeemedToday)
          ) {
            bumpSkip('tier-hold');
            continue;
          }

          // Dry run: rehearse the same pre-offer guards the real action applies
          // -- not-modifiable, the improvement threshold, no worse reservation to
          // give up -- so the log only claims what the live run would actually
          // have attempted. The one thing that cannot be rehearsed is the re-check
          // of the offer's real time, since that needs the offer. Marked attempted
          // so it logs once per attraction per action rather than on every tick.
          if (settingsRef.current.dryRun) {
            const pre =
              kind === 'swap'
                ? shouldSwap(
                    target,
                    experience,
                    allHeldToday,
                    ledgerRef.current
                  )
                : kind === 'modify'
                  ? shouldModify(
                      target,
                      existing,
                      hit.returnTime,
                      ledgerRef.current
                    )
                  : shouldAttempt(hit.target, ledgerRef.current);
            if (!pre.ok) {
              bumpSkip(pre.reason);
              continue;
            }
            // Rehearsal: marks only so this logs once, and stays out of the
            // allowance and the settle loop -- nothing was requested.
            ledgerRef.current.markAttempted(experience.id, kind, true);
            logOutcome(experience.name, {
              status: 'dry-run',
              kind,
              returnTime: hit.returnTime,
            });
            continue;
          }

          if (kind === 'swap') {
            // Atomic on Disney's side: the mod endpoint takes both the new
            // experience and the one being given up, so the old reservation is
            // released only if the new one is secured.
            outcome = await attemptAutoSwap(target, experience, allHeldToday, {
              createSwapOffer: (exp, g, victim) =>
                ll.offer(exp, g, { booking: victim }),
              book: offer => ll.book(offer),
              guests,
              ledger: ledgerRef.current,
              clashes,
              // Last gate before the entitlement is spent: generating the
              // offer is another round trip, and every guard above it ran
              // before that.
              stillWanted: offerTime =>
                !stale() &&
                stillPermitted() &&
                stillWantsAction(experience.id, 'swap', offerTime),
            });
          } else if (existing) {
            outcome = await attemptAutoModify(
              target,
              experience,
              existing,
              hit.returnTime,
              {
                createModifyOffer: (exp, g, booking) =>
                  ll.offer(exp, g, { booking }),
                book: offer => ll.book(offer),
                guests,
                ledger: ledgerRef.current,
                clashes,
                // Last gate before the entitlement is spent: generating the
                // offer is another round trip, and every guard above it ran
                // before that.
                stillWanted: offerTime =>
                  !stale() &&
                  stillPermitted() &&
                  stillWantsAction(experience.id, 'modify', offerTime),
              }
            );
          } else {
            // The effective target: window stripped under book-then-move.
            outcome = await attemptAutoBook(hit.target, experience, {
              createOffer: (exp, g) => ll.offer(exp, g, { date }),
              book: offer => ll.book(offer),
              guests,
              ledger: ledgerRef.current,
              clashes,
              // Last gate before the entitlement is spent: generating the
              // offer is another round trip, and every guard above it ran
              // before that.
              stillWanted: offerTime =>
                !stale() &&
                stillPermitted() &&
                stillWantsAction(experience.id, 'book', offerTime),
            });
          }
        } catch (error) {
          // Only guestsFor can throw out here; the attempt helpers handle their
          // own failures. Its status is worth carrying: eligibility is the first
          // call the booking path makes, so it is where a refusal lands first.
          const httpStatus = (error as { response?: { status?: number } })
            ?.response?.status;
          refusalRef.current = observeAction(
            refusalRef.current,
            'eligibility',
            httpStatus,
            nowTime
          );
          console.error(error);
          outcome = {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            httpStatus,
          };
        }

        // Anything the helpers returned settles their own call. A success clears
        // that call's run; only an unbroken run of refusals reads as "this is not
        // working" rather than "this went wrong a few times today".
        if (outcome.status !== 'skipped') {
          refusalRef.current = observeAction(
            refusalRef.current,
            kind === 'book' ? 'book' : 'offer',
            outcome.status === 'failed' ? outcome.httpStatus : undefined,
            nowTime
          );
        }
        setRefusals(refusalRef.current);

        // Skips are the common case mid-drop and would swamp the log, so they
        // are tallied instead.
        if (outcome.status === 'skipped') bumpSkip(outcome.reason);
        else logOutcome(experience.name, outcome);

        // After every attempt, not only a successful one: a booking request that
        // errored has already taken a doubt-hold on the allowance, so a
        // success-only refresh would show a slot that autopilot will not spend.
        // Harmless on a skip, where nothing moved and React bails out.
        setBookedCount(ledgerRef.current.bookedCount);
        setBookingsRemaining(ledgerRef.current.remaining);

        // Both legs take their ledger lock before committing, so a failure
        // leaves it held -- and `repeatMoves` gave it back only on success. One
        // lost race therefore retired the attraction for the rest of the
        // session while the screen went on saying it was still looking, which
        // for a search whose entire promise is "keep trying" is the whole
        // feature failing silently. Where the request provably changed nothing,
        // schedule a retry rather than releasing on the spot: see
        // RETRY_AFTER_MS for why the wait is the part that makes it safe.
        //
        // Autopilot keeps one action per attraction per session either way.
        //
        // Gated on the lock existing, because "rejected" alone does not mean
        // one was taken. All three helpers take theirs *after* the offer round
        // trip, so a 4xx on the offer call -- a 410 is the ordinary outcome of
        // a contested drop -- returns `rejected` with nothing locked. Minting a
        // token for it left an entry keyed to an action that never happened,
        // and the consumer above reads a token only once `hasAttempted` is
        // true: a later attempt whose own outcome was never learned would find
        // that stale token already expired, release its lock, and give back the
        // doubt-hold on a booking that may well exist. That inverts the rule
        // the ledger is built on -- mark before the request goes out, because a
        // timed-out request may have succeeded.
        if (
          repeatMoves &&
          outcome.status === 'failed' &&
          outcome.rejected &&
          ledgerRef.current.hasAttempted(experience.id, kind)
        ) {
          retryAtRef.current.set(
            `${kind}:${experience.id}`,
            Date.now() + RETRY_AFTER_MS
          );
        }

        if (
          outcome.status === 'booked' ||
          outcome.status === 'modified' ||
          outcome.status === 'swapped'
        ) {
          // Let a move be made again, where the product wants that. Autopilot
          // does not: one move per attraction per session is what stops it
          // thrashing a reservation as availability shifts. A hand-started
          // search is the opposite -- "keep moving it earlier" is the whole
          // request -- and each move still has to clear the 30-minute
          // improvement bar, so it walks toward the earliest time rather than
          // oscillating. Released only on success: a move that failed should not
          // be retried all afternoon.
          if (repeatMoves && outcome.status === 'modified') {
            ledgerRef.current.releaseAttempt(experience.id, 'modify');
          }
          // Any change shifts eligibility across every experience at once via
          // party, tier and overlap limits, so the whole cache is invalid.
          cacheRef.current.clear();
          fireAlert(
            outcome.status === 'booked'
              ? {
                  title: `Booked ${experience.name}`,
                  body: `Return time ${formatTime(outcome.returnTime)}`,
                  tag: `autoll-autopilot-booked-${date}-${experience.id}`,
                }
              : outcome.status === 'modified'
                ? {
                    title: `Moved ${experience.name} earlier`,
                    body: `${formatTime(outcome.from)} to ${formatTime(outcome.to)}`,
                    tag: `autoll-autopilot-booked-${date}-${experience.id}`,
                  }
                : {
                    title: `Swapped in ${experience.name}`,
                    body: `Gave up ${outcome.replaced.name}; return ${formatTime(outcome.to)}`,
                    tag: `autoll-autopilot-booked-${date}-${experience.id}`,
                  }
          );
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
        .filter(
          t =>
            !t.paused &&
            (t.autoBook || t.autoModify || t.bookThenMove || t.autoSwap)
        )
        .map(t => ({ id: t.experienceId }));
      if (toWarm.length > 0) {
        await prewarmGuests(toWarm, date, {
          fetchGuests: (experience, date) => ll.guests(experience, date),
          cache: cacheRef.current,
          now: clock,
        });
      }
    },
    [
      pollExperiences,
      pollPlans,
      ll,
      guestsFor,
      clock,
      logOutcome,
      bumpSkip,
      repeatMoves,
      park.id,
    ]
  );

  // The schedule the poller actually times itself to: the hardcoded drop
  // times plus any learned from observation on enough distinct days, for the
  // attractions in this park. This is what makes learning actionable -- a
  // drop the built-in table lacks gets burst for once it has been seen twice.
  const parkExperienceIds = useMemo(
    () => new Set(experiences.map(exp => exp.id)),
    [experiences]
  );
  const effectiveDropTimes = useMemo(
    () =>
      mergeDropTimes(
        park.dropTimes,
        learnedDropTimes(dropSummaries, parkExperienceIds)
      ),
    [park, dropSummaries, parkExperienceIds]
  );

  // Drops and the next-booking window are day-of phenomena. When the user is
  // watching a future date -- improving pre-booked selections before the trip
  // -- bursting at 09:47 for a day next week is pure waste, so the cadence
  // policy sees no targets and stays at its slow, steady rate. Availability
  // on future dates comes from cancellations, which have no schedule.
  const watchingToday = bookingDate === parkDate();
  const status = usePoller({
    enabled,
    onTick,
    dropTimes: watchingToday ? effectiveDropTimes : undefined,
    // Set as a side effect of ll.experiences(), so it is current as of the
    // last poll. Read fresh each tick by usePoller.
    nextBookTimes: watchingToday ? ll.nextBookTimes : undefined,
    rapid,
  });

  // The poller gives up after repeated failures without touching `enabled`, so
  // the release in `setEnabled` never runs. Holding the screen awake for a loop
  // that has stopped drains the battery for nothing.
  useEffect(() => {
    if (status.mode === 'stopped') void releaseScreenAwake(wakeLockOwner);
  }, [status.mode, wakeLockOwner]);

  const setEnabled = useCallback(
    (on: boolean) => {
      if (!on) {
        void releaseScreenAwake(wakeLockOwner);
      } else {
        // Both of these must be initiated inside the user gesture that turned
        // autopilot on -- primeAudio synchronously, and the permission request
        // at least called from here.
        primeAudio();
        void requestAlertPermission().then(setNotifications);
        // A locking screen backgrounds the page and clamps its timers, which
        // stops the poller as surely as closing it would. Requested from the
        // gesture for the same reason as the two above. Best-effort throughout:
        // where it is unsupported or refused, behaviour is unchanged.
        void holdScreenAwake(wakeLockOwner);
        // Forget past alerts so turning it back on re-alerts anything already
        // available, rather than staying silent about it.
        alertedRef.current = new Set();
        tickCountRef.current = 0;
        // Fresh locks and a clear cache per run, so a stale eligibility result
        // from an earlier session cannot drive a booking. The day's spend is
        // deliberately *not* fresh: turning autopilot off and on used to be the
        // only way to get more actions, and it came bundled with a wipe of the
        // drop-detection baseline, so buying actions cost the first poll's
        // ability to see a drop. Use the refill button instead.
        ledgerRef.current.reset();
        // With the locks, not merely alongside them: a token outliving the
        // lock it was minted for is the orphan case guarded against above.
        retryAtRef.current.clear();
        cacheRef.current.clear();
        // Re-baseline: a run comparing against the previous run's plans would
        // clear the cache on its own first poll.
        entitlementsRef.current = undefined;
        setBookedCount(0);
        setBookingsRemaining(ledgerRef.current.remaining);
        budgetSkipRef.current = false;
        setSkipCounts({});
        refusalRef.current = NO_REFUSALS;
        setRefusals(NO_REFUSALS);
        // Fresh baseline: the first poll of a run sees everything as "new", and
        // that must read as a baseline rather than a drop.
        snapshotRef.current = new Map();
      }
      setEnabledState(on);
    },
    [wakeLockOwner]
  );

  /**
   * The watched attractions the loaded tipboard actually covers.
   *
   * A watch list outlives the park it was built for: switch to Epcot and the
   * four Magic Kingdom targets are still stored, still listed by
   * `loadWatchList`, and completely inert -- matching runs against the
   * experiences on screen. Counting all of them told the user Autopilot was
   * watching four things while the list underneath showed one, which is the
   * count being wrong in the only sense that matters.
   *
   * While the tipboard has not loaded there is nothing to filter against, and
   * answering "none" would be a worse guess than answering "all of them" --
   * so an empty experience list means the question cannot be answered yet.
   */
  const targetsHere = useMemo(() => {
    if (experiences.length === 0) return targets;
    const here = new Set(experiences.map(exp => exp.id));
    return targets.filter(t => here.has(t.experienceId));
  }, [targets, experiences]);

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

  const replaceTargets = useCallback((next: WatchTarget[]) => {
    setTargets(next);
  }, []);

  const toggleAutoBook = useCallback((experienceId: string) => {
    setTargets(prev =>
      prev.map(t =>
        t.experienceId === experienceId ? { ...t, autoBook: !t.autoBook } : t
      )
    );
  }, []);

  const toggleFlag = useCallback(
    (experienceId: string, flag: 'bookThenMove' | 'paused' | 'autoSwap') => {
      setTargets(prev =>
        prev.map(t =>
          t.experienceId === experienceId ? { ...t, [flag]: !t[flag] } : t
        )
      );
    },
    []
  );

  /**
   * Set or clear one end of a target's return-time window.
   *
   * Kept separate from `toggleFlag`: the bounds are values rather than flags,
   * and an empty or unparseable input has to *remove* the bound rather than
   * store a falsy one, since `inWindow` treats an absent bound as unbounded.
   */
  const setTargetWindow = useCallback(
    (experienceId: string, bound: 'after' | 'before', value: string) => {
      const time = parseBound(value);
      setTargets(prev =>
        prev.map(t => {
          if (t.experienceId !== experienceId) return t;
          const next = { ...t };
          if (time) next[bound] = time;
          else delete next[bound];
          return next;
        })
      );
    },
    []
  );

  const toggleAutoModify = useCallback((experienceId: string) => {
    setTargets(prev =>
      prev.map(t =>
        t.experienceId === experienceId
          ? { ...t, autoModify: !t.autoModify }
          : t
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
        targetsHere,
        addTarget,
        removeTarget,
        replaceTargets,
        toggleAutoBook,
        toggleAutoModify,
        toggleBookThenMove: id => toggleFlag(id, 'bookThenMove'),
        togglePaused: id => toggleFlag(id, 'paused'),
        toggleAutoSwap: id => toggleFlag(id, 'autoSwap'),
        setTargetWindow,
        notifications,
        lastHit,
        bookingLog,
        bookedCount,
        // From the ledger, not `maxPerSession - bookedCount`: an unsettled
        // attempt also holds a slot, and recomputing would overstate what is
        // left.
        bookingsRemaining,
        actionBudget,
        refillBudget,
        maxActionsPerDay: settings.maxActionsPerDay,
        setMaxActionsPerDay: actions =>
          setSettings(prev => ({
            ...prev,
            maxActionsPerDay: sanitizeBudget(actions),
          })),
        requireWholeParty: settings.requireWholeParty,
        setRequireWholeParty: on =>
          setSettings(prev => ({ ...prev, requireWholeParty: on })),
        dryRun: settings.dryRun,
        setDryRun: on => setSettings(prev => ({ ...prev, dryRun: on })),
        avoidOverlaps: settings.avoidOverlaps,
        setAvoidOverlaps: on =>
          setSettings(prev => ({ ...prev, avoidOverlaps: on })),
        skipCounts,
        refusals,
        dropSummaries,
      }}
    >
      {children}
    </AutopilotContext>
  );
}
