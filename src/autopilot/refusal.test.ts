import { ParkTime } from '@/datetime';

import {
  NO_REFUSALS,
  REFUSALS_TO_WARN,
  REFUSAL_SPAN_S,
  RefusalState,
  isRefusing,
  observeAction,
  refusedCalls,
} from './refusal';

const at = (h: number, m = 0, s = 0) => new ParkTime(h, m, s);

/** `count` refusals of `call`, one per second from 09:00. */
function refuseRun(
  call: Parameters<typeof observeAction>[1],
  count: number,
  state: RefusalState = NO_REFUSALS
) {
  let s = state;
  for (let i = 0; i < count; ++i) {
    s = observeAction(s, call, 403, at(9, 0, i));
  }
  return s;
}

describe('observeAction()', () => {
  it('reports nothing until the run is long enough', () => {
    const s = refuseRun('eligibility', REFUSALS_TO_WARN - 1);
    expect(isRefusing(s, at(9, 5))).toBe(false);
  });

  // A refused call is retried every tick with no backoff, so three of them
  // take under four seconds in a burst. Without the span, this would fire on
  // any brief hiccup -- in the middle of the drop it exists to protect.
  it('reports nothing until the run has lasted long enough', () => {
    const s = refuseRun('eligibility', REFUSALS_TO_WARN + 5);
    expect(isRefusing(s, at(9, 0, 30))).toBe(false);
    expect(isRefusing(s, at(9, 1, 1))).toBe(true);
  });

  it('reports which call is being refused', () => {
    const s = refuseRun('book', REFUSALS_TO_WARN);
    expect(refusedCalls(s, at(9, 5))).toEqual(['book']);
  });

  // The failure that matters most: a build that fetches eligibility happily
  // while every booking is refused. One shared counter would call that
  // healthy, because the eligibility successes would keep clearing it.
  it('keeps the calls apart, so successes in one do not mask another', () => {
    let s = refuseRun('book', REFUSALS_TO_WARN);
    s = observeAction(s, 'eligibility', 200, at(9, 1));
    s = observeAction(s, 'offer', 200, at(9, 1));
    expect(refusedCalls(s, at(9, 5))).toEqual(['book']);
  });

  it('clears a run as soon as that call succeeds', () => {
    let s = refuseRun('eligibility', REFUSALS_TO_WARN + 2);
    expect(isRefusing(s, at(9, 5))).toBe(true);
    s = observeAction(s, 'eligibility', 200, at(9, 5));
    expect(isRefusing(s, at(9, 9))).toBe(false);
  });

  // Every one of these is an ordinary outcome. 410 in particular is a ride
  // selling out from under you, which during a drop is the common case.
  it.each([401, 410, 429, 0, undefined])(
    'does not count status %s as a refusal',
    status => {
      let s = NO_REFUSALS;
      for (let i = 0; i < REFUSALS_TO_WARN + 3; ++i) {
        s = observeAction(s, 'offer', status as number, at(9, 0, i));
      }
      expect(isRefusing(s, at(9, 5))).toBe(false);
    }
  );

  // An ordinary failure breaking the run is the point: "refused three times
  // today" is a different claim from "refused and still is".
  it('needs the run to be unbroken', () => {
    let s = refuseRun('offer', REFUSALS_TO_WARN);
    s = observeAction(s, 'offer', 410, at(9, 0, 30));
    s = refuseRun('offer', REFUSALS_TO_WARN - 1, s);
    expect(isRefusing(s, at(9, 9))).toBe(false);
  });

  // Written in minutes and seconds rather than as `at(9, 0, REFUSAL_SPAN_S)`,
  // because `ParkTime` clamps seconds at 59 -- that spelling silently means
  // 09:00:59 and would assert the boundary one second before it.
  it('measures the span from the first refusal of the run', () => {
    expect(REFUSAL_SPAN_S).toBe(60);
    const s = refuseRun('eligibility', REFUSALS_TO_WARN);
    expect(isRefusing(s, at(9, 0, 59))).toBe(false);
    expect(isRefusing(s, at(9, 1))).toBe(true);
  });
});
