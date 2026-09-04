import { Guest, Guests } from '@/api/ll';
import { ParkTime } from '@/datetime';

import {
  GUEST_TTL_MS,
  GuestCache,
  earliestEligibleAfter,
  prewarmGuests,
} from './prewarm';

const DATE = '2026-09-04';
const BZ = '80010114';
const DB = '80010129';

const guest = (id: string, rest: Partial<Guest> = {}) =>
  ({ id, name: id, primary: false, ...rest }) as Guest;

const party = (eligible: Guest[] = [guest('a')], ineligible: Guest[] = []) =>
  ({ eligible, ineligible }) as Guests;

const at = (h: number, m = 0) => new ParkTime(h, m);
const clock =
  (ms: number, time = at(9)) =>
  () => ({ ms, time });

describe('earliestEligibleAfter()', () => {
  it('is undefined with no ineligible guests', () => {
    expect(earliestEligibleAfter(party())).toBeUndefined();
  });

  it('is undefined when no ineligible guest has a time', () => {
    const p = party([guest('a')], [guest('b')]);
    expect(earliestEligibleAfter(p)).toBeUndefined();
  });

  it('picks the earliest time among ineligible guests', () => {
    const p = party(
      [guest('a')],
      [
        guest('b', { eligibleAfter: at(13) }),
        guest('c', { eligibleAfter: at(11) }),
        guest('d'),
      ]
    );
    expect(earliestEligibleAfter(p)).toEqual(at(11));
  });
});

describe('GuestCache', () => {
  it('returns nothing for an unknown key', () => {
    const cache = new GuestCache();
    expect(cache.get(BZ, DATE, clock(0)())).toBeUndefined();
  });

  it('returns a stored result', () => {
    const cache = new GuestCache();
    const p = party();
    cache.set(BZ, DATE, p, 0);
    expect(cache.get(BZ, DATE, clock(1000)())).toBe(p);
  });

  it('keys on both experience and date', () => {
    const cache = new GuestCache();
    cache.set(BZ, DATE, party(), 0);
    expect(cache.get(DB, DATE, clock(0)())).toBeUndefined();
    expect(cache.get(BZ, '2026-09-05', clock(0)())).toBeUndefined();
  });

  it('expires after the TTL', () => {
    const cache = new GuestCache();
    cache.set(BZ, DATE, party(), 0);
    expect(cache.get(BZ, DATE, clock(GUEST_TTL_MS - 1)())).toBeDefined();
    expect(cache.get(BZ, DATE, clock(GUEST_TTL_MS)())).toBeUndefined();
  });

  it('honors a custom TTL', () => {
    const cache = new GuestCache(1000);
    cache.set(BZ, DATE, party(), 0);
    expect(cache.get(BZ, DATE, clock(1000)())).toBeUndefined();
  });

  // Reusing a result past a guest's eligibleAfter would silently book for a
  // subset of the party -- worse than spending one extra request.
  it('goes stale once an ineligible guest becomes eligible', () => {
    const cache = new GuestCache();
    const p = party([guest('a')], [guest('b', { eligibleAfter: at(11) })]);
    cache.set(BZ, DATE, p, 0);
    expect(cache.get(BZ, DATE, { ms: 1000, time: at(10, 59) })).toBeDefined();
    expect(cache.get(BZ, DATE, { ms: 1000, time: at(11) })).toBeUndefined();
    expect(cache.get(BZ, DATE, { ms: 1000, time: at(11, 30) })).toBeUndefined();
  });

  it('does not go stale when no guest is time-gated', () => {
    const cache = new GuestCache();
    cache.set(BZ, DATE, party([guest('a')], [guest('b')]), 0);
    expect(cache.get(BZ, DATE, { ms: 1000, time: at(23) })).toBeDefined();
  });

  // A booking shifts eligibility everywhere at once via party, tier and
  // overlap limits, not only for the attraction that changed.
  it('clears everything', () => {
    const cache = new GuestCache();
    cache.set(BZ, DATE, party(), 0);
    cache.set(DB, DATE, party(), 0);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get(BZ, DATE, clock(0)())).toBeUndefined();
  });
});

describe('prewarmGuests()', () => {
  const deps = (fetchGuests: PrewarmFetch, cache = new GuestCache()) => ({
    fetchGuests,
    cache,
    now: clock(0),
  });
  type PrewarmFetch = (
    experience: { id: string },
    date: string
  ) => Promise<Guests>;

  it('warms each experience', async () => {
    const cache = new GuestCache();
    const fetchGuests = jest.fn(async () => party());
    const result = await prewarmGuests(
      [{ id: BZ }, { id: DB }],
      DATE,
      deps(fetchGuests, cache)
    );
    expect(result.warmed).toEqual([BZ, DB]);
    expect(cache.size).toBe(2);
  });

  it('skips experiences already warm', async () => {
    const cache = new GuestCache();
    cache.set(BZ, DATE, party(), 0);
    const fetchGuests = jest.fn(async () => party());
    const result = await prewarmGuests(
      [{ id: BZ }, { id: DB }],
      DATE,
      deps(fetchGuests, cache)
    );
    expect(fetchGuests).toHaveBeenCalledTimes(1);
    expect(result.warmed).toEqual([DB]);
  });

  // A parallel fan-out over several attractions is exactly the burst that
  // trips the shared RateLimit(5).
  it('issues requests sequentially', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchGuests = jest.fn(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await Promise.resolve();
      --inFlight;
      return party();
    });
    await prewarmGuests(
      [{ id: BZ }, { id: DB }, { id: 'x' }],
      DATE,
      deps(fetchGuests)
    );
    expect(maxInFlight).toBe(1);
  });

  it('keeps going after a failure', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const cache = new GuestCache();
    const fetchGuests = jest.fn(async (experience: { id: string }) => {
      if (experience.id === BZ) throw new Error('nope');
      return party();
    });
    const result = await prewarmGuests(
      [{ id: BZ }, { id: DB }],
      DATE,
      deps(fetchGuests, cache)
    );
    expect(result.failed).toEqual([BZ]);
    expect(result.warmed).toEqual([DB]);
  });

  it('does nothing with an empty list', async () => {
    const fetchGuests = jest.fn(async () => party());
    const result = await prewarmGuests([], DATE, deps(fetchGuests));
    expect(fetchGuests).not.toHaveBeenCalled();
    expect(result).toEqual({ warmed: [], failed: [] });
  });
});
