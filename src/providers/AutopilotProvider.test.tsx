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
import { DateTime, ParkTime } from '@/datetime';

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

describe('AutopilotProvider auto-booking', () => {
  const party = { eligible: [{ id: 'g1', name: 'A' }], ineligible: [] };

  function offerAt(hour: number) {
    return {
      id: 'offer-1',
      offerSetId: 'set-1',
      start: new DateTime('2026-09-04', new ParkTime(hour)),
      end: new DateTime('2026-09-04', new ParkTime(hour + 1)),
      guests: party,
      itinerary: [],
      booking: undefined,
    };
  }

  function setupBooking({
    offerHour = 11,
    experiences = [available(BZ, new ParkTime(11))],
  } = {}) {
    const guests = jest.fn(async () => party);
    const offer = jest.fn(async () => offerAt(offerHour));
    const book = jest.fn(async () => ({ id: 'ent-1' }));
    const pollPlans = jest.fn(async () => undefined);
    render(
      <ClientsContext
        // Two-step cast: with the jest.Mock members present this no longer
        // merely omits properties from Clients, it conflicts with them.
        value={
          {
            ll: { nextBookTime: undefined, guests, offer, book },
          } as unknown as Clients
        }
      >
        <ParkContext value={{ park: mk, setPark: () => {} }}>
          <ExperiencesContext
            value={{
              experiences: [],
              refreshExperiences: () => {},
              pollExperiences: async () => experiences,
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
    return { guests, offer, book, pollPlans };
  }

  it('books a watched attraction that is armed', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book } = setupBooking();
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
  });

  // Alerting and booking are deliberately separate decisions.
  it('does not book a watched attraction that is not armed', async () => {
    saveWatchList([{ experienceId: BZ }]);
    const { book, offer } = setupBooking();
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(offer).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
  });

  // The load-bearing guard: matching runs on the tipboard time, but the offer
  // can come back with a later one.
  it('refuses to book an offer outside the window', async () => {
    saveWatchList([
      { experienceId: BZ, autoBook: true, before: new ParkTime(12) },
    ]);
    const { offer, book } = setupBooking({ offerHour: 20 });
    await enable();
    await waitFor(() => expect(offer).toHaveBeenCalled());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(book).not.toHaveBeenCalled();
  });

  it('books at most once per attraction', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book } = setupBooking();
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000 * 3);
    });
    expect(book).toHaveBeenCalledTimes(1);
  });

  it('refreshes plans after booking so the new reservation shows', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book, pollPlans } = setupBooking();
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalled());
    expect(pollPlans.mock.calls.length).toBeGreaterThan(1);
  });

  // Eligibility is the one request in the booking path that does not change
  // second to second, so it is fetched ahead of the moment that matters.
  it('prewarms eligibility for armed targets', async () => {
    saveWatchList([{ experienceId: DB, autoBook: true }]);
    const { guests } = setupBooking({ experiences: [] });
    await enable();
    await waitFor(() => expect(guests).toHaveBeenCalled());
  });

  it('does not prewarm when nothing is armed', async () => {
    saveWatchList([{ experienceId: DB }]);
    const { guests } = setupBooking({ experiences: [] });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(guests).not.toHaveBeenCalled();
  });
});
