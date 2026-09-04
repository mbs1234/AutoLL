import { Booking, LLMP, isLLMP } from '@/api/itinerary';
import { Guest, Guests, Offer, OfferError, OfferExperience } from '@/api/ll';
import { ParkTime, parkDate } from '@/datetime';

import { AutoBookLedger } from './autobook';
import { comparePriority, isTier1 } from './priority';
import { WatchTarget, inWindow } from './watchlist';

/**
 * How many Multi Pass reservations a party can hold at once.
 *
 * Swapping only makes sense when the party is full: with a slot free, a fresh
 * booking keeps both attractions, so that is always the better move.
 */
export const MAX_HELD_MP = 3;

export type SwapSkipReason =
  | 'not-enabled'
  | 'already-held'
  | 'not-full'
  | 'no-worse-reservation'
  | 'offer-outside-window'
  | 'already-attempted'
  | 'session-cap'
  | 'no-eligible-guests';

export type SwapOutcome =
  | {
      status: 'swapped';
      booking: LLMP;
      replaced: { name: string; time: ParkTime };
      to: ParkTime;
    }
  | { status: 'skipped'; reason: SwapSkipReason }
  | { status: 'failed'; error: string };

/** Every Multi Pass reservation the party holds on a given park day. */
export function heldMPToday(plans: Booking[], date: string): LLMP[] {
  return plans.filter(
    (booking): booking is LLMP =>
      isLLMP(booking) && parkDate(booking.start) === date
  );
}

type Ranked = Pick<OfferExperience, 'id' | 'priority' | 'tier' | 'avgWait'>;

/**
 * Which held reservation to give up for `incoming`, if any.
 *
 * Only a reservation ranked strictly worse than the incoming attraction is a
 * candidate -- swapping sideways or downward would spend a request to make the
 * day no better. Among candidates, prefer giving up a non-Tier-1 (Wait Magic:
 * "particularly a Tier 2 attraction, that isn't very hard to claim again
 * later"), then the worst-ranked. Unmodifiable reservations are excluded, as
 * Disney would refuse them anyway.
 */
export function chooseSwapVictim(
  held: LLMP[],
  incoming: Ranked
): LLMP | undefined {
  return held
    .filter(b => b.modifiable && comparePriority(incoming, b.experience) < 0)
    .sort(
      (a, b) =>
        Number(isTier1(a.experience)) - Number(isTier1(b.experience)) ||
        comparePriority(b.experience, a.experience)
    )[0];
}

/**
 * Whether to try swapping at all, before spending any request.
 */
export function shouldSwap(
  target: WatchTarget,
  incoming: Ranked,
  held: LLMP[],
  ledger: Pick<AutoBookLedger, 'hasAttempted' | 'remaining'>
): { ok: true; victim: LLMP } | { ok: false; reason: SwapSkipReason } {
  if (!target.autoSwap) return { ok: false, reason: 'not-enabled' };
  // Already holding it makes this a move, not a swap; that path handles it.
  if (held.some(b => b.facilityId === incoming.id)) {
    return { ok: false, reason: 'already-held' };
  }
  if (held.length < MAX_HELD_MP) return { ok: false, reason: 'not-full' };
  if (ledger.hasAttempted(target.experienceId, 'swap')) {
    return { ok: false, reason: 'already-attempted' };
  }
  if (ledger.remaining <= 0) return { ok: false, reason: 'session-cap' };
  const victim = chooseSwapVictim(held, incoming);
  if (!victim) return { ok: false, reason: 'no-worse-reservation' };
  return { ok: true, victim };
}

export interface AutoSwapDeps {
  /**
   * LLClient.offer bound with the reservation being given up. The mod endpoint
   * takes both the new experience and the original, which is what makes a swap
   * one atomic request rather than a cancel followed by a book.
   */
  createSwapOffer: (
    incoming: OfferExperience,
    guests: Guest[],
    victim: LLMP
  ) => Promise<Offer<LLMP>>;
  book: (offer: Offer<LLMP>) => Promise<LLMP>;
  guests: Guests;
  ledger: AutoBookLedger;
}

/**
 * Replace the party's worst reservation with a better attraction.
 *
 * The swap is atomic on Disney's side -- the old reservation is released only
 * if the new one is secured -- which is precisely what makes this safe where
 * "cancel it and search for something better" is not. The offer that comes back
 * is still re-checked against the incoming attraction's window before being
 * committed, for the same reason booking and moving re-check theirs.
 */
export async function attemptAutoSwap(
  target: WatchTarget,
  incoming: OfferExperience,
  held: LLMP[],
  { createSwapOffer, book, guests, ledger }: AutoSwapDeps
): Promise<SwapOutcome> {
  const allowed = shouldSwap(target, incoming, held, ledger);
  if (!allowed.ok) return { status: 'skipped', reason: allowed.reason };
  if (guests.eligible.length === 0) {
    return { status: 'skipped', reason: 'no-eligible-guests' };
  }
  const { victim } = allowed;

  try {
    const offer = await createSwapOffer(incoming, guests.eligible, victim);
    if (offer.guests.eligible.length === 0) {
      return { status: 'skipped', reason: 'no-eligible-guests' };
    }
    if (!inWindow(offer.start.time, target)) {
      return { status: 'skipped', reason: 'offer-outside-window' };
    }

    // Marked before committing: a timed-out swap may still have applied.
    ledger.markAttempted(target.experienceId, 'swap');
    const booking = await book(offer);
    ledger.markBooked();
    return {
      status: 'swapped',
      booking,
      replaced: { name: victim.name, time: victim.start.time },
      to: offer.start.time,
    };
  } catch (error) {
    if (error instanceof OfferError) {
      return { status: 'skipped', reason: 'no-eligible-guests' };
    }
    console.error(error);
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
