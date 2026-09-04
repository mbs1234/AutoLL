import { act, render, screen, waitFor } from '@testing-library/react';
import { use } from 'react';

import { mk, wdw } from '@/__fixtures__/resort';
import { Booking } from '@/api/itinerary';
import { Experience, FlexExperience } from '@/api/ll';
import { fireAlert, primeAudio } from '@/autopilot/alert';
import { loadBookingLog, saveSettings } from '@/autopilot/storage';
import { saveWatchList } from '@/autopilot/watchlist';
import AutopilotContext from '@/contexts/AutopilotContext';
import BookingDateContext from '@/contexts/BookingDateContext';
import ClientsContext, { Clients } from '@/contexts/ClientsContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import { DateTime, ParkTime } from '@/datetime';
import { TODAY, TOMORROW, setTime } from '@/testing';

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
// Pins the clock to the repo's canonical TODAY (see @/testing). The earlier
// version of this file hardcoded a real calendar date and passed only because
// the suite happened to run on that day.
setTime('09:00');

const BZ = '80010114';
const DB = '80010129';

function available(
  id: string,
  time: ParkTime,
  overrides: Partial<FlexExperience> = {}
): FlexExperience {
  return {
    ...wdw.experience(id),
    park: mk,
    standby: { available: true, waitTime: 30 },
    flex: { available: true, nextAvailableTime: time },
    ...overrides,
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
    <BookingDateContext
      value={{ bookingDate: TODAY, setBookingDate: () => {} }}
    >
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
    </BookingDateContext>
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

const party = { eligible: [{ id: 'g1', name: 'A' }], ineligible: [] };

function offerAt(hour: number) {
  return {
    id: 'offer-1',
    offerSetId: 'set-1',
    start: new DateTime(TODAY, new ParkTime(hour)),
    end: new DateTime(TODAY, new ParkTime(hour + 1)),
    guests: party,
    itinerary: [],
    booking: undefined,
  };
}

function setupBooking({
  offerHour = 11,
  experiences = [available(BZ, new ParkTime(11))],
  plans = [] as Booking[],
  guestsResult = party as unknown,
} = {}) {
  const guests = jest.fn(async () => guestsResult);
  // Records which attraction was offered, in order -- clearer than indexing
  // into mock.calls, and it keeps the parameter typed and used.
  const offeredIds: string[] = [];
  // Also records the options argument, which is what distinguishes the two
  // paths: a fresh booking passes { date }, a modification passes { booking }.
  const offerOptions: Record<string, unknown>[] = [];
  const offer = jest.fn(
    async (
      experience: { id: string },
      guests: unknown,
      options: Record<string, unknown>
    ) => {
      offeredIds.push(experience.id);
      offerOptions.push(options);
      void guests;
      return offerAt(offerHour);
    }
  );
  const book = jest.fn(async () => ({ id: 'ent-1' }));
  const pollPlans = jest.fn(async () => undefined);
  render(
    <BookingDateContext
      value={{ bookingDate: TODAY, setBookingDate: () => {} }}
    >
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
                plans,
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
    </BookingDateContext>
  );
  return { guests, offer, book, pollPlans, offeredIds, offerOptions };
}

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
      <BookingDateContext
        value={{ bookingDate: TODAY, setBookingDate: () => {} }}
      >
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
      </BookingDateContext>
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

  // The first booking constrains what the next can be, so when two armed
  // attractions drop in the same tick the order must not come down to
  // whatever the tipboard happened to list first.
  it('books the higher-priority attraction first', async () => {
    saveWatchList([
      { experienceId: BZ, autoBook: true },
      { experienceId: DB, autoBook: true },
    ]);
    const { offer, offeredIds } = setupBooking({
      experiences: [
        // Listed worse-first on purpose.
        available(BZ, new ParkTime(11), { priority: 3.1 }),
        available(DB, new ParkTime(11), { priority: 1.0 }),
      ],
    });
    await enable();
    await waitFor(() => expect(offer).toHaveBeenCalled());
    expect(offeredIds[0]).toBe(DB);
  });

  // Booking the lesser Tier 1 can consume the party's only Tier 1 selection.
  it('holds the Tier 1 slot for a better armed attraction', async () => {
    saveWatchList([
      { experienceId: BZ, autoBook: true },
      { experienceId: DB, autoBook: true },
    ]);
    const { offer } = setupBooking({
      experiences: [
        // Available now, but the lesser of the two.
        available(BZ, new ParkTime(11), { tier: 1, priority: 2.3 }),
        // Better, Tier 1, still has a drop ahead -- and not yet available.
        {
          ...available(DB, new ParkTime(11)),
          tier: 1,
          priority: 1.0,
          flex: { available: false },
          dropTimes: [new ParkTime(23, 59)],
        } as FlexExperience,
      ],
    });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(offer).not.toHaveBeenCalled();
  });

  // Wait Magic's FAQ: after the party's first redemption of the day the
  // single-Tier-1 limit no longer applies, so there is nothing to hold for.
  it('drops the Tier 1 hold once the party has redeemed today', async () => {
    saveWatchList([
      { experienceId: BZ, autoBook: true },
      { experienceId: DB, autoBook: true },
    ]);
    const { offer, offeredIds } = setupBooking({
      experiences: [
        available(BZ, new ParkTime(11), { tier: 1, priority: 2.3 }),
        {
          ...available(DB, new ParkTime(11)),
          tier: 1,
          priority: 1.0,
          flex: { available: false },
          dropTimes: [new ParkTime(23, 59)],
        } as FlexExperience,
        // A redeemed attraction: LLTracker marks it experienced.
        // Spread from a real fixture (unknown ids throw InvalidId), then
        // re-id so it does not collide with DB above.
        {
          ...available(DB, new ParkTime(11)),
          id: 'redeemed',
          experienced: true,
        },
      ],
    });
    await enable();
    await waitFor(() => expect(offer).toHaveBeenCalled());
    expect(offeredIds[0]).toBe(BZ);
  });

  // Self-releasing, so a held slot cannot deadlock for the rest of the day.
  it('releases the Tier 1 hold once the better drop has passed', async () => {
    saveWatchList([
      { experienceId: BZ, autoBook: true },
      { experienceId: DB, autoBook: true },
    ]);
    const { offer, offeredIds } = setupBooking({
      experiences: [
        available(BZ, new ParkTime(11), { tier: 1, priority: 2.3 }),
        {
          ...available(DB, new ParkTime(11)),
          tier: 1,
          priority: 1.0,
          flex: { available: false },
          // Already behind us, so there is no longer a reason to wait.
          dropTimes: [new ParkTime(4, 1)],
        } as FlexExperience,
      ],
    });
    await enable();
    await waitFor(() => expect(offer).toHaveBeenCalled());
    expect(offeredIds[0]).toBe(BZ);
  });
});

