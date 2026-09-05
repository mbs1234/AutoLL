import { use, useState } from 'react';

import { Experience } from '@/api/ll';
import { findExistingLL } from '@/autopilot/automodify';
import { parseBound } from '@/autopilot/watchlist';
import Button from '@/components/Button';
import Tab from '@/components/Tab';
import { Time } from '@/components/Time';
import AutopilotContext from '@/contexts/AutopilotContext';
import BookingDateContext from '@/contexts/BookingDateContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import PlansContext from '@/contexts/PlansContext';
import { parkDate } from '@/datetime';
import useSavedParty from '@/hooks/useSavedParty';
import AutopilotProvider from '@/providers/AutopilotProvider';

import { HomeTabProps } from '../Home';
import RefreshButton from '../RefreshButton';
import ParkSelect from './ParkSelect';

export const NEXTLL = 'NextLL';

/**
 * Its own watch list, its own poller, inside AutoLL's tree.
 *
 * Nested rather than driving the Autopilot the tab bar already sits inside:
 * that one may be armed with a day's worth of attractions, and a quick search
 * must not add a sixth target to it, turn the whole thing on, or -- worse --
 * have Stop switch it all off. What it does inherit, by being nested, is the
 * park, the booking date, the plans, the tipboard and the login.
 */
export const NEXTLL_WATCHLIST_KEY = 'bg1.nextll.watchlist';

export default function NextLLTab({ ref }: HomeTabProps) {
  return (
    <AutopilotProvider
      watchListKey={NEXTLL_WATCHLIST_KEY}
      rapid
      budgeted={false}
      repeatMoves
    >
      <NextLL ref={ref} />
    </AutopilotProvider>
  );
}

/**
 * One attraction, one goal, one button.
 *
 * Autopilot's screen exposes every lever: six toggles per attraction, windows,
 * a budget, dry run, whole-party, clash avoidance. That is the right shape for
 * setting up a day in advance. It is the wrong shape at 7am with one hand and
 * a coffee, which is the moment this exists for -- "I want Slinky Dog, as
 * early as you can, go".
 *
 * Everything below is the Autopilot machinery underneath, driven through a
 * single target rather than a list. The strategy is `bookThenMove`, which is
 * exactly this problem already solved: while nothing is held the window is
 * stripped so any offered time is taken -- holding something beats holding
 * nothing -- and once something is held the window becomes the goal the move
 * step works toward.
 */
