import { fireEvent, render, screen, within } from '@testing-library/react';

import { mk, wdw } from '@/__fixtures__/resort';
import { Experience } from '@/api/ll';
import { AlertPermission } from '@/autopilot/alert';
import { PollerStatus } from '@/autopilot/usePoller';
import AutopilotContext, { AutopilotState } from '@/contexts/AutopilotContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import { ParkTime } from '@/datetime';

import Autopilot from './Autopilot';

const BZ = '80010114';
const DB = '80010129';

function llExperience(id: string): Experience {
  return {
    ...wdw.experience(id),
    park: mk,
    standby: { available: true, waitTime: 30 },
    flex: { available: true, nextAvailableTime: new ParkTime(11) },
  } as Experience;
}

/** An experience with no `flex` field, i.e. not Multi Pass eligible. */
function nonLLExperience(id: string): Experience {
  return {
    ...wdw.experience(id),
    park: mk,
    standby: { available: true, waitTime: 30 },
  } as Experience;
}

const OFF: PollerStatus = { mode: 'off', consecutiveFailures: 0, polls: 0 };

function setup({
  experiences = [llExperience(BZ), llExperience(DB)],
  watched = [] as string[],
  unknownExperienceIds = [] as string[],
  status = OFF,
  enabled = false,
  notifications = 'granted' as AlertPermission,
  ...rest
}: Partial<AutopilotState> & {
  experiences?: Experience[];
  watched?: string[];
  unknownExperienceIds?: string[];
} = {}) {
  const setEnabled = jest.fn();
  const addTarget = jest.fn();
  const removeTarget = jest.fn();
  const toggleAutoBook = jest.fn();
  const toggleAutoModify = jest.fn();
  const toggleBookThenMove = jest.fn();
  const togglePaused = jest.fn();
  const toggleAutoSwap = jest.fn();
  const setRequireWholeParty = jest.fn();
  const setDryRun = jest.fn();
  const setAvoidOverlaps = jest.fn();
  const refillBudget = jest.fn();
  const setMaxActionsPerDay = jest.fn();
  const setTargetWindow = jest.fn();
  render(
    <ParkContext value={{ park: mk, setPark: () => {} }}>
      <ExperiencesContext
        value={{
          experiences,
          refreshExperiences: () => {},
          pollExperiences: async () => [],
          unknownExperienceIds,
          loaderElem: null,
        }}
      >
        <AutopilotContext
          value={{
            enabled,
            setEnabled,
            status,
            targets: watched.map(experienceId => ({ experienceId })),
            isWatched: (id: string) => watched.includes(id),
            addTarget,
            removeTarget,
            toggleAutoBook,
            toggleAutoModify,
            toggleBookThenMove,
            togglePaused,
            toggleAutoSwap,
            setTargetWindow,
            notifications,
            requireWholeParty: false,
            setRequireWholeParty,
            dryRun: false,
            setDryRun,
            avoidOverlaps: true,
            setAvoidOverlaps,
            skipCounts: {},
            dropSummaries: [],
            bookingLog: [],
            bookedCount: 0,
            bookingsRemaining: 3,
            actionBudget: 10,
            refillBudget,
            maxActionsPerDay: 10,
            setMaxActionsPerDay,
            ...rest,
          }}
        >
          <Autopilot />
        </AutopilotContext>
      </ExperiencesContext>
    </ParkContext>
  );
  return {
    setEnabled,
    addTarget,
    removeTarget,
    toggleAutoBook,
    toggleAutoModify,
    toggleBookThenMove,
    togglePaused,
    toggleAutoSwap,
    setRequireWholeParty,
    setDryRun,
    setAvoidOverlaps,
    setTargetWindow,
    refillBudget,
    setMaxActionsPerDay,
  };
}

