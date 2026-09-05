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
import { wholePartyEligible } from '@/autopilot/party';
import { GuestCache, prewarmGuests } from '@/autopilot/prewarm';
import { orderByPriority, shouldHoldTierSlot } from '@/autopilot/priority';
import { syncedParkTime } from '@/autopilot/schedule';
import {
  loadBookingLog,
  loadSettings,
  saveBookingLog,
  saveSettings,
} from '@/autopilot/storage';
import usePoller from '@/autopilot/usePoller';
import { holdScreenAwake, releaseScreenAwake } from '@/autopilot/wakelock';
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
import { ParkTime, formatTime, parkDate } from '@/datetime';
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
  const { experiences, pollExperiences } = use(ExperiencesContext);
  const { plans, pollPlans } = use(PlansContext);

  // Deliberately not persisted. A poller that resumes on page load has no
  // user gesture behind it, so it could not play sound, and silently issuing
  // requests -- let alone bookings -- on load is a surprising default. This is
  // also what makes persisting per-target autoBook safe.
  const [enabled, setEnabledState] = useState(false);
  const [targets, setTargets] = useState<WatchTarget[]>(loadWatchList);
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

  const alertedRef = useRef<ReadonlySet<string>>(new Set());
  const tickCountRef = useRef(0);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const bookingDateRef = useRef(bookingDate);
  bookingDateRef.current = bookingDate;
  // Read at tick time: setState from a plans poll has not re-rendered yet
  // when the booking loop runs immediately afterwards.
  const plansRef = useRef(plans);
  plansRef.current = plans;

  const cacheRef = useRef(new GuestCache());
  const ledgerRef = useRef(new AutoBookLedger());

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

  // Block body on purpose: an expression body would return saveWatchList's
  // value, which React would treat as a cleanup function.
  useEffect(() => {
    saveWatchList(targets);
  }, [targets]);
  useEffect(() => {
    saveBookingLog(bookingLog);
  }, [bookingLog]);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Unmount is the one path that bypasses `setEnabled(false)`, and a wake lock
  // outliving the screen that requested it would keep the phone awake with
  // nothing running.
  useEffect(() => () => void releaseScreenAwake(), []);

  const bumpSkip = useCallback((reason: string) => {
    setSkipCounts(prev => ({ ...prev, [reason]: (prev[reason] ?? 0) + 1 }));
  }, []);

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

  const onTick = useCallback(async () => {
    // Let this reject: the poller needs the failure to drive backoff.
    const experiences = await pollExperiences();

    // Learn from what just came back. Only on the current park day: a future
    // date's tipboard changes with cancellations, which are not drops, and its
    // times would be filed under the wrong day.
    if (bookingDateRef.current === parkDate()) {
      const observedAt = syncedParkTime();
      const obsDate = bookingDateRef.current;
      const next = snapshotOf(experiences);
      const events = detectDropEvents(
        snapshotRef.current,
        next,
        observedAt,
        obsDate
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

    const date = bookingDateRef.current;
    const heldToday = (experienceId: string) =>
      findExistingLL(plansRef.current, experienceId, date);
    const allHeldToday = heldMPToday(plansRef.current, date);
    const partyIsFull = allHeldToday.length >= MAX_HELD_MP;

    // Settle any booking whose fate was unknown. Disney allows booking,
    // cancelling and rebooking the same attraction, so a permanent attempt
    // lock would forfeit a better time that appears after a manual cancel.
    // Only plans fetched during this tick count as evidence.
    if (freshPlans) {
      const settled = freshPlans;
      for (const id of ledgerRef.current.attemptedBookIds) {
        ledgerRef.current.resolveBook(id, !!findExistingLL(settled, id, date));
      }
      // Settling can charge the allowance for a booking whose request never
      // returned, so the on-screen count has to follow the ledger rather than
      // only successful actions.
      setBookedCount(ledgerRef.current.bookedCount);
      setBookingsRemaining(ledgerRef.current.remaining);
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

    const expsById = new Map(experiences.map(exp => [exp.id, exp]));
    const nowTime = syncedParkTime();

    // The one-Tier-1-at-a-time rule lifts after the party's first redemption
    // of the day. LLTracker marks a redeemed attraction `experienced` (its
    // booking turns cancellable-but-not-modifiable, or it disappears with
    // EXPERIENCE_LIMIT_REACHED), and the tipboard carries that flag, so this
    // is readable right here without another request.
    const redeemedToday = experiences.some(exp => exp.experienced);

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
      if (target.paused) continue;
      const wantsBook = !!(
        target.autoBook ||
        target.bookThenMove ||
        target.autoSwap
      );
      const wantsModify = !!(target.autoModify || target.bookThenMove);
      const wantsSwap = !!target.autoSwap;
      if (!wantsBook && !wantsModify && !wantsSwap) continue;
      if (ledgerRef.current.remaining <= 0) break;

      // Holding a reservation already makes booking a second one pointless --
      // Disney would reject it -- so the only useful action is re-timing. With
      // nothing held and every slot full, the only way in is to swap.
      const existing = heldToday(experience.id);
      const kind = existing
        ? 'modify'
        : partyIsFull && wantsSwap
          ? 'swap'
          : 'book';
      if (ledgerRef.current.hasAttempted(experience.id, kind)) continue;
      if (kind === 'modify' && !wantsModify) continue;
      if (kind === 'book' && !wantsBook) continue;

      let outcome: AutoBookOutcome | ModifyOutcome | SwapOutcome;
      try {
        const guests = await guestsFor(experience.id);
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

        // Only new bookings can spend the party's Tier 1 slot; re-timing or
        // swapping one already held does not. Checked here, ahead of the
        // branches, so a dry run rehearses it as well.
        if (
          kind === 'book' &&
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
              ? shouldSwap(target, experience, allHeldToday, ledgerRef.current)
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
            }
          );
        } else {
          // The effective target: window stripped under book-then-move.
          outcome = await attemptAutoBook(hit.target, experience, {
            createOffer: (exp, g) =>
              ll.offer(exp, g, { date: bookingDateRef.current }),
            book: offer => ll.book(offer),
            guests,
            ledger: ledgerRef.current,
          });
        }
      } catch (error) {
        // Only guestsFor can throw out here; the attempt helpers handle their
        // own failures.
        console.error(error);
        outcome = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }

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

      if (
        outcome.status === 'booked' ||
        outcome.status === 'modified' ||
        outcome.status === 'swapped'
      ) {
        // Any change shifts eligibility across every experience at once via
        // party, tier and overlap limits, so the whole cache is invalid.
        cacheRef.current.clear();
        fireAlert(
          outcome.status === 'booked'
            ? {
                title: `Booked ${experience.name}`,
                body: `Return time ${formatTime(outcome.returnTime)}`,
                tag: `bg1-autopilot-booked-${experience.id}`,
              }
            : outcome.status === 'modified'
              ? {
                  title: `Moved ${experience.name} earlier`,
                  body: `${formatTime(outcome.from)} to ${formatTime(outcome.to)}`,
                  tag: `bg1-autopilot-booked-${experience.id}`,
                }
              : {
                  title: `Swapped in ${experience.name}`,
                  body: `Gave up ${outcome.replaced.name}; return ${formatTime(outcome.to)}`,
                  tag: `bg1-autopilot-booked-${experience.id}`,
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
      await prewarmGuests(toWarm, bookingDateRef.current, {
        fetchGuests: (experience, date) => ll.guests(experience, date),
        cache: cacheRef.current,
        now: clock,
      });
    }
  }, [pollExperiences, pollPlans, ll, guestsFor, clock, logOutcome, bumpSkip]);

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
    nextBookTime: watchingToday ? ll.nextBookTime : undefined,
  });

  // The poller gives up after repeated failures without touching `enabled`, so
  // the release in `setEnabled` never runs. Holding the screen awake for a loop
  // that has stopped drains the battery for nothing.
  useEffect(() => {
    if (status.mode === 'stopped') void releaseScreenAwake();
  }, [status.mode]);

  const setEnabled = useCallback((on: boolean) => {
    if (!on) {
      void releaseScreenAwake();
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
      void holdScreenAwake();
      // Forget past alerts so turning it back on re-alerts anything already
      // available, rather than staying silent about it.
      alertedRef.current = new Set();
      tickCountRef.current = 0;
      // Fresh allowance and a clear cache per run, so a stale eligibility
      // result from an earlier session cannot drive a booking.
      ledgerRef.current.reset();
      cacheRef.current.clear();
      setBookedCount(0);
      setBookingsRemaining(ledgerRef.current.remaining);
      setSkipCounts({});
      // Fresh baseline: the first poll of a run sees everything as "new", and
      // that must read as a baseline rather than a drop.
      snapshotRef.current = new Map();
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
        addTarget,
        removeTarget,
        toggleAutoBook,
        toggleAutoModify,
        toggleBookThenMove: id => toggleFlag(id, 'bookThenMove'),
        togglePaused: id => toggleFlag(id, 'paused'),
        toggleAutoSwap: id => toggleFlag(id, 'autoSwap'),
        notifications,
        lastHit,
        bookingLog,
        bookedCount,
        // From the ledger, not `maxPerSession - bookedCount`: an unsettled
        // attempt also holds a slot, and recomputing would overstate what is
        // left.
        bookingsRemaining,
        requireWholeParty: settings.requireWholeParty,
        setRequireWholeParty: on =>
          setSettings(prev => ({ ...prev, requireWholeParty: on })),
        dryRun: settings.dryRun,
        setDryRun: on => setSettings(prev => ({ ...prev, dryRun: on })),
        skipCounts,
        dropSummaries,
      }}
    >
      {children}
    </AutopilotContext>
  );
}
