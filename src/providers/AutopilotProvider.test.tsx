import { act, render, screen, waitFor } from '@testing-library/react';
import { use } from 'react';

import { mk, wdw } from '@/__fixtures__/resort';
import { Experience, FlexExperience } from '@/api/ll';
import { fireAlert, primeAudio } from '@/autopilot/alert';
import { saveWatchList } from '@/autopilot/watchlist';
import AutopilotContext from '@/contexts/AutopilotContext';
import ClientsContext, { Clients } from '@/contexts/ClientsContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import { ParkTime } from '@/datetime';

import AutopilotProvider, { PLANS_EVERY_N_TICKS } from './AutopilotProvider';

// An explicit factory rather than an auto-mock: auto-mocking makes
// requestAlertPermission return undefined, and the provider calls .then() on
// it, which throws inside the toggle handler.
jest.mock('@/autopilot/alert', () => ({
  alertPermission: jest.fn(() => 'granted'),
  requestAlertPermission: jest.fn(async () => 'granted'),
  primeAudio: jest.fn(),
  fireAlert: jest.fn(),
}));
jest.mock('@/timesync');
jest.useFakeTimers();

const BZ = '80010114';
const DB = '80010129';

function available(id: string, time: ParkTime): FlexExperience {
  return {
    ...wdw.experience(id),
    park: mk,
    standby: { available: true, waitTime: 30 },
    flex: { available: true, nextAvailableTime: time },
  } as FlexExperience;
}

/** Exposes the context so tests can drive the toggle and read status. */
function Probe() {
  const { enabled, setEnabled, status, targets } = use(AutopilotContext);
  return (
    <div>
      <button onClick={() => setEnabled(!enabled)}>toggle</button>
      <span data-testid="mode">{status.mode}</span>
      <span data-testid="targets">{targets.length}</span>
    </div>
  );
}

function setup(experiences: Experience[]) {
  const pollExperiences = jest.fn(async () => experiences);
  const pollPlans = jest.fn(async () => undefined);
  render(
    <ClientsContext value={{ ll: { nextBookTime: undefined } } as Clients}>
      <ParkContext value={{ park: mk, setPark: () => {} }}>
        <ExperiencesContext
          value={{
            experiences: [],
            refreshExperiences: () => {},
            pollExperiences,
            loaderElem: null,
          }}
        >
          <PlansContext
            value={{
              plans: [],
              refreshPlans: () => {},
              pollPlans,
              loaderElem: null,
            }}
          >
            <AutopilotProvider>
              <Probe />
            </AutopilotProvider>
          </PlansContext>
        </ExperiencesContext>
      </ParkContext>
    </ClientsContext>
  );
  return { pollExperiences, pollPlans };
}

async function enable() {
  await act(async () => {
    screen.getByText('toggle').click();
  });
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('AutopilotProvider', () => {
  it('polls nothing until enabled', async () => {
    const { pollExperiences } = setup([available(BZ, new ParkTime(11))]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(pollExperiences).not.toHaveBeenCalled();
    expect(screen.getByTestId('mode')).toHaveTextContent('off');
  });

  // Unlocking audio has to happen inside the gesture that turned it on;
  // doing it later, when a drop lands, produces silence on mobile.
  it('primes audio when switched on', async () => {
    setup([]);
    await enable();
    expect(primeAudio).toHaveBeenCalled();
  });

  it('alerts for a watched experience that is available', async () => {
    saveWatchList([{ experienceId: BZ }]);
    setup([available(BZ, new ParkTime(11, 5))]);
    await enable();
    await waitFor(() => expect(fireAlert).toHaveBeenCalledTimes(1));
    expect(fireAlert).toHaveBeenCalledWith(
      expect.objectContaining({ tag: `bg1-autopilot-${BZ}` })
    );
  });

  it('stays silent for an experience that is not watched', async () => {
    saveWatchList([{ experienceId: DB }]);
    setup([available(BZ, new ParkTime(11, 5))]);
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(fireAlert).not.toHaveBeenCalled();
  });

  it('alerts only once while the same offer persists', async () => {
    saveWatchList([{ experienceId: BZ }]);
    setup([available(BZ, new ParkTime(11, 5))]);
    await enable();
    await waitFor(() => expect(fireAlert).toHaveBeenCalledTimes(1));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000 * 3);
    });
    expect(fireAlert).toHaveBeenCalledTimes(1);
  });

  it('respects a watch window', async () => {
    saveWatchList([{ experienceId: BZ, after: new ParkTime(15) }]);
    setup([available(BZ, new ParkTime(11, 5))]);
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(fireAlert).not.toHaveBeenCalled();
  });

  // Plans cost a request and change rarely, so they refresh on a slower
  // cadence than availability.
  it('polls plans less often than experiences', async () => {
    const { pollExperiences, pollPlans } = setup([]);
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000 * (PLANS_EVERY_N_TICKS + 2));
    });
    expect(pollExperiences.mock.calls.length).toBeGreaterThan(
      pollPlans.mock.calls.length
    );
    expect(pollPlans).toHaveBeenCalled();
  });

  // A plans failure must not count against the poller's failure budget or
  // stall availability polling.
  it('keeps polling when plans fail', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const experiences: Experience[] = [];
    const pollExperiences = jest.fn(async () => experiences);
    render(
      <ClientsContext value={{ ll: { nextBookTime: undefined } } as Clients}>
        <ParkContext value={{ park: mk, setPark: () => {} }}>
          <ExperiencesContext
            value={{
              experiences: [],
              refreshExperiences: () => {},
              pollExperiences,
              loaderElem: null,
            }}
          >
            <PlansContext
              value={{
                plans: [],
                refreshPlans: () => {},
                pollPlans: async () => {
                  throw new Error('plans down');
                },
                loaderElem: null,
              }}
            >
              <AutopilotProvider>
                <Probe />
              </AutopilotProvider>
            </PlansContext>
          </ExperiencesContext>
        </ParkContext>
      </ClientsContext>
    );
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000 * 3);
    });
    expect(pollExperiences.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByTestId('mode')).not.toHaveTextContent('stopped');
  });

  it('loads a saved watch list on mount', async () => {
    saveWatchList([{ experienceId: BZ }, { experienceId: DB }]);
    setup([]);
    expect(screen.getByTestId('targets')).toHaveTextContent('2');
  });
});
