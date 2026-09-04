import { render, screen } from '@testing-library/react';

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
  status = OFF,
  enabled = false,
  notifications = 'granted' as AlertPermission,
  ...rest
}: Partial<AutopilotState> & {
  experiences?: Experience[];
  watched?: string[];
} = {}) {
  const setEnabled = jest.fn();
  const addTarget = jest.fn();
  const removeTarget = jest.fn();
  const toggleAutoBook = jest.fn();
  const toggleAutoModify = jest.fn();
  render(
    <ParkContext value={{ park: mk, setPark: () => {} }}>
      <ExperiencesContext
        value={{
          experiences,
          refreshExperiences: () => {},
          pollExperiences: async () => [],
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
            notifications,
            bookingLog: [],
            bookedCount: 0,
            bookingsRemaining: 3,
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
    expect(screen.getByText(/at most 3 per session/)).toBeVisible();
    expect(screen.getByText(/2 left/)).toBeVisible();
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