export function NextLL({ ref }: Partial<HomeTabProps> = {}) {
  // Applies the party saved in the LL tab. Only `useSavedParty` calls
  // `ll.setPartyIds`, and it is mounted by `MultiPassList` -- which is not
  // mounted while this tab is showing. Without this, an empty party id set
  // means nobody is marked NOT_IN_PARTY and a search books for everyone
  // eligible on the account, silently overriding the choice made next door.
  const [partyIds] = useSavedParty();
  const { experiences, refreshExperiences } = use(ExperiencesContext);
  const { plans } = use(PlansContext);
  const { bookingDate } = use(BookingDateContext);
  const {
    enabled,
    setEnabled,
    status,
    targets,
    addTarget,
    removeTarget,
    bookingLog,
  } = use(AutopilotContext);

  const [choice, setChoice] = useState('');
  const [before, setBefore] = useState('');

  // Multi Pass only, same as Autopilot: matching reads `flex`, and there is no
  // Single Pass booking flow to offer.
  const bookable = experiences
    .filter((exp): exp is Experience => !!exp.flex)
    .sort((a, b) => a.name.localeCompare(b.name));

  const target = targets[0];
  const chosen = bookable.find(
    exp => exp.id === (target?.experienceId ?? choice)
  );
  const held = chosen && findExistingLL(plans, chosen.id, bookingDate);
  const goalMet =
    !!held && (!target?.before || +held.start.time <= +target.before);

  function start() {
    if (!choice) return;
    const bound = parseBound(before);
    addTarget({
      experienceId: choice,
      bookThenMove: true,
      ...(bound ? { before: bound } : {}),
    });
    setEnabled(true);
  }

  function stop() {
    setEnabled(false);
    if (target) removeTarget(target.experienceId);
  }

  return (
    <Tab
      title={NEXTLL}
      buttons={
        <>
          <ParkSelect />
          <RefreshButton name="Experiences" onClick={refreshExperiences} />
        </>
      }
      ref={ref}
    >
      {!enabled ? (
        <>
          <p>
            Pick one attraction and NextLL will take the first Lightning Lane it
            can get, then keep trying to move it earlier.
          </p>

          <label className="mt-4 block">
            <span className="font-semibold">Attraction</span>
            <select
              className="mt-1 block w-full rounded-sm border border-gray-300 p-2"
              value={choice}
              onChange={e => setChoice(e.target.value)}
            >
              <option value="">Choose one&hellip;</option>
              {bookable.map(exp => (
                <option key={exp.id} value={exp.id}>
                  {exp.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold">Return by</span>
            <input
              type="time"
              aria-label="Latest acceptable return time"
              className="rounded-sm border border-gray-300 px-1 py-0.5"
              value={before}
              onChange={e => setBefore(e.target.value)}
            />
            <span className="text-sm text-gray-600">
              optional &mdash; leave empty for as early as possible
            </span>
          </label>

          <div className="mt-4">
            <Button type="full" onClick={start}>
              Find it
            </Button>
          </div>

          <p className="mt-3 text-sm text-gray-600">
            {partyIds.size > 0
              ? `Books for your saved party of ${partyIds.size}. Change it from the LL tab.`
              : 'Books for everyone eligible. Choose a smaller party from the LL tab if you want fewer.'}
          </p>

          {bookable.length === 0 && (
            <p className="mt-3 text-sm text-gray-600">
              No attractions loaded yet. Switch to the LL tab and let the list
              load first, or pick a different park there.
            </p>
          )}
        </>
      ) : (
        <>
          <h2 className="mt-2 text-xl font-semibold">{chosen?.name}</h2>

          {held ? (
            <p className="mt-2">
              Holding <Time time={held.start.time} />
              {goalMet ? (
                <span className="font-semibold"> &mdash; that will do.</span>
              ) : (
                <> &mdash; still looking for something earlier.</>
              )}
            </p>
          ) : (
            <p className="mt-2">
              Nothing held yet. Checking&hellip;{' '}
              <span className="text-gray-500">
                ({status.polls} {status.polls === 1 ? 'check' : 'checks'})
              </span>
            </p>
          )}

          {target?.before && (
            <p className="mt-1 text-sm text-gray-600">
              Goal: a return time at or before <Time time={target.before} />.
            </p>
          )}

          {bookingDate !== parkDate() && (
            <p className="mt-1 text-sm text-gray-600">
              Working on {bookingDate}, not today.
            </p>
          )}

          <div className="mt-4">
            <Button type="full" color="bg-red-700 text-white" onClick={stop}>
              {goalMet ? 'Done' : 'Stop looking'}
            </Button>
          </div>

          <p className="mt-3 text-sm text-gray-600">
            Keep this screen open and in front. Your phone will not sleep while
            it runs.
          </p>

          {bookingLog.length > 0 && (
            <>
              <h3>What happened</h3>
              <ul className="text-sm">
                {bookingLog.map((entry, i) => (
                  <li key={`${entry.name}-${i}`} className="py-0.5">
                    <Time time={entry.at} />{' '}
                    {entry.status === 'booked' ? (
                      <>
                        got <Time time={entry.returnTime!} />
                      </>
                    ) : entry.status === 'modified' ? (
                      <>
                        moved to <Time time={entry.returnTime!} />
                      </>
                    ) : entry.status === 'failed' ? (
                      <span className="text-red-700">
                        failed{entry.detail ? `: ${entry.detail}` : ''}
                      </span>
                    ) : (
                      entry.status
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Tab>
  );
}
