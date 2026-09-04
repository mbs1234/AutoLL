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
            notifications,
            ...rest,
          }}
        >
          <Autopilot />
        </AutopilotContext>
      </ExperiencesContext>
    </ParkContext>
  );
  return { setEnabled, addTarget, removeTarget };
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
