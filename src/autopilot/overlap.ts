import { Booking, isMultipleExperiences } from '@/api/itinerary';
import { ParkTime, parkDate } from '@/datetime';

/**
 * How long before a plan starts a new return time is treated as clashing.
 *
 * These are Disney's own numbers, copied from `Overlap` in `api/ll/wdw.ts`,
 * which is what draws the "Overlapping Plans" warning on the manual booking
 * screen. Reproduced rather than reused because `Overlap` is built from an
 * offer's itinerary, and the whole point here is to decide *before* spending a
 * request on an offer.
 */
export const OVERLAP_BEFORE_MIN = 40;
/** After the start, when the plan has no end time of its own. */
export const OVERLAP_AFTER_MIN = 60;
/** After the start, when it does. */
export const OVERLAP_AFTER_WITH_END_MIN = 40;
/** Before a show ends -- leaving mid-show is the thing to avoid. */
export const OVERLAP_SHOW_TAIL_MIN = 20;

/** Plans that carry a time of day and so can be clashed with. */
type TimedBooking = Booking & { start: { date: string; time: ParkTime } };

function isTimed(booking: Booking): booking is TimedBooking {
  return !!booking.start.time;
}

/**
 * The span around a plan that a new return time should not land in.
 *
 * Exported for the tests; the interesting part is that it matches what the
 * manual path warns about, so autopilot and the booking screen agree.
 */
export function clashWindow(booking: TimedBooking): {
  from: ParkTime;
  to: ParkTime;
} {
  const start = booking.start.time;
  const showEnd =
    booking.type === 'LL' ? booking.showTimeInfo?.showEndTime : undefined;
  return {
    from: start.add({ minutes: -OVERLAP_BEFORE_MIN }),
    to: showEnd
      ? showEnd.add({ minutes: -OVERLAP_SHOW_TAIL_MIN })
      : start.add({
          minutes: booking.end?.time
            ? OVERLAP_AFTER_WITH_END_MIN
            : OVERLAP_AFTER_MIN,
        }),
  };
}

/**
 * Existing plans a candidate return time would collide with.
 *
 * Built from plans rather than from an offer's itinerary, for three reasons
 * the manual path does not have to care about:
 *
 * 1. It runs before the offer, so a doomed offerset round trip is not spent
 *    mid-drop, when requests are the scarce resource.
 * 2. It therefore works in dry run, where no offer is ever generated.
 * 3. Plans and an offer's itinerary disagree at the edges -- a booking made a
 *    minute ago may be in one and not the other -- so the two are unioned by
 *    the caller rather than trusted individually.
 *
 * `ignoreIds` excludes the reservation being modified or given up: moving a
 * booking necessarily "clashes" with itself.
 */
export function overlappingPlans(
  returnTime: ParkTime,
  plans: Booking[],
  { date, ignoreIds = [] }: { date: string; ignoreIds?: string[] }
): Booking[] {
  const ignored = new Set(ignoreIds);
  return plans.filter(booking => {
    if (ignored.has(booking.id)) return false;
    // A Multiple Experiences Pass is redeemable any time before park close, at
    // any of several attractions, so its start is the beginning of validity
    // rather than a return window to protect. It parses with a start time all
    // the same, and it sits in plans until it is used -- so treating it as
    // timed would refuse every return time in a 100-minute band for the rest
    // of the day, on the strength of a pass that constrains nothing.
    if (isMultipleExperiences(booking)) return false;
    if (!isTimed(booking)) return false;
    if (parkDate(booking.start) !== date) return false;
    const { from, to } = clashWindow(booking);
    // Strictly inside, as `Overlap.contains` has it: a return time exactly at
    // the edge is the adjacent case, not the clashing one.
    return +returnTime > +from && +returnTime < +to;
  });
}
