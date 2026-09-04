import { BookingLogEntry } from '@/contexts/AutopilotContext';
import { ParkTime } from '@/datetime';
import kvdb from '@/kvdb';
import { setTime } from '@/testing';

import {
  DEFAULT_SETTINGS,
  LOG_KEY,
  LOG_LIMIT,
  SETTINGS_KEY,
  loadBookingLog,
  loadSettings,
  saveBookingLog,
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
    saveSettings({ requireWholeParty: true });
    expect(loadSettings()).toEqual({ requireWholeParty: true });
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
