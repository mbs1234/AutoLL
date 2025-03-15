import { TODAY, TOMORROW, YESTERDAY, setTime } from '@/testing';

import {
  DateTime,
  formatDate,
  formatTime,
  parkDate,
  toDate,
  upcomingTimes,
} from './datetime';

const date = '1998-04-22';
const time = '16:35:40';
const dateTimeString = `${date}T${time}`;

beforeEach(() => {
  setTime('08:00');
});

describe('DateTime', () => {
  const dt = DateTime.from(dateTimeString);

  it('can be used with comparison operators', () => {
    const dt2 = DateTime.from('1998-04-23T10:00:00');
    expect(dt < dt2).toBe(true);
    expect(dt >= dt2).toBe(false);
  });

  it('implements toString() and toJSON()', () => {
    expect(dt.toString()).toBe(dateTimeString);
    expect(dt.toJSON()).toBe(dateTimeString);
  });

  describe('DateTime.from()', () => {
    it('accepts string', () => {
      expect(DateTime.from(dateTimeString)).toEqual({
        date: '1998-04-22',
        time: '16:35:40',
      });
    });

    it('accepts Date object', () => {
      expect(DateTime.from(new Date('1998-04-22T16:35:40-0400'))).toEqual({
        date: '1998-04-22',
        time: '16:35:40',
      });
    });

    it('accepts timestamp', () => {
      expect(DateTime.from(893277340000)).toEqual({
        date: '1998-04-22',
        time: '16:35:40',
      });
    });
  });

  describe('DateTime.now()', () => {
    it('returns current date/time', () => {
      expect(DateTime.now()).toEqual({
        date: '2021-10-01',
        time: '08:00:00',
      });
    });
  });

  describe('DateTime.setTimeZone()', () => {
    const resetTZ = () => DateTime.setTimeZone('America/New_York');
    beforeEach(resetTZ);
    afterAll(resetTZ);

    it('sets default time zone', () => {
      DateTime.setTimeZone('America/Los_Angeles');
      expect(DateTime.from(new Date(893277340752))).toEqual({
        date: '1998-04-22',
        time: '13:35:40',
      });
    });
  });
});

describe('formatDate()', () => {
  it('formats date for display', () => {
    expect(formatDate(TODAY)).toBe('Today, October 1');
    expect(formatDate(TODAY, 'short')).toBe('October 1');
    expect(formatDate(TOMORROW)).toBe('Tomorrow, October 2');
  });
});

describe('formatTime()', () => {
  it('formats time for display', () => {
    expect(formatTime('08:14:42')).toBe('8:14 AM');
    expect(formatTime('08:14')).toBe('8:14 AM');
    expect(formatTime('8:00')).toBe('8:00 AM');
    expect(formatTime('8')).toBe('8 AM');
    expect(formatTime('8:14 PM')).toBe('8:14 PM');
  });
});

describe('parkDate()', () => {
  it(`returns today's date if after 3 AM`, () => {
    setTime('23:59:59');
    expect(parkDate()).toBe(TODAY);
    setTime('03:00:01');
    expect(parkDate()).toBe(TODAY);
  });

  it(`returns yesterday's date if it's between midnight and 3 AM`, () => {
    setTime('00:00:00');
    expect(parkDate()).toBe(YESTERDAY);
    setTime('03:00:00');
    expect(parkDate()).toBe(YESTERDAY);
  });
});

describe('toDate()', () => {
  it('converts the supplied value to a Date object', () => {
    const dateObj = new Date(dateTimeString);
    expect(toDate(dateTimeString)).toEqual(dateObj);
    expect(toDate(date)).toEqual(new Date(`${date}T00:00:00`));
    expect(toDate(+dateObj)).toEqual(dateObj);
    expect(toDate(dateObj)).toEqual(dateObj);
  });
});

describe('upcomingTimes()', () => {
  const times = ['11:30', '14:30', '17:30'];

  it('returns upcoming times', () => {
    expect(upcomingTimes(times)).toEqual(times);
    setTime('12:00');
    expect(upcomingTimes(times)).toEqual(times.slice(1));
    setTime('15:00');
    expect(upcomingTimes(times)).toEqual(times.slice(2));
    setTime('18:00');
    expect(upcomingTimes(times)).toEqual([]);
  });
});
