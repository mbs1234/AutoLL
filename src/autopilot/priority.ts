import { Experience } from '@/api/ll';
import { ParkTime } from '@/datetime';

import { WatchHit, WatchTarget } from './watchlist';

/**
 * The only tier value the data ever carries.
 *
 * `tier` is a marker, not a scale: every one of the entries that has it is
 * `tier: 1`, and absence means untiered. Walt Disney World limits how many
 * Tier 1 selections a party can hold at once, which is what makes spending
 * that slot a decision rather than a formality.
 */
export const TIER_1 = 1;

type Ranked = Pick<Experience, 'id' | 'priority' | 'tier' | 'avgWait'>;

export function isTier1(experience: Pick<Experience, 'tier'>): boolean {
  return experience.tier === TIER_1;
}

/**
 * Rank two attractions, better first.
 *
 * Intentionally the same comparator as the LL list's "Priority" sort in
 * `useSort.tsx`: lower `priority` wins, ties break on longer `avgWait`. The
 * booker should agree with the ranking the user already sees on screen -- a
 * booker that silently preferred a different order would be indefensible.
 * Priority runs from 1.0 (best) to about 4.1, and missing values sort last.
 */
export function comparePriority(a: Ranked, b: Ranked): number {
  return (
    (a.priority || Infinity) - (b.priority || Infinity) ||
    (b.avgWait || -1) - (a.avgWait || -1)
  );
}

/**
 * Matched attractions in the order they should be attempted.
 *
 * Without this the booker takes whatever the tipboard happened to list first,
 * so two attractions dropping in the same tick would be decided by array
 * order. The first booking constrains what the next can be, so the order is
 * the decision.
 */
export function orderByPriority(hits: WatchHit[]): WatchHit[] {
  return [...hits].sort((a, b) => comparePriority(a.experience, b.experience));
}

export interface ArmedExperience {
  target: WatchTarget;
  experience: Pick<
    Experience,
    'id' | 'priority' | 'tier' | 'avgWait' | 'dropTimes'
  >;
}

/**
 * Whether to pass on a Tier 1 offer to keep the slot for a better one.
 *
 * Booking a Tier 1 can consume the party's only Tier 1 selection, so taking
 * Toy Story Mania the moment it appears may make Slinky Dog unbookable for
 * the rest of the day. Holding is worthwhile only when the better attraction
 * plausibly still will appear, which is approximated by it having a drop time
 * still ahead of it today.
 *
 * That condition is what keeps this from deadlocking: once the better
 * attraction's drops are behind us, the hold releases on its own and the next
 * best Tier 1 becomes bookable. An attraction with no drop times at all never
 * causes a hold, since there would be no reason to expect it.
 */
export function shouldHoldTierSlot(
  candidate: WatchHit,
  armed: ArmedExperience[],
  now: ParkTime,
  redeemedToday = false
): boolean {
  // The one-Tier-1-at-a-time rule applies only until the party's first
  // redemption of the day. After that, multiple Tier 1 selections can be held
  // at once, so there is no slot left to protect and holding would only block
  // bookings. The caller derives this from the tipboard's `experienced` flag,
  // which LLTracker sets for redeemed attractions.
  if (redeemedToday) return false;
  if (!isTier1(candidate.experience)) return false;
  const candidateRank = candidate.experience.priority || Infinity;
  return armed.some(
    ({ experience }) =>
      experience.id !== candidate.experience.id &&
      isTier1(experience) &&
      (experience.priority || Infinity) < candidateRank &&
      hasUpcomingDrop(experience.dropTimes, now)
  );
}

/**
 * Whether any of these drop times is still ahead.
 *
 * Not `upcomingTimes()`: that reads `DateTime.now()` internally, which is the
 * raw device clock and is not injectable. Autopilot works from the
 * drift-corrected clock throughout, and this needs to be testable without
 * one.
 */
function hasUpcomingDrop(
  dropTimes: ParkTime[] | undefined,
  now: ParkTime
): boolean {
  return (dropTimes ?? []).some(time => +time >= +now);
}
