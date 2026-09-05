import { wdw } from '@/__fixtures__/resort';
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
  it('holds the slot when a better Tier 1 drops within the horizon', () => {
    // 13:17 is 47 minutes out.
    expect(shouldHoldTierSlot(hit(worse), [armed(better)], at(12, 30))).toBe(
      true
    );
  });

  // The bug this horizon exists for. Tiana's drop list runs to 21:47, so
  // "any drop still ahead today" meant that at Magic Kingdom an armed Space
  // Mountain was declined from park open until the party's first tap-in --
  // a whole morning holding the Tier 1 slot for a drop eight hours away.
  it('does not hold all day for a drop list that runs to the evening', () => {
    const allDay = exp('allday', {
      tier: 1,
      priority: 1.1,
      dropTimes: [at(13, 47), at(17, 47), at(19, 47), at(21, 47)],
    });
    expect(shouldHoldTierSlot(hit(worse), [armed(allDay)], at(8))).toBe(false);
    // Still holds once one of them is genuinely close.
    expect(shouldHoldTierSlot(hit(worse), [armed(allDay)], at(13))).toBe(true);
  });

  it('does not hold for a drop just beyond the horizon', () => {
    const soon = exp('soon', {
      tier: 1,
      priority: 1.1,
      dropTimes: [at(10, 31)],
    });
    expect(shouldHoldTierSlot(hit(worse), [armed(soon)], at(9))).toBe(false);
    expect(shouldHoldTierSlot(hit(worse), [armed(soon)], at(9, 1))).toBe(true);
  });

  // Self-releasing: once the better attraction's drops have passed there is
  // no longer a reason to expect it, so the hold must not deadlock.
  it('releases once the better attraction has no drops left', () => {
    expect(shouldHoldTierSlot(hit(worse), [armed(better)], at(16))).toBe(false);
  });

  // A drop already past is not "upcoming" however close it is.
  it('does not hold for a drop that has just gone', () => {
    expect(shouldHoldTierSlot(hit(worse), [armed(better)], at(13, 18))).toBe(
      false
    );
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
    expect(
      shouldHoldTierSlot(hit(worse), [armed(better)], at(12, 30), false)
    ).toBe(true);
  });

  it('holds if any one of several armed targets qualifies', () => {
    const irrelevant = exp('irr', { priority: 4.1 });
    expect(
      shouldHoldTierSlot(
        hit(worse),
        [armed(irrelevant), armed(better)],
        at(12, 30)
      )
    ).toBe(true);
  });
});

// Over the real attraction table, not synthetic ranks.
//
// The ranking data has been reverted once already by a wholesale adoption of
// upstream's values (a474377), and nothing failed: every test above builds its
// own experiences, so the numbers that actually decide Magic Kingdom's single
// Tier 1 selection were unguarded. These assert the *behaviour* PLAN.md 3.2
// asks for rather than the digits, so a future merge is free to renumber as
// long as the outcome holds.
describe('Magic Kingdom Tier 1 ranking, as shipped', () => {
  const BIG_THUNDER = '80010110';
  const JINGLE_CRUISE = '412010035';
  // The resort fixture strips every drop time and seeds two of its own, so
  // schedules have to be supplied here. Ranks, tiers and average waits are the
  // real shipped values, which is what these tests are about.
  const of = (id: string, dropTimes?: ParkTime[]) => ({
    ...(wdw.experience(id) as Experience),
    ...(dropTimes ? { dropTimes } : {}),
  });

  it('attempts Big Thunder before Jingle Cruise in the same tick', () => {
    const ordered = orderByPriority([
      hit(of(JINGLE_CRUISE)),
      hit(of(BIG_THUNDER)),
    ]);
    expect(ordered.map(h => h.experience.id)).toEqual([
      BIG_THUNDER,
      JINGLE_CRUISE,
    ]);
  });

  // A tie is not merely a cosmetic problem: `shouldHoldTierSlot` needs a
  // strictly better rank, so while these two shared a priority the hold was
  // disabled for the only pair at Magic Kingdom it matters for.
  it('can hold the Tier 1 slot for Big Thunder over Jingle Cruise', () => {
    expect(
      shouldHoldTierSlot(
        hit(of(JINGLE_CRUISE)),
        [armed(of(BIG_THUNDER, [at(8, 47)]))],
        at(8)
      )
    ).toBe(true);
  });

  it('never holds the slot the other way round', () => {
    expect(
      shouldHoldTierSlot(
        hit(of(BIG_THUNDER)),
        [armed(of(JINGLE_CRUISE, [at(8, 47)]))],
        at(8)
      )
    ).toBe(false);
  });

  // Both are Tier 1 at Magic Kingdom, which is what makes the ordering
  // consequential -- only one of them can be held before the first tap-in.
  it('has both as Tier 1', () => {
    expect(isTier1(of(BIG_THUNDER))).toBe(true);
    expect(isTier1(of(JINGLE_CRUISE))).toBe(true);
  });
});