describe('AutopilotProvider auto-move', () => {
  /** An existing Multi Pass reservation for BZ at `hour` on `date`. */
  function heldAt(hour: number, date = TODAY): Booking {
    return {
      type: 'LL',
      subtype: 'MP',
      id: 'ent-1',
      facilityId: BZ,
      name: 'Held',
      start: new DateTime(date, new ParkTime(hour)),
      end: new DateTime(date, new ParkTime(hour + 1)),
      modifiable: true,
      guests: [],
    } as unknown as Booking;
  }

  it('moves an existing reservation to a much better time', async () => {
    saveWatchList([{ experienceId: BZ, autoModify: true }]);
    const { book, offerOptions } = setupBooking({
      offerHour: 11,
      plans: [heldAt(19)],
    });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    // Proves the modify endpoint was used, not a fresh booking: offer() gets
    // the existing reservation rather than a date.
    expect(offerOptions[0]).toHaveProperty('booking');
    expect(offerOptions[0]).not.toHaveProperty('date');
  });

  it('leaves a reservation alone when auto-move is off', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book, offer } = setupBooking({ plans: [heldAt(19)] });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(offer).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
  });

  // The failure mode plain booking does not have.
  it('never moves a reservation to a later time', async () => {
    saveWatchList([{ experienceId: BZ, autoModify: true }]);
    const { book } = setupBooking({ offerHour: 22, plans: [heldAt(19)] });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(book).not.toHaveBeenCalled();
  });

  it('ignores a gain below the threshold', async () => {
    saveWatchList([{ experienceId: BZ, autoModify: true }]);
    // Holding 11:00, offered 10:45 -- only 15 minutes better.
    const { book } = setupBooking({
      offerHour: 10,
      experiences: [available(BZ, new ParkTime(10, 45))],
      plans: [heldAt(11)],
    });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(book).not.toHaveBeenCalled();
  });

  // Holding a reservation makes a second booking pointless, so the modify
  // path takes precedence even when both toggles are on.
  it('modifies rather than books when a reservation is held', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true, autoModify: true }]);
    const { book } = setupBooking({ offerHour: 11, plans: [heldAt(19)] });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
  });

  // The itinerary returns future pre-booked selections too. Watching today
  // must not treat tomorrow's reservation as something to improve.
  it('ignores a reservation for a different day', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true, autoModify: true }]);
    const { book, offerOptions } = setupBooking({
      offerHour: 11,
      plans: [heldAt(19, TOMORROW)],
    });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    // Nothing held *today*, so this is a fresh booking, not a modification.
    expect(offerOptions[0]).toHaveProperty('date');
    expect(offerOptions[0]).not.toHaveProperty('booking');
  });

  it('books normally when nothing is held', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true, autoModify: true }]);
    const { book, offerOptions } = setupBooking({ offerHour: 11, plans: [] });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    expect(offerOptions[0]).toHaveProperty('date');
    expect(offerOptions[0]).not.toHaveProperty('booking');
  });
});

