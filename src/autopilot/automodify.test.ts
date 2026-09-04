import { Booking, LLMP } from '@/api/itinerary';
import { Guest, Guests, Offer, OfferError } from '@/api/ll';
import { DateTime, ParkTime } from '@/datetime';

import { AutoBookLedger } from './autobook';
import {
  MIN_IMPROVEMENT_MINUTES,
  attemptAutoModify,
  findExistingLL,
  improvementMinutes,
  shouldModify,
} from './automodify';
import { WatchTarget } from './watchlist';

const BZ = '80010114';
const DB = '80010129';
const DATE = '2026-09-04';

const at = (h: number, m = 0) => new ParkTime(h, m);
const guest = (id: string) => ({ id, name: id }) as Guest;
const party = (eligible: Guest[] = [guest('a')]) =>
  ({ eligible, ineligible: [] }) as Guests;

const target = (rest: Partial<WatchTarget> = {}): WatchTarget => ({
  experienceId: BZ,
  autoModify: true,
  ...rest,
});

/** An existing Multi Pass reservation at `time`. */
function existingLL(
  time: ParkTime,
  rest: Partial<LLMP> = {},
  facilityId = BZ
): LLMP {
  return {
    type: 'LL',
    subtype: 'MP',
    id: 'ent-1',
    facilityId,
    name: 'Ride',
    start: new DateTime(DATE, time),
    end: new DateTime(DATE, time.add({ hours: 1 })),
    modifiable: true,
    guests: [],
    ...rest,
  } as unknown as LLMP;
}

const experience = { id: BZ, name: 'Ride', park: { id: 'p' } } as never;

function offerAt(time: ParkTime, guests = party()) {
  return {
    id: 'offer-1',
    offerSetId: 'set-1',
    start: new DateTime(DATE, time),
    end: new DateTime(DATE, time.add({ hours: 1 })),
    guests,
    itinerary: [],
  } as unknown as Offer<LLMP>;
}

function deps(
  overrides: Partial<Parameters<typeof attemptAutoModify>[4]> = {}
) {
  return {
    createModifyOffer: jest.fn(async () => offerAt(at(11))),
    book: jest.fn(async () => existingLL(at(11))),
    guests: party(),
    ledger: new AutoBookLedger(),
    ...overrides,
  } as Parameters<typeof attemptAutoModify>[4];
}

describe('findExistingLL()', () => {
  it('finds a Multi Pass reservation by attraction', () => {
    const plans = [existingLL(at(19))] as Booking[];
    expect(findExistingLL(plans, BZ, DATE)?.facilityId).toBe(BZ);
  });

  it('returns nothing for a different attraction', () => {
    const plans = [existingLL(at(19))] as Booking[];
    expect(findExistingLL(plans, DB, DATE)).toBeUndefined();
  });

  it('ignores non-Multi-Pass bookings', () => {
    const plans = [
      { ...existingLL(at(19)), subtype: 'SP' },
      { type: 'APR', facilityId: BZ },
    ] as unknown as Booking[];
    expect(findExistingLL(plans, BZ, DATE)).toBeUndefined();
  });

  it('handles an empty itinerary', () => {
    expect(findExistingLL([], BZ, DATE)).toBeUndefined();
  });

  // The itinerary request has a start date but no end date, so pre-booked
  // selections for later days arrive alongside today's. Without the date
  // filter, watching today could try to "improve" tomorrow's reservation.
  it('ignores a reservation on a different park day', () => {
    const tomorrow = {
      ...existingLL(at(19)),
      start: new DateTime('2026-09-05', at(19)),
    } as unknown as Booking;
    expect(findExistingLL([tomorrow], BZ, DATE)).toBeUndefined();
    expect(findExistingLL([tomorrow], BZ, '2026-09-05')).toBeDefined();
  });

  // A 1am return time belongs to the previous park day.
  it('assigns an after-midnight reservation to the previous park day', () => {
    const lateNight = {
      ...existingLL(at(1)),
      start: new DateTime('2026-09-05', at(1)),
    } as unknown as Booking;
    expect(findExistingLL([lateNight], BZ, DATE)).toBeDefined();
  });
});

describe('improvementMinutes()', () => {
  it('is positive when the candidate is earlier', () => {
    expect(improvementMinutes(at(19), at(11))).toBe(480);
  });

  it('is negative when the candidate is later', () => {
    expect(improvementMinutes(at(11), at(12))).toBe(-60);
  });

  it('is zero for the same time', () => {
    expect(improvementMinutes(at(11), at(11))).toBe(0);
  });

  // ParkTime's 4am day origin keeps an after-midnight booking ordered after
  // an evening one rather than wrapping.
  it('compares correctly across midnight', () => {
    expect(improvementMinutes(at(0, 30), at(23))).toBe(90);
  });
});

