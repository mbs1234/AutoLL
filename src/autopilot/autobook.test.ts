import { LLMP } from '@/api/itinerary';
import { Guest, Guests, Offer, OfferError } from '@/api/ll';
import { DateTime, ParkTime } from '@/datetime';

import {
  AutoBookLedger,
  CONFIRM_ABSENT_POLLS,
  DEFAULT_ACTIONS_PER_DAY,
  attemptAutoBook,
  offerIsAcceptable,
  shouldAttempt,
} from './autobook';
import { WatchTarget } from './watchlist';

const BZ = '80010114';
const DATE = '2026-09-04';

const at = (h: number, m = 0) => new ParkTime(h, m);
const guest = (id: string) => ({ id, name: id }) as Guest;
const party = (eligible: Guest[] = [guest('a')]) =>
  ({ eligible, ineligible: [] }) as Guests;

const target = (rest: Partial<WatchTarget> = {}): WatchTarget => ({
  experienceId: BZ,
  autoBook: true,
  ...rest,
});

const experience = { id: BZ, name: 'Ride', park: { id: 'p' } } as never;

function offerAt(time: ParkTime, guests = party()) {
  return {
    id: 'offer-1',
    offerSetId: 'set-1',
    start: new DateTime(DATE, time),
    end: new DateTime(DATE, time.add({ hours: 1 })),
    guests,
    experience,
    itinerary: [],
    booking: undefined,
  } as unknown as Offer<undefined>;
}

const booking = { id: 'ent-1' } as LLMP;

function deps(overrides: Partial<Parameters<typeof attemptAutoBook>[2]> = {}) {
  return {
    createOffer: jest.fn(async () => offerAt(at(11))),
    book: jest.fn(async () => booking),
    guests: party(),
    ledger: new AutoBookLedger(),
    ...overrides,
  } as Parameters<typeof attemptAutoBook>[2];
}

describe('AutoBookLedger', () => {
  it('starts with the full allowance', () => {
    expect(new AutoBookLedger().remaining).toBe(DEFAULT_ACTIONS_PER_DAY);
  });

  it('counts bookings against the allowance', () => {
    const ledger = new AutoBookLedger(2);
    ledger.markBooked();
    expect(ledger.remaining).toBe(1);
    ledger.markBooked();
    expect(ledger.remaining).toBe(0);
  });

  it('never reports a negative allowance', () => {
    const ledger = new AutoBookLedger(1);
    ledger.markBooked();
    ledger.markBooked();
    expect(ledger.remaining).toBe(0);
  });

  it('remembers attempts', () => {
    const ledger = new AutoBookLedger();
    expect(ledger.hasAttempted(BZ)).toBe(false);
    ledger.markAttempted(BZ);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  // Booking and moving the same attraction are separate each-once actions.
  it('tracks booking and moving independently', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ, 'book');
    expect(ledger.hasAttempted(BZ, 'book')).toBe(true);
    expect(ledger.hasAttempted(BZ, 'modify')).toBe(false);
    ledger.markAttempted(BZ, 'modify');
    expect(ledger.hasAttempted(BZ, 'modify')).toBe(true);
  });

  it('defaults to the booking kind', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    expect(ledger.hasAttempted(BZ, 'book')).toBe(true);
  });

  it('resets', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    ledger.markBooked();
    ledger.reset();
    expect(ledger.hasAttempted(BZ)).toBe(false);
    expect(ledger.bookedCount).toBe(0);
  });
});

/**
 * A booking request whose fate is unknown, and the release of the attempt lock
 * once plans settle it. Disney allows booking, cancelling and rebooking the
 * same attraction, so the lock covers doubt rather than the whole session.
 */
