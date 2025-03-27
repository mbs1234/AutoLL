export const DAY_START_TIME = '04:00:00';

export type Dateable = Date | number | string;

export function toDate(dt: Dateable): Date {
  return new Date(
    typeof dt === 'string' && !dt.includes('T') ? dt + 'T00:00:00' : dt
  );
}

export class DateFormat {
  protected fmt;

  constructor(options: Intl.DateTimeFormatOptions) {
    this.fmt = Intl.DateTimeFormat('en-US', options);
  }

  format(date: Dateable) {
    return this.fmt.format(toDate(date));
  }

  parts(date: Dateable): {
    [P in Intl.DateTimeFormatPartTypes]?: string;
  } {
    return Object.fromEntries(
      this.fmt
        .formatToParts(toDate(date))
        .filter(p => p.type !== 'literal')
        .map(p => [p.type, p.value])
    );
  }
}

export class DateTime {
  readonly date;
  readonly time;

  protected static format: DateFormat;

  static now() {
    return DateTime.from(Date.now());
  }

  static from(date: Dateable) {
    if (
      typeof date === 'string' &&
      date.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    ) {
      const [d, t] = date.split('T');
      return new DateTime(d, t);
    }

    const dt = DateTime.format.parts(toDate(date));
    const d = `${dt.year}-${dt.month}-${dt.day}`;
    const t = `${dt.hour}:${dt.minute}:${dt.second}`;
    return new DateTime(d, t);
  }

  static setTimeZone(tz: string) {
    const d2 = '2-digit';
    DateTime.format = new DateFormat({
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: d2,
      day: d2,
      hour: d2,
      minute: d2,
      second: d2,
    });
  }

  constructor(date: string, time: string) {
    this.date = date;
    this.time = time;
  }

  toString() {
    return `${this.date}T${this.time}`;
  }

  toJSON() {
    return this.toString();
  }
}

DateTime.setTimeZone('America/New_York');

export function modifyDate(date: Dateable, days: number) {
  date = toDate(date);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(v => `${v}`.padStart(2, '0'))
    .join('-');
}

/**
 * Returns specified date if time is 4 AM or later, else previous date
 */
export function parkDate(dateTime: { date?: string; time?: string } = {}) {
  const now = DateTime.now();
  const { date = now.date, time = now.time } = dateTime;
  return time >= DAY_START_TIME ? date : modifyDate(date, -1);
}

/**
 * Converts time string to number of minutes since 7 AM
 */
export function parkMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return (h * 60 + m + 1200) % 1440;
}

export type DateFormatType = 'short';

export function formatDate(date: string, type?: DateFormatType) {
  const dt = toDate(date);
  if (isNaN(+dt)) throw new RangeError(`Invalid date string: ${date}`);
  const monthDay = dt.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  if (type === 'short') return monthDay;
  const today = parkDate();
  if (date === today) return `Today, ${monthDay}`;
  if (date === modifyDate(today, 1)) return `Tomorrow, ${monthDay}`;
  const weekday = dt.toLocaleString('en-US', { weekday: 'long' });
  return `${weekday}, ${monthDay}`;
}

export function formatTime(time: string) {
  const m = time.match(/^([01]?\d|2[0-3])(:[0-5]\d)?(?::[0-5]\d)?$/);
  if (!m) throw new RangeError(`Invalid time string: ${time}`);
  return `${+m[1] % 12 || 12}${m[2] ?? ''} ${+m[1] < 12 ? 'AM' : 'PM'}`;
}

/**
 * Returns an array of non-past times from a sorted array of time strings
 */
export function upcomingTimes(times: string[]) {
  const now = DateTime.now().time.slice(0, 5);
  const nextIdx = times.findIndex(t => t >= now);
  return nextIdx >= 0 ? times.slice(nextIdx) : [];
}
