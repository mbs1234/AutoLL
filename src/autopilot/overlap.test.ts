import { Booking } from '@/api/itinerary';
import { DateTime, ParkTime } from '@/datetime';

import { clashWindow, overlappingPlans } from './overlap';

const DATE = '2026-12-10';
const at = (h: number, m = 0) => new ParkTime(h, m);

/** A dining reservation, which carries a start and no end. */
function dining(id: string, time: ParkTime, date = DATE): Booking {
  return {
    type: 'RES',
    subtype: 'DINING',
    id,
    facilityId: `fac-${id}`,
    name: 'Dinner',
    start: new DateTime(date, time),
  } as unknown as Booking;
}

function llAt(id: string, time: ParkTime, showEnd?: ParkTime): Booking {
  return {
    type: 'LL',
    subtype: 'MP',
    id,
    facilityId: `fac-${id}`,
    name: 'Ride',
    start: new DateTime(DATE, time),
    end: new DateTime(DATE, time.add({ hours: 1 })),
    ...(showEnd
      ? { showTimeInfo: { showStartTime: time, showEndTime: showEnd } }
      : {}),
  } as unknown as Booking;
}

describe('clashWindow()', () => {
  // Disney's own numbers, so autopilot and the manual booking screen agree
  // about what counts as a clash.
  it('runs from 40 minutes before to 60 minutes after an open-ended plan', () => {
    const { from, to } = clashWindow(
      dining('d', at(18)) as Parameters<typeof clashWindow>[0]
    );
    expect(String(from)).toBe('17:20:00');
    expect(String(to)).toBe('19:00:00');
  });

  it('closes 40 minutes after the start when the plan has an end', () => {
    const { to } = clashWindow(
      llAt('l', at(18)) as Parameters<typeof clashWindow>[0]
    );
    expect(String(to)).toBe('18:40:00');
  });

  // Leaving part-way through a show is the thing to avoid, so a show's window
  // runs to shortly before it ends rather than to a fixed offset.
  it('runs to just before a show ends', () => {
    const { to } = clashWindow(
      llAt('s', at(18), at(19, 30)) as Parameters<typeof clashWindow>[0]
    );
    expect(String(to)).toBe('19:10:00');
  });
});

describe('overlappingPlans()', () => {
  const plans = [dining('d1', at(18))];

  it('reports a return time inside the window', () => {
    expect(overlappingPlans(at(18, 30), plans, { date: DATE })).toHaveLength(1);
  });

  it('ignores one outside it', () => {
    expect(overlappingPlans(at(16), plans, { date: DATE })).toEqual([]);
    expect(overlappingPlans(at(20), plans, { date: DATE })).toEqual([]);
  });

  // Matching `Overlap.contains`, which is strict on both sides: a return time
  // exactly at the edge is the adjacent case, not the clashing one.
  it('treats the edges as adjacent rather than clashing', () => {
    expect(overlappingPlans(at(17, 20), plans, { date: DATE })).toEqual([]);
    expect(overlappingPlans(at(19), plans, { date: DATE })).toEqual([]);
  });

  it('ignores other park days', () => {
    const tomorrow = [dining('d2', at(18), '2026-12-11')];
    expect(overlappingPlans(at(18, 30), tomorrow, { date: DATE })).toEqual([]);
  });

  // Disney issues one of these when a ride you hold goes down: it is good any
  // time before park close, at any of several attractions. It parses with a
  // start time and sits in plans until used, so counting it would refuse a
  // 100-minute band of return times for the rest of the day to protect a pass
  // that constrains nothing.
  it('ignores a Multiple Experiences Pass', () => {
    const pass = {
      ...(llAt('mep', at(18)) as unknown as Record<string, unknown>),
      choices: [{ id: 'a' }, { id: 'b' }],
    } as unknown as Booking;
    expect(overlappingPlans(at(18, 30), [pass], { date: DATE })).toEqual([]);
  });

  it('ignores plans with no time of day', () => {
    const parkPass = {
      type: 'APR',
      id: 'p',
      facilityId: 'f',
      name: 'Park',
      start: { date: DATE },
    } as unknown as Booking;
    expect(overlappingPlans(at(18, 30), [parkPass], { date: DATE })).toEqual(
      []
    );
  });

  // Moving a reservation necessarily "clashes" with itself.
  it('ignores the reservation being changed', () => {
    expect(
      overlappingPlans(at(18, 30), plans, { date: DATE, ignoreIds: ['d1'] })
    ).toEqual([]);
  });
});