describe('shouldModify()', () => {
  const ledger = () => new AutoBookLedger();

  it('allows a large improvement', () => {
    const result = shouldModify(target(), existingLL(at(19)), at(11), ledger());
    expect(result.ok).toBe(true);
  });

  it('refuses when not enabled', () => {
    expect(
      shouldModify(
        target({ autoModify: false }),
        existingLL(at(19)),
        at(11),
        ledger()
      )
    ).toEqual({ ok: false, reason: 'not-enabled' });
  });

  it('refuses with nothing to modify', () => {
    expect(shouldModify(target(), undefined, at(11), ledger())).toEqual({
      ok: false,
      reason: 'no-existing-booking',
    });
  });

  it('refuses a reservation Disney marks unmodifiable', () => {
    const fixed = existingLL(at(19), { modifiable: false });
    expect(shouldModify(target(), fixed, at(11), ledger())).toEqual({
      ok: false,
      reason: 'not-modifiable',
    });
  });

  // Trading 7:10pm for 6:55pm is not worth a round trip on a reservation you
  // already hold.
  it('refuses an improvement below the threshold', () => {
    const result = shouldModify(
      target(),
      existingLL(at(19, 10)),
      at(18, 55),
      ledger()
    );
    expect(result).toEqual({ ok: false, reason: 'not-an-improvement' });
  });

  it('refuses a later time outright', () => {
    expect(
      shouldModify(target(), existingLL(at(11)), at(19), ledger())
    ).toEqual({ ok: false, reason: 'not-an-improvement' });
  });

  it('honors a custom threshold', () => {
    const result = shouldModify(
      target(),
      existingLL(at(19)),
      at(18, 45),
      ledger(),
      10
    );
    expect(result.ok).toBe(true);
  });

  it('refuses outside the window', () => {
    const result = shouldModify(
      target({ after: at(15) }),
      existingLL(at(19)),
      at(11),
      ledger()
    );
    expect(result).toEqual({ ok: false, reason: 'offer-outside-window' });
  });

  it('refuses a second move of the same attraction', () => {
    const l = ledger();
    l.markAttempted(BZ, 'modify');
    expect(shouldModify(target(), existingLL(at(19)), at(11), l)).toEqual({
      ok: false,
      reason: 'already-attempted',
    });
  });

  // Booking and moving are distinct each-once actions; book-then-move depends
  // on a prior booking not blocking the move.
  it('is not blocked by a prior booking of the same attraction', () => {
    const l = ledger();
    l.markAttempted(BZ, 'book');
    expect(shouldModify(target(), existingLL(at(19)), at(11), l).ok).toBe(true);
  });

  it('is enabled by bookThenMove alone', () => {
    const t = target({ autoModify: false, bookThenMove: true });
    expect(shouldModify(t, existingLL(at(19)), at(11), ledger()).ok).toBe(true);
  });

  it('refuses at the session cap', () => {
    const l = new AutoBookLedger(1);
    l.markBooked();
    expect(shouldModify(target(), existingLL(at(19)), at(11), l)).toEqual({
      ok: false,
      reason: 'session-cap',
    });
  });
});

describe('attemptAutoModify()', () => {
  it('moves a reservation to a better time', async () => {
    const d = deps();
    const result = await attemptAutoModify(
      target(),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(result).toMatchObject({
      status: 'modified',
      from: at(19),
      to: at(11),
    });
    expect(d.ledger.bookedCount).toBe(1);
  });

  it('spends no request when the guards refuse', async () => {
    const d = deps();
    await attemptAutoModify(target(), experience, undefined, at(11), d);
    expect(d.createModifyOffer).not.toHaveBeenCalled();
  });

  // The failure mode plain booking does not have: committing a modify offer
  // that came back later than what is already held would make the day worse.
  it('never trades down when the offer comes back later', async () => {
    const d = deps({ createModifyOffer: jest.fn(async () => offerAt(at(21))) });
    const result = await attemptAutoModify(
      target(),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'offer-not-an-improvement',
    });
    expect(d.book).not.toHaveBeenCalled();
  });

  it('refuses an offer that only marginally improves', async () => {
    const d = deps({
      createModifyOffer: jest.fn(async () => offerAt(at(18, 50))),
    });
    const result = await attemptAutoModify(
      target(),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'offer-not-an-improvement',
    });
  });

  it('refuses an offer outside the window', async () => {
    const d = deps({ createModifyOffer: jest.fn(async () => offerAt(at(7))) });
    const result = await attemptAutoModify(
      target({ after: at(10) }),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'offer-outside-window',
    });
    expect(d.book).not.toHaveBeenCalled();
  });

  it('leaves a refused attraction retryable', async () => {
    const d = deps({ createModifyOffer: jest.fn(async () => offerAt(at(21))) });
    await attemptAutoModify(
      target(),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(d.ledger.hasAttempted(BZ)).toBe(false);
  });

  // A timed-out modify may still have applied; re-running could move the
  // reservation twice.
  it('marks the attempt before committing', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({
      book: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    const result = await attemptAutoModify(
      target(),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(result).toEqual({ status: 'failed', error: 'boom' });
    expect(d.ledger.hasAttempted(BZ, 'modify')).toBe(true);
    // Recorded as a move, not a booking.
    expect(d.ledger.hasAttempted(BZ, 'book')).toBe(false);
  });

  it('treats OfferError as a skip', async () => {
    const d = deps({
      createModifyOffer: jest.fn(async () => {
        throw new OfferError(party([]));
      }),
    });
    const result = await attemptAutoModify(
      target(),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'no-eligible-guests',
    });
  });

  it('uses the default threshold when none is given', async () => {
    const justUnder = MIN_IMPROVEMENT_MINUTES - 1;
    const d = deps({
      createModifyOffer: jest.fn(async () =>
        offerAt(at(19).add({ minutes: -justUnder }))
      ),
    });
    const result = await attemptAutoModify(
      target(),
      experience,
      existingLL(at(19)),
      at(11),
      d
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'offer-not-an-improvement',
    });
  });
});