describe('Autopilot screen', () => {
  it('offers to turn on when off', () => {
    const { setEnabled } = setup();
    screen.getByText('Turn on autopilot').click();
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it('offers to turn off when on', () => {
    const { setEnabled } = setup({
      enabled: true,
      status: { ...OFF, mode: 'idle', polls: 3 },
    });
    screen.getByText('Turn off autopilot').click();
    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it('reports the current mode', () => {
    setup({ enabled: true, status: { ...OFF, mode: 'burst', polls: 12 } });
    expect(screen.getByText(/Checking rapidly/)).toBeInTheDocument();
    expect(screen.getByText(/12 checks/)).toBeInTheDocument();
  });

  it('explains why it stopped', () => {
    setup({
      enabled: true,
      status: {
        mode: 'stopped',
        consecutiveFailures: 8,
        polls: 20,
        lastError: 'Request failed',
      },
    });
    expect(screen.getByText(/Stopped after 8 failed checks/)).toBeVisible();
    expect(screen.getByText(/Request failed/)).toBeVisible();
  });

  it('lists Multi Pass attractions as watchable', () => {
    setup();
    expect(
      screen.getByTitle(`Watch ${wdw.experience(BZ).name}`)
    ).toBeInTheDocument();
  });

  // Matching reads the `flex` field and there is no Single Pass booking flow,
  // so listing non-Multi-Pass attractions would promise what it cannot do.
  it('omits attractions with no Multi Pass offer', () => {
    setup({ experiences: [nonLLExperience(BZ)] });
    expect(
      screen.queryByTitle(`Watch ${wdw.experience(BZ).name}`)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/No attractions loaded yet/)).toBeVisible();
  });

  it('adds a target', () => {
    const { addTarget } = setup();
    screen.getByTitle(`Watch ${wdw.experience(BZ).name}`).click();
    expect(addTarget).toHaveBeenCalledWith({ experienceId: BZ });
  });

  it('removes a target', () => {
    const { removeTarget } = setup({ watched: [BZ] });
    screen.getByTitle(`Stop watching ${wdw.experience(BZ).name}`).click();
    expect(removeTarget).toHaveBeenCalledWith(BZ);
  });

  it('does not offer to watch something already watched', () => {
    setup({ watched: [BZ] });
    expect(
      screen.queryByTitle(`Watch ${wdw.experience(BZ).name}`)
    ).not.toBeInTheDocument();
  });

  it('warns when notifications are blocked', () => {
    setup({ notifications: 'denied' });
    expect(screen.getByText(/Notifications are blocked/)).toBeVisible();
  });

  it('explains the iOS limitation when unsupported', () => {
    setup({ notifications: 'unsupported' });
    expect(screen.getByText(/Home Screen/)).toBeVisible();
  });

  it('shows auto-book as off by default', () => {
    setup({ watched: [BZ] });
    expect(
      screen.getByTitle(`Auto-book ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Auto-book off');
  });

  it('toggles auto-book for one attraction', () => {
    const { toggleAutoBook } = setup({ watched: [BZ] });
    screen.getByTitle(`Auto-book ${wdw.experience(BZ).name}`).click();
    expect(toggleAutoBook).toHaveBeenCalledWith(BZ);
  });

  it('reflects auto-book already on', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoBook: true }],
    });
    expect(
      screen.getByTitle(`Stop auto-booking ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Auto-book on');
  });

  // Booking spends a real entitlement, so the consequences are spelled out
  // rather than left implicit in a toggle.
  it('explains the booking limits when any target is armed', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoBook: true }],
      bookedCount: 1,
      bookingsRemaining: 2,
    });
    expect(screen.getByText(/Automatic booking is on/)).toBeVisible();
    expect(screen.getByText(/2 of 10 actions left today/)).toBeVisible();
  });

  // Book-then-move and swap both imply booking, so both spend the budget.
  // Gating the count on auto-book alone hid it from anyone using only those.
  it.each(['bookThenMove', 'autoSwap', 'autoModify'])(
    'shows the day budget for a target armed only with %s',
    flag => {
      setup({
        watched: [BZ],
        targets: [{ experienceId: BZ, [flag]: true }],
        bookingsRemaining: 2,
      });
      expect(screen.getByText(/2 of 10 actions left today/)).toBeVisible();
    }
  );

  it('offers a top-up once the day budget is gone, and only while running', () => {
    const { refillBudget } = setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoBook: true }],
      bookingsRemaining: 0,
      status: { mode: 'idle', consecutiveFailures: 0, polls: 3 },
    });
    expect(screen.getByText(/actions are used up/)).toBeVisible();
    screen.getByText('Add more for today').click();
    expect(refillBudget).toHaveBeenCalled();
  });

  // Off, an exhausted budget is a fact about earlier today rather than the
  // reason nothing is happening now.
  it('says nothing about the budget while switched off', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoBook: true }],
      bookingsRemaining: 0,
    });
    expect(screen.queryByText(/actions are used up/)).not.toBeInTheDocument();
  });

  it('says nothing about booking when no target is armed', () => {
    setup({ watched: [BZ] });
    expect(
      screen.queryByText(/Automatic booking is on/)
    ).not.toBeInTheDocument();
  });

  it('lists a successful booking', () => {
    setup({
      bookingLog: [
        {
          name: 'Big Thunder',
          at: new ParkTime(9, 47),
          status: 'booked',
          returnTime: new ParkTime(11, 5),
        },
      ],
    });
    expect(screen.getByText('Booking activity')).toBeVisible();
    expect(screen.getByText(/Big Thunder/)).toBeVisible();
  });

  it('lists a failed booking with its reason', () => {
    setup({
      bookingLog: [
        {
          name: 'Big Thunder',
          at: new ParkTime(9, 47),
          status: 'failed',
          detail: 'Request failed',
        },
      ],
    });
    expect(screen.getByText('failed')).toBeVisible();
    expect(screen.getByText(/Request failed/)).toBeVisible();
  });

  it('hides the activity section when nothing has happened', () => {
    setup();
    expect(screen.queryByText('Booking activity')).not.toBeInTheDocument();
  });

  it('shows the most recent find', () => {
    setup({
      lastHit: {
        experienceId: BZ,
        name: 'Big Thunder',
        returnTime: new ParkTime(13, 45),
      },
    });
    expect(screen.getByText(/Big Thunder/)).toBeVisible();
  });
});

