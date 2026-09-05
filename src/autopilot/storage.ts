import { BookingLogEntry } from '@/contexts/AutopilotContext';
import { ParkTime } from '@/datetime';
import kvdb from '@/kvdb';

export const LOG_KEY = 'bg1.autopilot.log';
export const SETTINGS_KEY = 'bg1.autopilot.settings';
/** Newest first, capped: the log is a glance at recent activity, not history. */
export const LOG_LIMIT = 20;

interface StoredLogEntry {
  name: string;
  at: string;
  status: BookingLogEntry['status'];
  returnTime?: string;
  fromTime?: string;
  replacedName?: string;
  detail?: string;
}

/** `ParkTime.from` throws on garbage; treat an unparseable time as absent. */
function parseTime(value?: string): ParkTime | undefined {
  if (!value) return undefined;
  try {
    return ParkTime.from(value);
  } catch {
    return undefined;
  }
}

const STATUSES = new Set<BookingLogEntry['status']>([
  'booked',
  'modified',
  'swapped',
  'failed',
  'skipped',
  'dry-run',
]);

/**
 * Today's activity log.
 *
 * Scoped to the park day via kvdb's daily helpers: what got booked yesterday
 * is not useful on a new park day, and the entry times would be ambiguous.
 * ParkTime serializes to "HH:MM:SS" via toJSON but does not revive from JSON,
 * hence the explicit parse. The entry time itself is required; an entry whose
 * time will not parse is dropped rather than shown with a bogus one.
 */
export function loadBookingLog(): BookingLogEntry[] {
  const stored = kvdb.getDaily<StoredLogEntry[]>(LOG_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.flatMap(e => {
    if (typeof e?.name !== 'string' || !STATUSES.has(e.status)) return [];
    const at = parseTime(e.at);
    if (!at) return [];
    const returnTime = parseTime(e.returnTime);
    const fromTime = parseTime(e.fromTime);
    return [
      {
        name: e.name,
        at,
        status: e.status,
        ...(returnTime ? { returnTime } : {}),
        ...(fromTime ? { fromTime } : {}),
        ...(typeof e.replacedName === 'string'
          ? { replacedName: e.replacedName }
          : {}),
        ...(typeof e.detail === 'string' ? { detail: e.detail } : {}),
      },
    ];
  });
}

export function saveBookingLog(entries: BookingLogEntry[]): void {
  kvdb.setDaily<StoredLogEntry[]>(
    LOG_KEY,
    entries.slice(0, LOG_LIMIT).map(e => ({
      name: e.name,
      at: String(e.at),
      status: e.status,
      ...(e.returnTime ? { returnTime: String(e.returnTime) } : {}),
      ...(e.fromTime ? { fromTime: String(e.fromTime) } : {}),
      ...(e.replacedName ? { replacedName: e.replacedName } : {}),
      ...(e.detail ? { detail: e.detail } : {}),
    }))
  );
}

export interface AutopilotSettings {
  /**
   * Act only when every party member is eligible.
   *
   * Off by default to match how bg1 and Disney's own app behave when booking
   * by hand: they book for whoever is eligible. Turning this on trades some
   * bookings for the guarantee that the group is never split.
   */
  requireWholeParty: boolean;
  /**
   * Rehearse without acting.
   *
   * Every guard runs -- eligibility, whole-party, Tier 1 hold, windows -- and
   * the log records what *would* have been booked, moved or swapped, but no
   * offer is generated and nothing is committed. For a first park day with a
   * tool that spends real entitlements, watching it be right before letting it
   * act is worth a day of not acting. Persisted, and shown prominently while
   * on, so it cannot be quietly forgotten.
   */
  dryRun: boolean;
  /**
   * Refuse a return time that lands on top of something already planned.
   *
   * The manual booking screen shows an "Overlapping Plans" warning and lets
   * you book anyway; autopilot has nobody to warn, so it skips instead. That
   * is stricter than the warning it models, which is why it can be turned off
   * -- but a December day with a Candlelight Processional dining package is
   * exactly the case where a slot spent on top of dinner is a slot wasted, so
   * it defaults on.
   */
  avoidOverlaps: boolean;
}

export const DEFAULT_SETTINGS: AutopilotSettings = {
  requireWholeParty: false,
  dryRun: false,
  avoidOverlaps: true,
};

/** Not day-scoped: a preference about the party, not about a visit. */
export function loadSettings(): AutopilotSettings {
  const stored = kvdb.get<Partial<AutopilotSettings>>(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    // Only a literal true enables it; anything else stored reads as off.
    requireWholeParty: stored?.requireWholeParty === true,
    dryRun: stored?.dryRun === true,
    // Defaults on, so only a literal false turns it off. The asymmetry is
    // deliberate: the two above cost bookings when wrongly on, this one costs
    // a wasted slot when wrongly off.
    avoidOverlaps: stored?.avoidOverlaps !== false,
  };
}

export function saveSettings(settings: AutopilotSettings): void {
  kvdb.set<AutopilotSettings>(SETTINGS_KEY, settings);
}
