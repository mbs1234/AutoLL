import { LLMP } from '@/api/itinerary';
import { Guest, Guests, Offer, OfferError, OfferExperience } from '@/api/ll';
import { ParkTime } from '@/datetime';

import { WatchTarget, inWindow } from './watchlist';

/**
 * Cap on automatic bookings per session.
 *
 * A runaway booker is expensive in a way a runaway poller is not: every
 * booking consumes a real entitlement and may displace one already held. The
 * cap is deliberately low, resets only on reload, and exists so that a bug in
 * the matching logic cannot burn a whole day's Lightning Lanes.
 */
export const DEFAULT_MAX_PER_SESSION = 3;

/**
 * Consecutive plans polls that must show an attraction unheld before its
 * booking lock is released.
 *
 * One is not enough: a booking made moments before a fetch can be absent from
 * that response while Disney catches up, and acting on a single gap would
 * rebook something already held. Two is the smallest value that survives that
 * race, and costs only a poll interval of latency on a genuine cancellation.
 */
export const CONFIRM_ABSENT_POLLS = 2;

export type SkipReason =
  | 'not-enabled'
  | 'session-cap'
  | 'already-attempted'
  | 'no-eligible-guests'
  | 'offer-outside-window';

export type AutoBookOutcome =
  | { status: 'booked'; booking: LLMP; returnTime: ParkTime }
  | { status: 'skipped'; reason: SkipReason }
  | { status: 'failed'; error: string };

/** The two things autopilot can do to a reservation slot. */
export type ActionKind = 'book' | 'modify' | 'swap';

/**
 * Per-session record of what the booker has done.
 *
 * Attempts are recorded per action kind, not per attraction. Booking an
 * attraction and later moving that same booking to a better time are two
 * distinct, each-once actions -- and the book-then-move strategy depends on
 * the second not being blocked by the first. Thrash is still bounded: at most
 * one booking and one move per attraction per session.
 */
export class AutoBookLedger {
  protected attempted = new Set<string>();
  protected booked = 0;
  /**
   * Booking attempts committed but not yet confirmed either way.
   *
   * A booking request that throws leaves real doubt: it may have succeeded
   * server-side. Until a later plans poll settles it, such an attempt counts
   * against the session allowance exactly as a confirmed booking does, so the
   * cap bounds *entitlements possibly spent* rather than only those observed.
   * Keyed by experience id; only `book` attempts land here, since only they
   * can create an entitlement that nothing else accounts for.
   */
  protected unresolved = new Set<string>();
  /** Consecutive polls each attraction has been observed unheld. */
  protected absences = new Map<string, number>();

  constructor(readonly maxPerSession = DEFAULT_MAX_PER_SESSION) {}

  get bookedCount(): number {
    return this.booked;
  }

  get remaining(): number {
    return Math.max(0, this.maxPerSession - this.booked - this.unresolved.size);
  }

  hasAttempted(experienceId: string, kind: ActionKind = 'book'): boolean {
    return this.attempted.has(`${kind}:${experienceId}`);
  }

  /**
   * Experiences carrying a `book` attempt, settled or not.
   *
   * The whole set, not just the unconfirmed ones: a booking that plainly
   * succeeded still needs its lock released if the reservation is later
   * cancelled by hand, which is the ordinary case for rebooking.
   */
  get attemptedBookIds(): string[] {
    const prefix = 'book:';
    return [...this.attempted]
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }

  /**
   * Record an attempt.
   *
   * Marked before the request goes out, not after. If a booking request times
   * out, it may still have succeeded server-side, so retrying is the dangerous
   * option -- better to skip and let the user see it in their plans.
   */
  markAttempted(experienceId: string, kind: ActionKind = 'book'): void {
    this.attempted.add(`${kind}:${experienceId}`);
    if (kind === 'book') this.unresolved.add(experienceId);
  }

  /**
   * Record a confirmed booking.
   *
   * `experienceId` settles the matching unresolved attempt, and so is passed
   * only by the `book` path -- modifying and swapping never create doubt-holds
   * of their own, and passing an id from either would clear a *booking's*
   * outstanding doubt on that same attraction without accounting for it.
   */
  markBooked(experienceId?: string): void {
    if (experienceId !== undefined) this.unresolved.delete(experienceId);
    ++this.booked;
  }

