import { Guests } from '@/api/ll';
import { ParkTime } from '@/datetime';

/**
 * How long a cached eligibility result stays usable.
 *
 * Eligibility changes when the party books or cancels something, or when a
 * guest's `eligibleAfter` passes. Both are handled explicitly below, so this
 * is only a backstop against drift the client cannot observe.
 */
export const GUEST_TTL_MS = 3 * 60_000;

interface Entry {
  guests: Guests;
  fetchedAt: number;
  /**
   * The earliest `eligibleAfter` among ineligible guests, if any. Once that
   * time passes the entry understates who can book and must be refetched.
   */
  staleAfter?: ParkTime;
}

/**
 * Earliest moment this result could start being wrong.
 *
 * A guest held back by TOO_EARLY carries `eligibleAfter`. Reusing a cached
 * result past that point would silently drop them from the booking party,
 * which is a worse failure than an extra request: the ride gets booked for a
 * subset of the group and the rest miss out.
 */
export function earliestEligibleAfter(guests: Guests): ParkTime | undefined {
  const times = guests.ineligible
    .map(g => g.eligibleAfter)
    .filter((t): t is ParkTime => !!t);
  if (times.length === 0) return undefined;
  return times.reduce((min, t) => (+t < +min ? t : min));
}

/**
 * Caches guest eligibility so it is off the critical path when a drop lands.
 *
 * Booking a new Lightning Lane costs three sequential requests -- guests,
 * then offerset/generate, then entitlements/book -- and at a drop the good
 * return times are gone within a minute. Eligibility is the one piece that
 * does not change second to second, so fetching it in advance removes a third
 * of the round trips from the moment that matters.
 */
export class GuestCache {
  protected entries = new Map<string, Entry>();

  constructor(protected ttlMs = GUEST_TTL_MS) {}

  protected static key(experienceId: string, date: string): string {
    return `${date}|${experienceId}`;
  }

  /**
   * A usable cached result, or undefined if absent, expired, or possibly
   * understating eligibility now.
   */
  get(
    experienceId: string,
    date: string,
    now: { ms: number; time: ParkTime }
  ): Guests | undefined {
    const entry = this.entries.get(GuestCache.key(experienceId, date));
    if (!entry) return undefined;
    if (now.ms - entry.fetchedAt >= this.ttlMs) return undefined;
    if (entry.staleAfter && +now.time >= +entry.staleAfter) return undefined;
    return entry.guests;
  }

  set(
    experienceId: string,
    date: string,
    guests: Guests,
    fetchedAt: number
  ): void {
    this.entries.set(GuestCache.key(experienceId, date), {
      guests,
      fetchedAt,
      staleAfter: earliestEligibleAfter(guests),
    });
  }

  /**
   * Drop everything.
   *
   * Call after any booking or cancellation: those shift every experience's
   * eligibility at once (party limits, tier limits, overlapping windows), not
   * just the one that changed.
   */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface PrewarmDeps {
  /** Usually `LLClient.guests`, bound. */
  fetchGuests: (experience: { id: string }, date: string) => Promise<Guests>;
  cache: GuestCache;
  now: () => { ms: number; time: ParkTime };
}

/**
 * Fill the cache for the given experiences, skipping ones already warm.
 *
 * Requests run sequentially rather than in parallel. ApiClient shares a
 * RateLimit(5) with every other call including the user's taps, and a
 * parallel fan-out over a handful of watched attractions is exactly the burst
 * that trips it. Prewarming happens ahead of a drop, so it has time to spare.
 *
 * Failures are collected rather than thrown: prewarming is an optimization,
 * and one unavailable experience must not stop the others from warming.
 */
export async function prewarmGuests(
  experiences: { id: string }[],
  date: string,
  { fetchGuests, cache, now }: PrewarmDeps
): Promise<{ warmed: string[]; failed: string[] }> {
  const warmed: string[] = [];
  const failed: string[] = [];
  for (const experience of experiences) {
    if (cache.get(experience.id, date, now())) continue;
    try {
      const guests = await fetchGuests(experience, date);
      cache.set(experience.id, date, guests, now().ms);
      warmed.push(experience.id);
    } catch (error) {
      console.error(error);
      failed.push(experience.id);
    }
  }
  return { warmed, failed };
}