describe('AutopilotProvider book-then-move', () => {
  function heldAt(hour: number): Booking {
    return {
      type: 'LL',
      subtype: 'MP',
      id: 'ent-1',
      facilityId: BZ,
      name: 'Held',
      start: new DateTime(TODAY, new ParkTime(hour)),
      end: new DateTime(TODAY, new ParkTime(hour + 1)),
      modifiable: true,
      guests: [],
    } as unknown as Booking;
  }

  // Wait Magic's "start wide, then narrow in": with nothing held, any offered
  // time is taken so the party holds *something*. Plain auto-book with the
  // same window would refuse this offer (covered elsewhere).
  it('books outside the window when nothing is held', async () => {
    saveWatchList([
      { experienceId: BZ, bookThenMove: true, before: new ParkTime(12) },
    ]);
    const { book, offerOptions } = setupBooking({
      offerHour: 19,
      experiences: [available(BZ, new ParkTime(19))],
    });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    expect(offerOptions[0]).toHaveProperty('date');
  });

  // Once something is held, the window becomes the goal for the move.
  it('moves the held reservation into the window', async () => {
    saveWatchList([
      { experienceId: BZ, bookThenMove: true, before: new ParkTime(12) },
    ]);
    const { book, offerOptions } = setupBooking({
      offerHour: 11,
      experiences: [available(BZ, new ParkTime(11))],
      plans: [heldAt(19)],
    });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    expect(offerOptions[0]).toHaveProperty('booking');
  });

  it('does not move a held reservation to a time outside the window', async () => {
    saveWatchList([
      { experienceId: BZ, bookThenMove: true, before: new ParkTime(12) },
    ]);
    const { book, offer } = setupBooking({
      offerHour: 15,
      experiences: [available(BZ, new ParkTime(15))],
      plans: [heldAt(19)],
    });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(offer).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
  });
});

describe('AutopilotProvider pause', () => {
  it('still alerts but takes no action while paused', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true, paused: true }]);
    const { book, offer } = setupBooking({
      experiences: [available(BZ, new ParkTime(11))],
    });
    await enable();
    await waitFor(() => expect(fireAlert).toHaveBeenCalled());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(offer).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
  });

  // Pausing an attraction says "not now", so it must not make others wait for
  // it either.
  it('does not hold the Tier 1 slot for a paused attraction', async () => {
    saveWatchList([
      { experienceId: BZ, autoBook: true },
      { experienceId: DB, autoBook: true, paused: true },
    ]);
    const { offer, offeredIds } = setupBooking({
      experiences: [
        available(BZ, new ParkTime(11), { tier: 1, priority: 2.3 }),
        {
          ...available(DB, new ParkTime(11)),
          tier: 1,
          priority: 1.0,
          flex: { available: false },
          dropTimes: [new ParkTime(23, 59)],
        } as FlexExperience,
      ],
    });
    await enable();
    await waitFor(() => expect(offer).toHaveBeenCalled());
    expect(offeredIds[0]).toBe(BZ);
  });
});

