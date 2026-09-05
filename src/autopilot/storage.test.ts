import {
  DEFAULT_ACTIONS_PER_DAY,
  MAX_ACTIONS_PER_DAY,
  MIN_ACTIONS_PER_DAY,
} from '@/autopilot/autobook';
import { BookingLogEntry } from '@/contexts/AutopilotContext';
import { ParkTime } from '@/datetime';
import kvdb from '@/kvdb';
import { setTime } from '@/testing';

import {
  BUDGET_KEY,
  DEFAULT_SETTINGS,
  LOG_KEY,
  LOG_LIMIT,
  SETTINGS_KEY,
  loadBookingLog,
  loadBudget,
  loadSettings,
  sanitizeBudget,
  saveBookingLog,
  saveBudget,
  saveSettings,
} from './storage';

setTime('09:00');

const at = (h: number, m = 0) => new ParkTime(h, m);

beforeEach(() => localStorage.clear());

describe('booking log persistence', () => {
  it('starts empty', () => {
    expect(loadBookingLog()).toEqual([]);
  });

  it('round-trips every entry shape', () => {
    const entries: BookingLogEntry[] = [
      { name: 'A', at: at(9, 47), status: 'booked', returnTime: at(11) },
      {
        name: 'B',
        at: at(9, 48),
        status: 'modified',
        fromTime: at(19),
        returnTime: at(11, 20),
      },
      {
        name: 'C',
        at: at(9, 49),
        status: 'swapped',
        replacedName: 'D',
        fromTime: at(15),
        returnTime: at(12),
      },
      { name: 'E', at: at(9, 50), status: 'failed', detail: 'boom' },
      {
        name: 'F',
        at: at(9, 51),
        status: 'dry-run',
        detail: 'book',
        returnTime: at(11),
      },
    ];
    saveBookingLog(entries);
    expect(loadBookingLog()).toEqual(entries);
  });

  it('caps what it stores', () => {
    const entries: BookingLogEntry[] = Array.from(
      { length: LOG_LIMIT + 5 },
      (_, i) => ({ name: `R${i}`, at: at(9, i), status: 'booked' as const })
    );
    saveBookingLog(entries);
    expect(loadBookingLog()).toHaveLength(LOG_LIMIT);
  });

  // Yesterday's bookings are not useful on a new park day.
  it('is scoped to the park day', () => {
    saveBookingLog([{ name: 'A', at: at(9), status: 'booked' }]);
    expect(loadBookingLog()).toHaveLength(1);
    // Cross into the next park day (which begins at 4am).
    setTime('05:00');
    jest.setSystemTime(new Date(Date.now() + 24 * 60 * 60_000));
    expect(loadBookingLog()).toEqual([]);
    setTime('09:00');
  });

  it('drops malformed entries and keeps the rest', () => {
    kvdb.setDaily(LOG_KEY, [
      { name: 'ok', at: '09:00:00', status: 'booked' },
      { name: 'bad-time', at: 'nope', status: 'booked' },
      { name: 'bad-status', at: '09:00:00', status: 'exploded' },
      { at: '09:00:00', status: 'booked' },
      { name: 'bad-return', at: '09:00:00', status: 'booked', returnTime: 'x' },
    ]);
    expect(loadBookingLog()).toEqual([
      { name: 'ok', at: at(9), status: 'booked' },
      { name: 'bad-return', at: at(9), status: 'booked' },
    ]);
  });

  it('returns empty for a non-array value', () => {
    kvdb.setDaily(LOG_KEY, { nope: true });
    expect(loadBookingLog()).toEqual([]);
  });
});

describe('settings persistence', () => {
  it('defaults to booking for whoever is eligible', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.requireWholeParty).toBe(false);
  });

  it('round-trips', () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      requireWholeParty: true,
      dryRun: true,
    });
    expect(loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      requireWholeParty: true,
      dryRun: true,
    });
  });

  it('defaults dry run to off', () => {
    expect(DEFAULT_SETTINGS.dryRun).toBe(false);
  });

  // The opposite default to the other two, and so the opposite parse: this one
  // costs a wasted slot when wrongly off, not a booking when wrongly on.
  it('defaults to avoiding clashes, and only a literal false turns it off', () => {
    expect(DEFAULT_SETTINGS.avoidOverlaps).toBe(true);
    kvdb.set(SETTINGS_KEY, { avoidOverlaps: 0 });
    expect(loadSettings().avoidOverlaps).toBe(true);
    kvdb.set(SETTINGS_KEY, { avoidOverlaps: false });
    expect(loadSettings().avoidOverlaps).toBe(false);
  });

  it('treats a non-boolean dry-run value as off', () => {
    kvdb.set(SETTINGS_KEY, { dryRun: 1 });
    expect(loadSettings().dryRun).toBe(false);
  });

  // Guessing wrong here means booking for a subset when the user asked never
  // to, so only a literal true counts.
  it('treats a non-boolean stored value as off', () => {
    kvdb.set(SETTINGS_KEY, { requireWholeParty: 'yes' });
    expect(loadSettings().requireWholeParty).toBe(false);
  });

  it('survives garbage', () => {
    kvdb.set(SETTINGS_KEY, 'not an object');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('the day budget', () => {
  it('clamps a stored allowance into range on read', () => {
    expect(sanitizeBudget(12)).toBe(12);
    expect(sanitizeBudget(0)).toBe(MIN_ACTIONS_PER_DAY);
    expect(sanitizeBudget(9999)).toBe(MAX_ACTIONS_PER_DAY);
    expect(sanitizeBudget(7.8)).toBe(7);
    expect(sanitizeBudget('nonsense')).toBe(DEFAULT_ACTIONS_PER_DAY);
    expect(sanitizeBudget(undefined)).toBe(DEFAULT_ACTIONS_PER_DAY);
  });

  it('round-trips the day record', () => {
    saveBudget({ spent: 3, granted: 6 });
    expect(loadBudget()).toEqual({ spent: 3, granted: 6 });
  });

  it('starts clean when nothing is stored', () => {
    expect(loadBudget()).toEqual({ spent: 0, granted: 0 });
  });

  // `granted` adds to the ceiling and lives in localStorage, so leaving it
  // unbounded would let an edited value remove the limit entirely -- the exact
  // failure the ceiling exists to prevent.
  it('clamps a hand-edited refill total', () => {
    kvdb.setDaily(BUDGET_KEY, { spent: -5, granted: 100_000 });
    expect(loadBudget()).toEqual({ spent: 0, granted: MAX_ACTIONS_PER_DAY });
  });

  // Day-scoped through kvdb, so a new park day starts clean without anything
  // having to notice the rollover.
  it('ignores a record from another park day', () => {
    kvdb.set(BUDGET_KEY, {
      date: '2020-01-01',
      value: { spent: 9, granted: 3 },
    });
    expect(loadBudget()).toEqual({ spent: 0, granted: 0 });
  });
});