describe('AutoBookLedger doubt-holds', () => {
  /** Observe the attraction unheld often enough to clear its lock. */
  function seeAbsent(ledger: AutoBookLedger, times = CONFIRM_ABSENT_POLLS) {
    for (let i = 0; i < times; ++i) ledger.resolveBook(BZ, false);
  }

  /** Plans reporting the reservation, which is what arms a later release. */
  const seeHeld = (ledger: AutoBookLedger) => ledger.resolveBook(BZ, true);

  it('charges the allowance for an attempt that never confirmed', () => {
    const ledger = new AutoBookLedger(1);
    ledger.markAttempted(BZ);
    // The request may have landed. Until plans say otherwise it is treated as
    // spent, so nothing else can book against the same slot.
    expect(ledger.remaining).toBe(0);
    expect(ledger.bookedCount).toBe(0);
  });

  it('does not double-charge an attempt that confirmed', () => {
    const ledger = new AutoBookLedger(2);
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    expect(ledger.remaining).toBe(1);
    expect(ledger.bookedCount).toBe(1);
  });

  it('charges an unconfirmed attempt once plans show it landed', () => {
    const ledger = new AutoBookLedger(2);
    ledger.markAttempted(BZ);
    ledger.resolveBook(BZ, true);
    expect(ledger.bookedCount).toBe(1);
    expect(ledger.remaining).toBe(1);
  });

  it('leaves a confirmed booking alone when plans agree', () => {
    const ledger = new AutoBookLedger(2);
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    ledger.resolveBook(BZ, true);
    expect(ledger.bookedCount).toBe(1);
  });

  it('keeps the lock while the reservation is held', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    ledger.resolveBook(BZ, true);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  // A pass that has been redeemed -- or has simply expired unredeemed, which
  // Disney counts the same way -- leaves plans looking exactly like a
  // cancelled one. Releasing the lock there would spend the session allowance
  // rebooking something Disney will not sell again.
  it('keeps the lock when the entitlement was spent rather than cancelled', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    seeHeld(ledger);
    for (let i = 0; i < CONFIRM_ABSENT_POLLS + 2; ++i) {
      ledger.resolveBook(BZ, false, true);
    }
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  // Absences seen while the pass was still live must not carry over: the
  // release needs CONFIRM_ABSENT_POLLS *consecutive* ones.
  it('forgets earlier absences once an entitlement is spent', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    seeHeld(ledger);
    ledger.resolveBook(BZ, false);
    ledger.resolveBook(BZ, false, true);
    ledger.resolveBook(BZ, false);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  // The reason any of this exists: cancel a late return time by hand and the
  // better one that drops later must still be bookable.
  it('releases the lock after an observed booking is cancelled', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    seeHeld(ledger);
    seeAbsent(ledger);
    expect(ledger.hasAttempted(BZ)).toBe(false);
  });

  // The guard that makes the poll-count release safe. Plans polls are ~24
  // seconds apart in a drop burst, and a booking made moments before a fetch
  // can be missing from it -- so absence alone, for a reservation never seen,
  // cannot be told apart from an itinerary that has not caught up. Releasing
  // on that would rebook a Lightning Lane already held.
  it('never releases a booking it has not seen held', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS * 10);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  it('keeps an unconfirmed attempt charged against the allowance', () => {
    const ledger = new AutoBookLedger(1);
    ledger.markAttempted(BZ);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS * 10);
    expect(ledger.remaining).toBe(0);
  });

  // Disney can omit a just-made booking from a single plans response. Acting
  // on one gap would rebook something still held.
  it('requires consecutive absences before releasing', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    seeHeld(ledger);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS - 1);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  it('restarts the count when the reservation reappears', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    seeHeld(ledger);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS - 1);
    seeHeld(ledger);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS - 1);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  // A rehearsal issues no request, so it must neither hold the allowance nor
  // take part in settling -- otherwise the dry-run entry re-logs every time
  // the lock releases, and the README's "none of it counts" becomes false.
  it('keeps dry-run marks out of the allowance', () => {
    const ledger = new AutoBookLedger(1);
    ledger.markAttempted(BZ, 'book', true);
    expect(ledger.remaining).toBe(1);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  it('keeps dry-run marks out of settling', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ, 'book', true);
    expect(ledger.attemptedBookIds).toEqual([]);
    seeHeld(ledger);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS * 5);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });

  it('reports unsettled and settled book attempts alike', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    ledger.markAttempted('other', 'modify');
    expect(ledger.attemptedBookIds).toEqual([BZ]);
  });

  // Moving and swapping create no doubt-hold of their own, so neither may
  // settle a booking's.
  it('leaves booking doubt untouched when a move confirms', () => {
    const ledger = new AutoBookLedger(2);
    ledger.markAttempted(BZ);
    ledger.markAttempted(BZ, 'modify');
    ledger.markBooked();
    expect(ledger.remaining).toBe(0);
  });

  it('clears absence counts on reset', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    seeHeld(ledger);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS - 1);
    ledger.reset();
    ledger.markAttempted(BZ);
    seeHeld(ledger);
    seeAbsent(ledger, CONFIRM_ABSENT_POLLS - 1);
    expect(ledger.hasAttempted(BZ)).toBe(true);
  });
});