describe('Autopilot screen auto-move', () => {
  it('shows auto-move as off by default', () => {
    setup({ watched: [BZ] });
    expect(
      screen.getByTitle(`Auto-move ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Auto-move off');
  });

  it('toggles auto-move independently of auto-book', () => {
    const { toggleAutoModify, toggleAutoBook } = setup({ watched: [BZ] });
    screen.getByTitle(`Auto-move ${wdw.experience(BZ).name}`).click();
    expect(toggleAutoModify).toHaveBeenCalledWith(BZ);
    expect(toggleAutoBook).not.toHaveBeenCalled();
  });

  it('reflects auto-move already on', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoModify: true }],
    });
    expect(
      screen.getByTitle(`Stop auto-moving ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Auto-move on');
  });

  // Moving a reservation you already hold can leave the day worse, so the
  // guarantees are spelled out.
  it('explains the auto-move guarantees', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoModify: true }],
    });
    expect(screen.getByText(/Auto-move is on/)).toBeVisible();
    expect(screen.getByText(/at least 30 minutes/)).toBeVisible();
    expect(screen.getByText(/never to a later time/)).toBeVisible();
  });

  it('says nothing about auto-move when nothing is armed for it', () => {
    setup({ watched: [BZ] });
    expect(screen.queryByText(/Auto-move is on/)).not.toBeInTheDocument();
  });

  it('logs a moved reservation with both times', () => {
    setup({
      bookingLog: [
        {
          name: 'Slinky Dog Dash',
          at: new ParkTime(9, 47),
          status: 'modified',
          fromTime: new ParkTime(19, 10),
          returnTime: new ParkTime(11, 20),
        },
      ],
    });
    expect(screen.getByText(/moved/)).toBeVisible();
    expect(screen.getByText(/Slinky Dog Dash/)).toBeVisible();
  });
});

