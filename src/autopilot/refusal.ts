import { ParkTime } from '@/datetime';

/**
 * Which request in the booking path was refused.
 *
 * Kept apart rather than counted together, because they fail independently and
 * a success in one says nothing about another. Disney's filter hits
 * `eligibility` first -- it is the first call the booking path makes -- and a
 * build that can fetch eligibility all day while every `book` is refused is
 * exactly the state a single shared counter would report as healthy.
 */
export type ActionCall = 'eligibility' | 'offer' | 'book';

const CALLS: ActionCall[] = ['eligibility', 'offer', 'book'];

/**
 * Refusals needed before saying so, and how long they must span.
 *
 * Both, not either. A refused call is retried on the next tick with no
 * backoff, so in a burst three of them take under four seconds -- a count
 * alone would fire on any brief server hiccup, in the middle of the drop it
 * was supposed to protect. Requiring the run to span a minute means the
 * warning describes a condition rather than a moment.
 */
export const REFUSALS_TO_WARN = 3;
export const REFUSAL_SPAN_S = 60;

/**
 * A refusal is a 403 specifically.
 *
 * Not "any failure": 401 is an expired session, 410 is an offer that expired
 * or a ride that sold out from under you -- the ordinary outcome of a
 * contested drop -- 429 is backpressure that clears on its own, and 0 is the
 * eight-second client timeout, which on park wifi means nothing at all.
 * Counting those would make this fire on a good day, and a warning that fires
 * on a good day is ignored on the day it is right.
 */
export const REFUSAL_STATUS = 403;

interface Run {
  count: number;
  /** When the current unbroken run of refusals started. */
  since: ParkTime;
}

export type RefusalState = Partial<Record<ActionCall, Run>>;

export const NO_REFUSALS: RefusalState = {};

/**
 * Record the outcome of one action call.
 *
 * Anything that is not a refusal clears that call's run, including an ordinary
 * failure: the run has to be unbroken for the warning to mean "this is not
 * working" rather than "this went wrong three times today".
 */
export function observeAction(
  state: RefusalState,
  call: ActionCall,
  status: number | undefined,
  at: ParkTime
): RefusalState {
  if (status !== REFUSAL_STATUS) {
    if (!state[call]) return state;
    const next = { ...state };
    delete next[call];
    return next;
  }
  const run = state[call];
  return {
    ...state,
    [call]: { count: (run?.count ?? 0) + 1, since: run?.since ?? at },
  };
}

/**
 * Calls that have been refused long enough and often enough to report.
 *
 * `now` rather than the last refusal's time: a run that stopped being added to
 * because the poller moved on should not keep ageing into the warning.
 */
export function refusedCalls(state: RefusalState, now: ParkTime): ActionCall[] {
  return CALLS.filter(call => {
    const run = state[call];
    if (!run || run.count < REFUSALS_TO_WARN) return false;
    return +now - +run.since >= REFUSAL_SPAN_S;
  });
}

export function isRefusing(state: RefusalState, now: ParkTime): boolean {
  return refusedCalls(state, now).length > 0;
}

/** Plain-language names, for the one place this is rendered. */
export const CALL_TEXT: Record<ActionCall, string> = {
  eligibility: 'checking who is eligible',
  offer: 'asking for a return time',
  book: 'booking',
};