  /**
   * Settle a `book` attempt against observed plans.
   *
   * Disney permits booking, cancelling, and rebooking the same attraction; the
   * only hard rule is that it can be *redeemed* once per day. A permanent
   * attempt lock is therefore stricter than the rules require, and costs a
   * genuine opportunity: cancel a late return time by hand and the earlier one
   * that drops an hour later would never be taken.
   *
   * So the lock is released by evidence rather than held for the session:
   *
   * - `stillHeld` -- the reservation exists. Keep the lock (a second booking
   *   would be rejected anyway), and if the attempt was still in doubt, charge
   *   the allowance now, since `markBooked` never ran.
   * - `!stillHeld` -- nothing is held, so the attempt either failed or has been
   *   cancelled since. Both make rebooking legal.
   *
   * Absence must be seen `CONFIRM_ABSENT_POLLS` times running before it counts.
   * A booking that succeeds moments before a plans fetch can be missing from
   * that response while Disney catches up, and treating one such gap as proof
   * would rebook something already held. Requiring two consecutive polls costs
   * a minute of latency on a real cancellation and removes that race.
   *
   * Redemption is deliberately *not* handled here: a redeemed attraction leaves
   * the party ineligible, and `attemptAutoBook` skips on eligibility long
   * before it reaches the ledger.
   */
  resolveBook(experienceId: string, stillHeld: boolean): void {
    if (stillHeld) {
      this.absences.delete(experienceId);
      if (this.unresolved.delete(experienceId)) ++this.booked;
      return;
    }
    const seen = (this.absences.get(experienceId) ?? 0) + 1;
    if (seen < CONFIRM_ABSENT_POLLS) {
      this.absences.set(experienceId, seen);
      return;
    }
    this.absences.delete(experienceId);
    this.unresolved.delete(experienceId);
    this.attempted.delete(`book:${experienceId}`);
  }

  reset(): void {
    this.attempted.clear();
    this.unresolved.clear();
    this.absences.clear();
    this.booked = 0;
  }
}

/**
 * Whether to try booking this target at all, before spending any request.
 *
 * Pure, so every guard is testable without a network or a clock.
 */
export function shouldAttempt(
  target: WatchTarget,
  ledger: Pick<AutoBookLedger, 'hasAttempted' | 'remaining'>
): { ok: true } | { ok: false; reason: SkipReason } {
  // bookThenMove and autoSwap both imply booking when a slot is free.
  if (!target.autoBook && !target.bookThenMove && !target.autoSwap) {
    return { ok: false, reason: 'not-enabled' };
  }
  if (ledger.hasAttempted(target.experienceId)) {
    return { ok: false, reason: 'already-attempted' };
  }
  if (ledger.remaining <= 0) return { ok: false, reason: 'session-cap' };
  return { ok: true };
}

/**
 * Whether a generated offer is actually acceptable.
 *
 * This is the load-bearing guard. Matching runs against the tipboard's
 * `nextAvailableTime`, but the offer that comes back can carry a different --
 * usually later -- return time, because inventory moves between the two
 * requests and because the system sometimes places a third Lightning Lane
 * between two existing ones. Booking whatever came back would hand the user a
 * time they explicitly excluded, and a Lightning Lane is not free to undo.
 */
export function offerIsAcceptable(
  offer: Pick<Offer, 'start' | 'guests'>,
  target: WatchTarget
): { ok: true } | { ok: false; reason: SkipReason } {
  if (offer.guests.eligible.length === 0) {
    return { ok: false, reason: 'no-eligible-guests' };
  }
  if (!inWindow(offer.start.time, target)) {
    return { ok: false, reason: 'offer-outside-window' };
  }
  return { ok: true };
}

export interface AutoBookDeps {
  /** Usually LLClient.offer, bound. */
  createOffer: (
    experience: OfferExperience,
    guests: Guest[]
  ) => Promise<Offer<undefined>>;
  /** Usually LLClient.book, bound. */
  book: (offer: Offer<undefined>) => Promise<LLMP>;
  /** Cached or freshly fetched eligibility for this experience. */
  guests: Guests;
  ledger: AutoBookLedger;
}

/**
 * Try to book one matched attraction.
 *
 * Sequence is deliberate: check the cheap guards first, then generate the
 * offer, then re-check the offer's real return time, and only then book. An
 * offer that falls outside the window is abandoned rather than adjusted --
 * `changeOfferTime` costs another round trip and may not find anything better,
 * and the next poll tick will try again in about a second anyway.
 */
export async function attemptAutoBook(
  target: WatchTarget,
  experience: OfferExperience,
  { createOffer, book, guests, ledger }: AutoBookDeps
): Promise<AutoBookOutcome> {
  const allowed = shouldAttempt(target, ledger);
  if (!allowed.ok) return { status: 'skipped', reason: allowed.reason };

  if (guests.eligible.length === 0) {
    return { status: 'skipped', reason: 'no-eligible-guests' };
  }

  try {
    const offer = await createOffer(experience, guests.eligible);
    const acceptable = offerIsAcceptable(offer, target);
    if (!acceptable.ok) {
      return { status: 'skipped', reason: acceptable.reason };
    }

    // Mark before booking: a timed-out request may still have succeeded, and
    // a duplicate booking is worse than a missed retry.
    ledger.markAttempted(target.experienceId);
    const booking = await book(offer);
    ledger.markBooked(target.experienceId);
    return { status: 'booked', booking, returnTime: offer.start.time };
  } catch (error) {
    // OfferError means no offer exists for this party right now, which is an
    // ordinary outcome mid-drop rather than a fault worth reporting loudly.
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
