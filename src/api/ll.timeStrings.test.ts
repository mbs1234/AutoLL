import { ParkTime } from '@/datetime';

import { replaceTimeStrings } from './ll';

/**
 * The walker that turns Disney's `"HH:MM:SS"` strings into `ParkTime`s.
 *
 * Untested until now, and not for want of a test file: the only suite that
 * reached it was `ll.test.ts`, which is excluded from CI as stale upstream
 * (see `jest.ci.config.js`). So the one thing exercising a function on the
 * tipboard and offer paths was a file nothing gates on.
 */
describe('replaceTimeStrings()', () => {
  it('converts a *Time string', () => {
    expect(replaceTimeStrings({ startTime: '13:05:00' })).toEqual({
      startTime: ParkTime.from('13:05:00'),
    });
  });

  it('recurses into nested objects', () => {
    expect(
      replaceTimeStrings({ flex: { nextAvailableTime: '09:30:00' } })
    ).toEqual({ flex: { nextAvailableTime: ParkTime.from('09:30:00') } });
  });

  // The shape check is on the key as well as the value: a time-looking string
  // under some other name stays a string.
  it('leaves a string whose key is not a time alone', () => {
    expect(replaceTimeStrings({ id: '13:05:00' })).toEqual({ id: '13:05:00' });
  });

  it('leaves a *Time string that is not a time alone', () => {
    expect(replaceTimeStrings({ startTime: 'soon' })).toEqual({
      startTime: 'soon',
    });
  });

  /**
   * `typeof null === 'object'`, so null falls straight past the type guard and
   * into `Object.entries(null)`, which throws.
   *
   * Disney sends explicit nulls elsewhere in its own API -- `vq.ts` declares
   * `nextScheduledOpenTime: string | null` and the fixture encodes it as the
   * normal shape -- and the walker iterates what actually arrived rather than
   * what the interface declares, so one nullable field added to a tipboard
   * experience is enough. The consequence is out of proportion to the cause:
   * the throw escapes `experiences()`, the poller counts that as a failed
   * tick, and eight of those stop Autopilot for the day.
   */
  it('walks past a null rather than into it', () => {
    expect(replaceTimeStrings({ flex: null })).toEqual({ flex: null });
  });

  it('walks past a null nested deeper', () => {
    expect(
      replaceTimeStrings({ standby: { nextShowTime: null, waitTime: 30 } })
    ).toEqual({ standby: { nextShowTime: null, waitTime: 30 } });
  });

  // A null element inside an array, which is how a gap in a list arrives.
  it('walks past a null inside an array', () => {
    expect(replaceTimeStrings({ items: [null] })).toEqual({ items: [null] });
  });

  // The whole value, not a property of one: reachable if `availableExperiences`
  // or `itinerary.items` ever holds a null. Cast at the boundary on purpose --
  // the declaration is not what the wire is bound by.
  it('walks past a null passed in directly', () => {
    const nothing = null as unknown as Record<string, unknown>;
    expect(replaceTimeStrings(nothing)).toBe(null);
  });

  // Not a null, but the same guard: `typeof` sorts these out before the loop.
  it('returns a primitive unchanged', () => {
    const notAnObject = 'x' as unknown as Record<string, unknown>;
    expect(replaceTimeStrings(notAnObject)).toBe('x');
  });
});
