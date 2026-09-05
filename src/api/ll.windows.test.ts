import { ParkTime } from '@/datetime';
import { TODAY, TOMORROW } from '@/testing';

import { ExperiencesResponse, bookWindows } from './ll';

/**
 * An eligibility block carrying the given window times, keyed under `date`.
 *
 * Cast at the boundary on purpose: `time` is declared required, and two of
 * these cases exist precisely because the wire is not bound by what the
 * declaration says.
 */
function eligibility(
  date: string,
  times: (string | undefined)[]
): ExperiencesResponse['eligibility'] {
  return {
    geniePlusEligibility: {
      [date]: {
        flexEligibilityWindows: times.map(time => ({
          time: time === undefined ? undefined : { time, timeStatus: 'LATER' },
          guestIds: ['g1'],
        })),
      },
    },
    guestIds: ['g1'],
  } as unknown as ExperiencesResponse['eligibility'];
}

describe('bookWindows()', () => {
  it('is empty when the response carries no eligibility', () => {
    expect(bookWindows(undefined, TODAY)).toEqual([]);
  });

  // The date guard the old inline comment protected: reading today's windows
  // while the rest of `experiences()` answers for a future park day would
  // report a booking time that does not apply to the day being viewed.
  it('ignores eligibility keyed under a different park day', () => {
    expect(bookWindows(eligibility(TODAY, ['09:30:00']), TOMORROW)).toEqual([]);
  });

  // The item itself. Each entry is a moment Disney has said inventory opens,
  // and keeping only the earliest left the poller idling through the rest.
  it('returns every window, soonest first', () => {
    expect(
      bookWindows(
        eligibility(TODAY, ['14:10:00', '09:30:00', '11:52:00']),
        TODAY
      )
    ).toEqual([
      new ParkTime(9, 30),
      new ParkTime(11, 52),
      new ParkTime(14, 10),
    ]);
  });

  // `ParkTime` measures from a 4am day start, so an after-midnight window
  // belongs at the end of a late Magic Kingdom night. Sorting the raw
  // "HH:MM:SS" strings, as the single-window code did, put it at the head and
  // reported it as the next booking time.
  it('orders by park day rather than by clock string', () => {
    expect(
      bookWindows(eligibility(TODAY, ['00:15:00', '23:00:00']), TODAY)
    ).toEqual([new ParkTime(23), new ParkTime(0, 15)]);
  });

  // Reading every window rather than one widens the exposure to a malformed
  // entry, and `ParkTime.from` throws on anything that is not HH:MM:SS. A
  // throw here fails the whole poll, and eight consecutive failures stop
  // autopilot for the day.
  it('drops a window whose time will not parse, and keeps the rest', () => {
    expect(
      bookWindows(eligibility(TODAY, ['NOW', '11:52:00', undefined]), TODAY)
    ).toEqual([new ParkTime(11, 52)]);
  });
});
