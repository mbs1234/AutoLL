import { Experience } from '@/api/ll';
import { ParkTime } from '@/datetime';

import {
  ArmedExperience,
  comparePriority,
  isTier1,
  orderByPriority,
  shouldHoldTierSlot,
} from './priority';
import { WatchHit } from './watchlist';

const at = (h: number, m = 0) => new ParkTime(h, m);

const exp = (id: string, rest: Partial<Experience> = {}) =>
  ({ id, name: id, ...rest }) as Experience;

const hit = (experience: Experience): WatchHit =>
  ({
    target: { experienceId: experience.id, autoBook: true },
    experience,
    returnTime: at(11),
  }) as WatchHit;

const armed = (experience: Experience): ArmedExperience => ({
  target: { experienceId: experience.id, autoBook: true },
  experience,
});

describe('isTier1()', () => {
  it('recognizes the tier marker', () => {
    expect(isTier1(exp('a', { tier: 1 }))).toBe(true);
  });

  // Absence means untiered; the data never carries any value but 1.
  it('treats a missing tier as untiered', () => {
    expect(isTier1(exp('a'))).toBe(false);
  });
});

describe('comparePriority()', () => {
  it('ranks a lower priority number first', () => {
    expect(
      comparePriority(exp('a', { priority: 1.1 }), exp('b', { priority: 2.3 }))
    ).toBeLessThan(0);
  });

  it('sorts missing priority last', () => {
    expect(
      comparePriority(exp('a'), exp('b', { priority: 4.1 }))
    ).toBeGreaterThan(0);
  });

  // Matches the LL list's Priority sort, so the booker agrees with what the
  // user sees ranked on screen.
  it('breaks ties on the longer average wait', () => {
    const a = exp('a', { priority: 2, avgWait: 60 });
    const b = exp('b', { priority: 2, avgWait: 20 });
    expect(comparePriority(a, b)).toBeLessThan(0);
  });

  it('treats two identical attractions as equal', () => {
    const a = exp('a', { priority: 2, avgWait: 30 });
    const b = exp('b', { priority: 2, avgWait: 30 });
    expect(comparePriority(a, b)).toBe(0);
  });
});

describe('orderByPriority()', () => {
  // Without this the booker takes whatever the tipboard listed first, and the
  // first booking constrains what the next can be.
  it('puts the best attraction first', () => {
    const ordered = orderByPriority([
      hit(exp('c', { priority: 3.1 })),
      hit(exp('a', { priority: 1.0 })),
      hit(exp('b', { priority: 2.3 })),
    ]);
    expect(ordered.map(h => h.experience.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts unranked attractions last', () => {
    const ordered = orderByPriority([
      hit(exp('none')),
      hit(exp('ranked', { priority: 4.1 })),
    ]);
    expect(ordered.map(h => h.experience.id)).toEqual(['ranked', 'none']);
  });

  it('does not mutate the input', () => {
    const hits = [
      hit(exp('c', { priority: 3 })),
      hit(exp('a', { priority: 1 })),
    ];
    orderByPriority(hits);
    expect(hits.map(h => h.experience.id)).toEqual(['c', 'a']);
  });

  it('handles an empty list', () => {
    expect(orderByPriority([])).toEqual([]);
  });
});

describe('shouldHoldTierSlot()', () => {
  const better = exp('better', {
    tier: 1,
    priority: 1.1,
    dropTimes: [at(13, 17), at(15, 47)],
  });
  const worse = exp('worse', { tier: 1, priority: 2.3 });

  // Booking a Tier 1 can consume the party's only Tier 1 selection, so taking
  // the lesser one first can make the better one unbookable all day.
  it('holds the slot when a better Tier 1 still has a drop ahead', () => {
    expect(shouldHoldTierSlot(hit(worse), [armed(better)], at(9))).toBe(true);
  });

  // Self-releasing: once the better attraction's drops have passed there is
  // no longer a reason to expect it, so the hold must not deadlock.
  it('releases once the better attraction has no drops left', () => {
    expect(shouldHoldTierSlot(hit(worse), [armed(better)], at(16))).toBe(false);
  });

  it('does not hold for an attraction with no drop times at all', () => {
    const noDrops = exp('nodrops', { tier: 1, priority: 1.0 });
    expect(shouldHoldTierSlot(hit(worse), [armed(noDrops)], at(9))).toBe(false);
  });

  it('never holds for a non-Tier-1 candidate', () => {
    const untiered = exp('untiered', { priority: 4.1 });
    expect(shouldHoldTierSlot(hit(untiered), [armed(better)], at(9))).toBe(
      false
    );
  });

  it('does not hold for a worse Tier 1', () => {
    expect(shouldHoldTierSlot(hit(better), [armed(worse)], at(9))).toBe(false);
  });

  it('does not hold for an equally ranked Tier 1', () => {
    const tie = exp('tie', {
      tier: 1,
      priority: 2.3,
      dropTimes: [at(15, 47)],
    });
    expect(shouldHoldTierSlot(hit(worse), [armed(tie)], at(9))).toBe(false);
  });

  it('does not hold against itself', () => {
    expect(shouldHoldTierSlot(hit(better), [armed(better)], at(9))).toBe(false);
  });

  it('ignores a better untiered attraction', () => {
    const betterUntiered = exp('bu', {
      priority: 1.0,
      dropTimes: [at(15, 47)],
    });
    expect(shouldHoldTierSlot(hit(worse), [armed(betterUntiered)], at(9))).toBe(
      false
    );
  });

  it('does not hold when nothing else is armed', () => {
    expect(shouldHoldTierSlot(hit(worse), [], at(9))).toBe(false);
  });

  // Wait Magic's FAQ: once any selection is redeemed, the party is no longer
  // limited to a single Tier 1, so there is no slot left to protect.
  it('never holds once the party has redeemed today', () => {
    expect(shouldHoldTierSlot(hit(worse), [armed(better)], at(9), true)).toBe(
      false
    );
  });

  it('still holds before any redemption', () => {
    expect(shouldHoldTierSlot(hit(worse), [armed(better)], at(9), false)).toBe(
      true
    );
  });

  it('holds if any one of several armed targets qualifies', () => {
    const irrelevant = exp('irr', { priority: 4.1 });
    expect(
      shouldHoldTierSlot(hit(worse), [armed(irrelevant), armed(better)], at(9))
    ).toBe(true);
  });
});
