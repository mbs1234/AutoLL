import { use, useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertPermission,
  alertPermission,
  fireAlert,
  primeAudio,
  requestAlertPermission,
} from '@/autopilot/alert';
import usePoller from '@/autopilot/usePoller';
import {
  WatchTarget,
  loadWatchList,
  matchWatchList,
  saveWatchList,
  selectNewAlerts,
} from '@/autopilot/watchlist';
import AutopilotContext, { AutopilotHit } from '@/contexts/AutopilotContext';
import ClientsContext from '@/contexts/ClientsContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import { formatTime } from '@/datetime';

/**
 * Refresh plans every Nth tick rather than every tick.
 *
 * Plans cost a request and change only when something is booked or cancelled,
 * while experiences carry the availability the poller exists to watch. In
 * burst mode this still refreshes plans roughly every 12 seconds.
 */
export const PLANS_EVERY_N_TICKS = 10;

/**
 * Wires the poller, the watch list and alerting together.
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
  const { pollExperiences } = use(ExperiencesContext);
  const { pollPlans } = use(PlansContext);

  // Deliberately not persisted. A poller that resumes on page load has no
  // user gesture behind it, so it could not play sound, and silently issuing
  // requests on load is a surprising default.
  const [enabled, setEnabledState] = useState(false);
  const [targets, setTargets] = useState<WatchTarget[]>(loadWatchList);
  const [notifications, setNotifications] =
    useState<AlertPermission>(alertPermission);
  const [lastHit, setLastHit] = useState<AutopilotHit>();

  const alertedRef = useRef<ReadonlySet<string>>(new Set());
  const tickCountRef = useRef(0);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  // Block body on purpose: an expression body would return saveWatchList's
  // value, which React would treat as a cleanup function.
  useEffect(() => {
    saveWatchList(targets);
  }, [targets]);

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
  }, [pollExperiences, pollPlans]);

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
        notifications,
        lastHit,
      }}
    >
      {children}
    </AutopilotContext>
  );
}