describe('Autopilot screen book-then-move and pause', () => {
  it('shows book-then-move as off by default', () => {
    setup({ watched: [BZ] });
    expect(
      screen.getByTitle(`Book then move ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Book then move off');
  });

  it('toggles book-then-move', () => {
    const { toggleBookThenMove } = setup({ watched: [BZ] });
    screen.getByTitle(`Book then move ${wdw.experience(BZ).name}`).click();
    expect(toggleBookThenMove).toHaveBeenCalledWith(BZ);
  });

  it('explains book-then-move when armed', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, bookThenMove: true }],
    });
    expect(screen.getByText(/Book then move is on/)).toBeVisible();
    expect(screen.getByText(/even outside your window/)).toBeVisible();
  });

  it('offers to pause by default', () => {
    setup({ watched: [BZ] });
    expect(
      screen.getByTitle(`Pause ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Pause');
  });

  it('toggles pause', () => {
    const { togglePaused } = setup({ watched: [BZ] });
    screen.getByTitle(`Pause ${wdw.experience(BZ).name}`).click();
    expect(togglePaused).toHaveBeenCalledWith(BZ);
  });

  it('shows a paused attraction and how many are paused', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, paused: true }],
    });
    expect(
      screen.getByTitle(`Resume ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Paused');
    expect(screen.getByText(/1 paused/)).toBeVisible();
  });

  it('says nothing about pausing when nothing is paused', () => {
    setup({ watched: [BZ] });
    expect(screen.queryByText(/paused\./)).not.toBeInTheDocument();
  });
});

describe('Autopilot screen swap', () => {
  it('shows swap as off by default', () => {
    setup({ watched: [BZ] });
    expect(
      screen.getByTitle(`Swap in ${wdw.experience(BZ).name}`)
    ).toHaveTextContent('Swap in off');
  });

  it('toggles swap', () => {
    const { toggleAutoSwap } = setup({ watched: [BZ] });
    screen.getByTitle(`Swap in ${wdw.experience(BZ).name}`).click();
    expect(toggleAutoSwap).toHaveBeenCalledWith(BZ);
  });

  // Giving up a held reservation is the most consequential thing autopilot
  // does, so what it will and will not give up is spelled out.
  it('explains swapping when armed', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoSwap: true }],
    });
    expect(screen.getByText(/Swap in is on/)).toBeVisible();
    expect(screen.getByText(/lowest-priority/)).toBeVisible();
    expect(
      screen.getByText(/only released if the new one is secured/)
    ).toBeVisible();
  });

  it('logs a swap with what was given up', () => {
    setup({
      bookingLog: [
        {
          name: 'Slinky Dog Dash',
          at: new ParkTime(9, 47),
          status: 'swapped',
          replacedName: 'Toy Story Mania',
          fromTime: new ParkTime(15),
          returnTime: new ParkTime(11, 20),
        },
      ],
    });
    expect(screen.getByText(/swapped in/)).toBeVisible();
    expect(screen.getByText('Toy Story Mania')).toBeVisible();
  });
});

describe('Autopilot screen party and diagnostics', () => {
  it('shows the whole-party guard as off by default', () => {
    setup();
    expect(
      screen.getByTitle('Only act when the whole party is eligible')
    ).toHaveTextContent('Whole party only: off');
  });

  it('toggles the whole-party guard', () => {
    const { setRequireWholeParty } = setup();
    screen.getByTitle('Only act when the whole party is eligible').click();
    expect(setRequireWholeParty).toHaveBeenCalledWith(true);
  });

  it('reflects the guard when on and explains it', () => {
    setup({ requireWholeParty: true });
    expect(
      screen.getByTitle('Allow booking for part of the party')
    ).toHaveTextContent('Whole party only: on');
    expect(screen.getByText(/never split|worse than none/)).toBeVisible();
  });

  // Skips stay out of the log; this is where they become visible.
  it('explains why nothing was booked, most frequent first', () => {
    setup({
      skipCounts: { 'offer-outside-window': 2, 'partial-party': 7 },
    });
    expect(screen.getByText('Why nothing was booked')).toBeVisible();
    const items = screen.getAllByRole('listitem').map(li => li.textContent);
    const first = items.find(t => t?.includes('7×'));
    expect(first).toMatch(/not everyone in the party/);
    expect(screen.getByText(/outside the window/)).toBeVisible();
  });

  it('shows an unknown skip reason verbatim', () => {
    setup({ skipCounts: { 'something-new': 1 } });
    expect(screen.getByText(/something-new/)).toBeVisible();
  });

  it('hides the diagnostics when nothing was skipped', () => {
    setup();
    expect(
      screen.queryByText('Why nothing was booked')
    ).not.toBeInTheDocument();
  });
});

describe('Autopilot screen learned drops', () => {
  it('hides the section with nothing learned', () => {
    setup();
    expect(screen.queryByText('Learned drop times')).not.toBeInTheDocument();
  });

  it('shows observed drops with how many days they were seen', () => {
    setup({
      dropSummaries: [
        {
          experienceId: BZ,
          observed: [{ time: new ParkTime(9, 47), days: 3, count: 4 }],
          scheduled: [],
        },
      ],
    });
    expect(screen.getByText('Learned drop times')).toBeVisible();
    // Scope to the learned entry: the same attraction is also listed further
    // down as watchable, so the bare name appears twice on the screen.
    const entry = screen.getByText(/Seen:/).closest('li')!;
    expect(within(entry).getByText(wdw.experience(BZ).name)).toBeVisible();
    expect(within(entry).getByText(/3 days/)).toBeVisible();
    expect(screen.getByText(/4 observations/)).toBeVisible();
  });

  // Absence is evidence only when the poller was watching.
  it('flags a scheduled drop that was watched for but never seen', () => {
    setup({
      dropSummaries: [
        {
          experienceId: BZ,
          observed: [],
          scheduled: [
            { time: new ParkTime(9, 47), observedDays: 2, coveredDays: 2 },
            { time: new ParkTime(15, 47), observedDays: 0, coveredDays: 3 },
            { time: new ParkTime(19, 47), observedDays: 0, coveredDays: 0 },
          ],
        },
      ],
    });
    expect(screen.getByText(/seen 2 of 2 watched/)).toBeVisible();
    const missing = screen.getByText(/seen 0 of 3 watched/);
    expect(missing).toBeVisible();
    expect(missing).toHaveClass('text-red-700');
    expect(screen.getByText(/not watched yet/)).toBeVisible();
  });

  it('omits attractions with schedule entries that were never watched', () => {
    setup({
      dropSummaries: [
        {
          experienceId: BZ,
          observed: [],
          scheduled: [
            { time: new ParkTime(9, 47), observedDays: 0, coveredDays: 0 },
          ],
        },
      ],
    });
    expect(screen.queryByText('Learned drop times')).not.toBeInTheDocument();
  });

  it("falls back to the id for an attraction not on today's tipboard", () => {
    setup({
      dropSummaries: [
        {
          experienceId: 'elsewhere',
          observed: [{ time: new ParkTime(13, 17), days: 1, count: 1 }],
          scheduled: [],
        },
      ],
    });
    expect(screen.getByText('elsewhere')).toBeVisible();
  });
});

describe('Autopilot screen learned timing', () => {
  it('marks drops seen on enough days as used for timing', () => {
    setup({
      dropSummaries: [
        {
          experienceId: BZ,
          observed: [
            { time: new ParkTime(9, 47), days: 2, count: 2 },
            { time: new ParkTime(14, 17), days: 1, count: 1 },
          ],
          scheduled: [],
        },
      ],
    });
    const entry = screen.getByText(/Seen:/).closest('li')!;
    expect(within(entry).getByText(/2 days, used for timing/)).toBeVisible();
    expect(within(entry).getByText(/\(1 day\)/)).toBeVisible();
  });
});

describe('Autopilot screen dry run', () => {
  it('shows dry run as off by default with no banner', () => {
    setup();
    expect(screen.getByTitle('Rehearse without booking')).toHaveTextContent(
      'Dry run: off'
    );
    expect(screen.queryByText(/Dry run is on/)).not.toBeInTheDocument();
  });

  it('toggles dry run', () => {
    const { setDryRun } = setup();
    screen.getByTitle('Rehearse without booking').click();
    expect(setDryRun).toHaveBeenCalledWith(true);
  });

  // A forgotten dry run would look like a broken booker, so it is loud.
  it('shows a prominent banner while on', () => {
    setup({ dryRun: true });
    expect(screen.getByText(/Dry run is on/)).toBeVisible();
    expect(screen.getByTitle('Let autopilot act for real')).toHaveTextContent(
      'Dry run: on'
    );
  });

  it('logs what would have happened, per action', () => {
    setup({
      bookingLog: [
        {
          name: 'A',
          at: new ParkTime(9),
          status: 'dry-run',
          detail: 'book',
          returnTime: new ParkTime(11),
        },
        {
          name: 'B',
          at: new ParkTime(9, 1),
          status: 'dry-run',
          detail: 'modify',
        },
        {
          name: 'C',
          at: new ParkTime(9, 2),
          status: 'dry-run',
          detail: 'swap',
        },
      ],
    });
    const items = screen
      .getAllByRole('listitem')
      .map(li => li.textContent ?? '');
    expect(items.some(t => /would have booked A/.test(t))).toBe(true);
    expect(items.some(t => /would have moved B/.test(t))).toBe(true);
    expect(items.some(t => /would have swapped in C/.test(t))).toBe(true);
  });
});

describe('return-time window', () => {
  // The window is declared, persisted, revived and gates four code paths, but
  // until this existed the only way to set one was to hand-edit localStorage.
  it('sets a bound from the time inputs', () => {
    const { setTargetWindow } = setup({ watched: [BZ] });
    const name = wdw.experience(BZ).name;
    fireEvent.change(
      screen.getByLabelText(`Earliest return time for ${name}`),
      {
        target: { value: '15:30' },
      }
    );
    expect(setTargetWindow).toHaveBeenCalledWith(BZ, 'after', '15:30');
  });

  it('shows the bounds already set', () => {
    setup({
      watched: [BZ],
      targets: [
        {
          experienceId: BZ,
          after: new ParkTime(15, 30),
          before: new ParkTime(19),
        },
      ],
    });
    const name = wdw.experience(BZ).name;
    expect(
      screen.getByLabelText(`Earliest return time for ${name}`)
    ).toHaveValue('15:30');
    expect(screen.getByLabelText(`Latest return time for ${name}`)).toHaveValue(
      '19:00'
    );
  });

  // Alerting wide is the point: a window that silenced alerts would hide the
  // one thing worth knowing.
  it('says the window limits acting rather than alerting', () => {
    setup({ watched: [BZ] });
    expect(screen.getByText(/still alerts/)).toBeVisible();
  });
});

describe('unknown attractions', () => {
  // An id missing from the data file is dropped silently: no row, no watch
  // target, no booking, and nothing on screen saying why.
  it('warns when Disney lists an attraction this build does not know', () => {
    setup({ unknownExperienceIds: ['412573652'] });
    expect(screen.getByText(/does not recognise/)).toBeVisible();
  });

  it('says nothing when every listed attraction is known', () => {
    setup({});
    expect(screen.queryByText(/does not recognise/)).not.toBeInTheDocument();
  });
});

describe('clash avoidance', () => {
  it('can be turned off', () => {
    const { setAvoidOverlaps } = setup({ avoidOverlaps: true });
    screen.getByTitle('Allow times that clash with existing plans').click();
    expect(setAvoidOverlaps).toHaveBeenCalledWith(false);
  });
});

describe('the day allowance', () => {
  const field = () => screen.getByLabelText('Actions allowed per day');

  // Typing "15" passes through "1". A controlled input writing straight
  // through would set the day's budget to 1 mid-keystroke, which with two
  // actions already spent is enough to stop autopilot until the second digit
  // lands.
  it('commits on blur rather than on every keystroke', () => {
    const { setMaxActionsPerDay } = setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoBook: true }],
      maxActionsPerDay: 10,
    });
    fireEvent.change(field(), { target: { value: '1' } });
    fireEvent.change(field(), { target: { value: '15' } });
    expect(setMaxActionsPerDay).not.toHaveBeenCalled();
    fireEvent.blur(field());
    expect(setMaxActionsPerDay).toHaveBeenCalledTimes(1);
    expect(setMaxActionsPerDay).toHaveBeenCalledWith(15);
  });

  it('shows the allowance currently set', () => {
    setup({
      watched: [BZ],
      targets: [{ experienceId: BZ, autoSwap: true }],
      maxActionsPerDay: 12,
    });
    expect(field()).toHaveValue(12);
  });
});