describe('AutopilotProvider swap', () => {
  /** A held, ranked Multi Pass reservation on TODAY for some other ride. */
  function heldRanked(id: string, priority: number, tier?: number): Booking {
    return {
      type: 'LL',
      subtype: 'MP',
      id: `ent-${id}`,
      facilityId: id,
      name: `Ride ${id}`,
      experience: { id, name: `Ride ${id}`, priority, tier },
      start: new DateTime(TODAY, new ParkTime(15)),
      end: new DateTime(TODAY, new ParkTime(16)),
      modifiable: true,
      guests: [],
    } as unknown as Booking;
  }
  const fullOfWorse = () => [
    heldRanked('w1', 4.1),
    heldRanked('w2', 3.0),
    heldRanked('w3', 2.0),
  ];

  // Wait Magic's Attraction Swap: when every slot is taken, the worst held
  // reservation is given up for the incoming one -- in a single request, so
  // the old one is released only if the new one is secured.
  it('swaps out the worst reservation when the party is full', async () => {
    saveWatchList([{ experienceId: BZ, autoSwap: true }]);
    const { book, offerOptions } = setupBooking({
      offerHour: 11,
      experiences: [available(BZ, new ParkTime(11), { priority: 1.0 })],
      plans: fullOfWorse(),
    });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    expect(offerOptions[0]).toHaveProperty('booking');
    expect(
      (offerOptions[0]!.booking as { facilityId: string }).facilityId
    ).toBe('w1');
  });

  // With a slot free, a fresh booking keeps both attractions.
  it('books normally instead of swapping when a slot is free', async () => {
    saveWatchList([{ experienceId: BZ, autoSwap: true }]);
    const { book, offerOptions } = setupBooking({
      offerHour: 11,
      experiences: [available(BZ, new ParkTime(11), { priority: 1.0 })],
      plans: fullOfWorse().slice(0, 2),
    });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    expect(offerOptions[0]).toHaveProperty('date');
    expect(offerOptions[0]).not.toHaveProperty('booking');
  });

  it('does not swap when nothing held is worse', async () => {
    saveWatchList([{ experienceId: BZ, autoSwap: true }]);
    const { book, offer } = setupBooking({
      offerHour: 11,
      experiences: [available(BZ, new ParkTime(11), { priority: 3.5 })],
      plans: [
        heldRanked('b1', 1.0),
        heldRanked('b2', 1.5),
        heldRanked('b3', 2.0),
      ],
    });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(offer).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
  });

  it('does not swap when the flag is off, even when full', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { offerOptions, book } = setupBooking({
      offerHour: 11,
      experiences: [available(BZ, new ParkTime(11), { priority: 1.0 })],
      plans: fullOfWorse(),
    });
    await enable();
    // Plain auto-book still tries a fresh booking (Disney would reject it);
    // the point is that it never reaches for someone else's reservation.
    await waitFor(() => expect(book).toHaveBeenCalled());
    expect(offerOptions[0]).not.toHaveProperty('booking');
  });
});

describe('AutopilotProvider whole-party guard', () => {
  const partyMemberLeftOut = {
    eligible: [{ id: 'g1', name: 'A' }],
    ineligible: [{ id: 'g2', name: 'B', ineligibleReason: 'TOO_EARLY' }],
  };
  const onlyOutsiders = {
    eligible: [{ id: 'g1', name: 'A' }],
    ineligible: [{ id: 'x', name: 'X', ineligibleReason: 'NOT_IN_PARTY' }],
  };

  it('books for whoever is eligible by default', async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book } = setupBooking({ guestsResult: partyMemberLeftOut });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
  });

  // A Lightning Lane for part of the group splits the party and spends the
  // slot; when asked to, autopilot refuses rather than booking a subset.
  it('refuses to book when a party member is ineligible and the guard is on', async () => {
    saveSettings({ requireWholeParty: true });
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book, offer } = setupBooking({ guestsResult: partyMemberLeftOut });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(offer).not.toHaveBeenCalled();
    expect(book).not.toHaveBeenCalled();
  });

  // Guests outside the saved party are not "the party".
  it('still books when only outsiders are ineligible', async () => {
    saveSettings({ requireWholeParty: true });
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book } = setupBooking({ guestsResult: onlyOutsiders });
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
  });
});

describe('AutopilotProvider persistence and diagnostics', () => {
  it("keeps the day's activity log across a reload", async () => {
    saveWatchList([{ experienceId: BZ, autoBook: true }]);
    const { book } = setupBooking();
    await enable();
    await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
    // What the next mount will read back.
    await waitFor(() => expect(loadBookingLog()).toHaveLength(1));
    expect(loadBookingLog()[0]).toMatchObject({ status: 'booked' });
  });

  it('exposes why nothing was booked', async () => {
    saveWatchList([
      { experienceId: BZ, autoBook: true, before: new ParkTime(12) },
    ]);
    // Offer comes back outside the window every time.
    setupBooking({ offerHour: 20 });
    await enable();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    // The Probe does not render skipCounts; check the effect on the log
    // instead -- skips must never reach it.
    expect(loadBookingLog()).toEqual([]);
  });
});
