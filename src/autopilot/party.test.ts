import { Guest, Guests } from '@/api/ll';

import { wholePartyEligible } from './party';

const guest = (id: string, rest: Partial<Guest> = {}) =>
  ({ id, name: id, ...rest }) as Guest;
const guests = (eligible: Guest[], ineligible: Guest[] = []) =>
  ({ eligible, ineligible }) as Guests;

describe('wholePartyEligible()', () => {
  it('is true when everyone is eligible', () => {
    expect(wholePartyEligible(guests([guest('a'), guest('b')]))).toBe(true);
  });

  // Guests outside the saved party are not part of "the whole party".
  it('ignores guests who are simply not in the party', () => {
    const g = guests(
      [guest('a')],
      [guest('x', { ineligibleReason: 'NOT_IN_PARTY' })]
    );
    expect(wholePartyEligible(g)).toBe(true);
  });

  // A party member who cannot ride is exactly the case this guards against.
  it('is false when a party member is ineligible', () => {
    const g = guests(
      [guest('a')],
      [guest('b', { ineligibleReason: 'TOO_EARLY' })]
    );
    expect(wholePartyEligible(g)).toBe(false);
  });

  it('is false when a party member is ineligible for any real reason', () => {
    for (const reason of [
      'TIER_LIMIT_REACHED',
      'EXPERIENCE_LIMIT_REACHED',
      'INVALID_PARK_ADMISSION',
      'MULTI_PASS_NEEDED',
    ] as const) {
      const g = guests(
        [guest('a')],
        [guest('b', { ineligibleReason: reason })]
      );
      expect(wholePartyEligible(g)).toBe(false);
    }
  });

  it('treats an ineligible guest with no stated reason as blocking', () => {
    expect(wholePartyEligible(guests([guest('a')], [guest('b')]))).toBe(false);
  });

  it('is false when nobody at all is eligible', () => {
    expect(wholePartyEligible(guests([]))).toBe(false);
    expect(
      wholePartyEligible(
        guests([], [guest('x', { ineligibleReason: 'NOT_IN_PARTY' })])
      )
    ).toBe(false);
  });
});