describe('shouldAttempt()', () => {
  it('refuses when the target has booking off', () => {
    const result = shouldAttempt(
      target({ autoBook: false }),
      new AutoBookLedger()
    );
    expect(result).toEqual({ ok: false, reason: 'not-enabled' });
  });

  it('refuses when autoBook is simply absent', () => {
    expect(shouldAttempt({ experienceId: BZ }, new AutoBookLedger())).toEqual({
      ok: false,
      reason: 'not-enabled',
    });
  });

  it('allows an enabled, unattempted target', () => {
    expect(shouldAttempt(target(), new AutoBookLedger())).toEqual({ ok: true });
  });

  it('is enabled by bookThenMove alone', () => {
    const t = target({ autoBook: false, bookThenMove: true });
    expect(shouldAttempt(t, new AutoBookLedger())).toEqual({ ok: true });
  });

  // A timed-out booking request may still have succeeded server-side, so a
  // retry risks double-booking.
  it('refuses a second attempt at the same attraction', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ);
    expect(shouldAttempt(target(), ledger)).toEqual({
      ok: false,
      reason: 'already-attempted',
    });
  });

  it('refuses once the session cap is reached', () => {
    const ledger = new AutoBookLedger(1);
    ledger.markBooked();
    expect(shouldAttempt(target(), ledger)).toEqual({
      ok: false,
      reason: 'budget-exhausted',
    });
  });
});

describe('offerIsAcceptable()', () => {
  it('accepts an offer inside the window', () => {
    const t = target({ after: at(10), before: at(12) });
    expect(offerIsAcceptable(offerAt(at(11)), t)).toEqual({ ok: true });
  });

  it('accepts any time when the target has no window', () => {
    expect(offerIsAcceptable(offerAt(at(21)), target())).toEqual({ ok: true });
  });

  // The tipboard time we matched on and the offer we actually get can differ:
  // inventory moves between requests, and a third Lightning Lane sometimes
  // gets placed between two existing ones.
  it('rejects an offer later than the window', () => {
    const t = target({ before: at(12) });
    expect(offerIsAcceptable(offerAt(at(15)), t)).toEqual({
      ok: false,
      reason: 'offer-outside-window',
    });
  });

  it('rejects an offer earlier than the window', () => {
    const t = target({ after: at(14) });
    expect(offerIsAcceptable(offerAt(at(9)), t)).toEqual({
      ok: false,
      reason: 'offer-outside-window',
    });
  });

  it('rejects an offer with nobody eligible', () => {
    expect(offerIsAcceptable(offerAt(at(11), party([])), target())).toEqual({
      ok: false,
      reason: 'no-eligible-guests',
    });
  });
});

describe('attemptAutoBook()', () => {
  it('books an acceptable offer', async () => {
    const d = deps();
    const result = await attemptAutoBook(target(), experience, d);
    expect(result).toEqual({
      status: 'booked',
      booking,
      returnTime: at(11),
    });
    expect(d.book).toHaveBeenCalled();
    expect(d.ledger.bookedCount).toBe(1);
  });

  it('spends no request when the guards refuse', async () => {
    const d = deps();
    const result = await attemptAutoBook(
      target({ autoBook: false }),
      experience,
      d
    );
    expect(result).toEqual({ status: 'skipped', reason: 'not-enabled' });
    expect(d.createOffer).not.toHaveBeenCalled();
  });

  it('skips when nobody is eligible before offering', async () => {
    const d = deps({ guests: party([]) });
    const result = await attemptAutoBook(target(), experience, d);
    expect(result).toEqual({
      status: 'skipped',
      reason: 'no-eligible-guests',
    });
    expect(d.createOffer).not.toHaveBeenCalled();
  });

  // The load-bearing guard: generate the offer, then refuse to book it if the
  // real return time falls outside what the user asked for.
  it('refuses to book an offer outside the window', async () => {
    const d = deps({ createOffer: jest.fn(async () => offerAt(at(20))) });
    const result = await attemptAutoBook(
      target({ before: at(12) }),
      experience,
      d
    );
    expect(result).toEqual({
      status: 'skipped',
      reason: 'offer-outside-window',
    });
    expect(d.book).not.toHaveBeenCalled();
    expect(d.ledger.bookedCount).toBe(0);
  });

  it('leaves an out-of-window attraction retryable', async () => {
    const d = deps({ createOffer: jest.fn(async () => offerAt(at(20))) });
    await attemptAutoBook(target({ before: at(12) }), experience, d);
    expect(d.ledger.hasAttempted(BZ)).toBe(false);
  });

  it('marks the attempt before booking, so a failure is not retried', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({
      book: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    const result = await attemptAutoBook(target(), experience, d);
    expect(result).toEqual({ status: 'failed', error: 'boom' });
    expect(d.ledger.hasAttempted(BZ)).toBe(true);
    expect(d.ledger.bookedCount).toBe(0);
  });

  // No offer for this party right now is an ordinary mid-drop outcome, not a
  // fault worth surfacing as an error.
  it('treats OfferError as a skip', async () => {
    const d = deps({
      createOffer: jest.fn(async () => {
        throw new OfferError(party([]));
      }),
    });
    const result = await attemptAutoBook(target(), experience, d);
    expect(result).toEqual({
      status: 'skipped',
      reason: 'no-eligible-guests',
    });
  });

  it('reports an unexpected failure', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({
      createOffer: jest.fn(async () => {
        throw new Error('network down');
      }),
    });
    const result = await attemptAutoBook(target(), experience, d);
    expect(result).toEqual({ status: 'failed', error: 'network down' });
  });

  it('stops at the session cap', async () => {
    const ledger = new AutoBookLedger(1);
    const d = deps({ ledger });
    await attemptAutoBook(target(), experience, d);
    const second = await attemptAutoBook(
      target({ experienceId: 'other' }),
      experience,
      d
    );
    expect(second).toEqual({ status: 'skipped', reason: 'budget-exhausted' });
  });
});

/**
 * The day's allowance. A session-scoped cap bounded nothing: the ledger lived
 * in a ref, so a plain page reload refilled it.
 */
describe('AutoBookLedger day budget', () => {
  it('counts what earlier runs today already spent', () => {
    const ledger = new AutoBookLedger(10, 4);
    expect(ledger.spent).toBe(4);
    expect(ledger.remaining).toBe(6);
  });

  // The bug this replaces: turning autopilot off and on was the refill, and it
  // came bundled with a wipe of the drop-detection baseline.
  it('carries the run forward across a reset rather than refilling', () => {
    const ledger = new AutoBookLedger(10);
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    expect(ledger.remaining).toBe(9);
    ledger.reset();
    expect(ledger.spent).toBe(1);
    expect(ledger.remaining).toBe(9);
    // The per-attraction lock is session state and does clear.
    expect(ledger.hasAttempted(BZ)).toBe(false);
  });

  it('reports every change in the charge, so the day survives a reload', () => {
    const spends: number[] = [];
    const ledger = new AutoBookLedger(10, 0, n => spends.push(n));
    ledger.markAttempted(BZ);
    ledger.markBooked(BZ);
    ledger.reset();
    expect(spends).toEqual([1, 1, 1]);
  });

  // Lowering the allowance below what has been spent leaves nothing remaining
  // rather than going negative or refunding anything.
  it('changes the ceiling without changing the spend', () => {
    const ledger = new AutoBookLedger(10, 6);
    ledger.setBudget(4);
    expect(ledger.spent).toBe(6);
    expect(ledger.remaining).toBe(0);
    ledger.setBudget(12);
    expect(ledger.remaining).toBe(6);
  });
});

describe('AutoBookLedger.releaseAttempt()', () => {
  // For the search that exists to keep improving one reservation. Autopilot
  // never releases: one move per attraction per session is what stops it
  // thrashing.
  it('lets an action be taken again', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ, 'modify');
    expect(ledger.hasAttempted(BZ, 'modify')).toBe(true);
    ledger.releaseAttempt(BZ, 'modify');
    expect(ledger.hasAttempted(BZ, 'modify')).toBe(false);
  });

  it('releases only the kind named, and only that attraction', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ, 'modify');
    ledger.markAttempted(BZ, 'book');
    ledger.releaseAttempt(BZ, 'modify');
    expect(ledger.hasAttempted(BZ, 'book')).toBe(true);
  });

  // An unbudgeted ledger still counts; it just never runs out.
  it('does not refund the spend', () => {
    const ledger = new AutoBookLedger();
    ledger.markAttempted(BZ, 'modify');
    ledger.markBooked();
    const spent = ledger.spent;
    ledger.releaseAttempt(BZ, 'modify');
    expect(ledger.spent).toBe(spent);
  });
});
