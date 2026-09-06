/**
 * Every key this build keeps in local storage, under one namespace.
 *
 * The bookmarklet runs injected into `disneyworld.disney.go.com`, so the
 * storage it uses belongs to *Disney's* origin rather than to the page it was
 * served from. Every bg1-derived build installed on the same phone therefore
 * shares one namespace, and two of them running against the same account will
 * overwrite each other's watch lists, budgets, booking tracking and learned
 * drop times -- silently, since neither has any way to notice.
 *
 * Hence a namespace of this build's own. `KeySuffix` is the mechanism that
 * keeps it honest: `key()` accepts nothing else, so a key that is not on this
 * list will not compile, and the migration below cannot silently miss one.
 */
export const NS = 'autoll';

/** The namespace this build shared with every other bg1 build until v0.2. */
export const LEGACY_NS = 'bg1';

export const KEY_SUFFIXES = [
  'auth',
  'autopilot.budget',
  'autopilot.coverage',
  'autopilot.dropEvents',
  'autopilot.log',
  'autopilot.settings',
  'autopilot.watchlist',
  'date',
  'disclaimer.accepted',
  'genie.partyIds',
  'genie.sort',
  'genie.tipBoard.starred',
  'll.bookings',
  'll.fullAvailability',
  'news.version',
  'nextll.pending',
  'nextll.watchlist',
  'park',
  'tab',
] as const;

export type KeySuffix = (typeof KEY_SUFFIXES)[number];

export function key(suffix: KeySuffix): string {
  return `${NS}.${suffix}`;
}

export function legacyKey(suffix: KeySuffix): string {
  return `${LEGACY_NS}.${suffix}`;
}

/**
 * Adopt anything this build wrote under the old shared namespace.
 *
 * Copies rather than moves, and only where nothing is already stored under
 * the new key. Both halves matter:
 *
 * - Copying leaves the originals untouched, so reverting the change that
 *   introduced this restores the previous behaviour exactly, and a mistake
 *   here costs nothing that cannot be read back.
 * - Skipping keys that already exist makes it idempotent and safe to run on
 *   every load. It also means a bg1 build run afterwards cannot reach back in
 *   and overwrite this build's state: from the first run onwards the two write
 *   to different keys and simply stop seeing each other.
 *
 * Runs on import of `kvdb` rather than from the entry point, because
 * `authStore` is constructed when its module is imported and `App` reads auth
 * while initialising state -- an ordering that happens to work today and would
 * break silently the first time someone adds another read at import time.
 */
export function migrateLegacyStorage(): void {
  try {
    for (const suffix of KEY_SUFFIXES) {
      const to = key(suffix);
      if (localStorage.getItem(to) !== null) continue;
      const value = localStorage.getItem(legacyKey(suffix));
      if (value !== null) localStorage.setItem(to, value);
    }
  } catch {
    // Storage can be unavailable entirely -- a private window, or a browser
    // set to block site data. Nothing here is worth failing a load over; the
    // app already treats an empty store as a first run.
  }
}

/**
 * Keys that more than one module names.
 *
 * Declared here rather than beside their component, because a component file
 * exporting a computed constant defeats fast refresh -- and a storage key is
 * not a fact about a screen anyway.
 */
export const HOME_TAB_KEY = key('tab');
export const STARRED_KEY = key('genie.tipBoard.starred');
export const FULL_AVAILABILITY_KEY = key('ll.fullAvailability');

/**
 * NextLL's own watch list.
 *
 * Separate from Autopilot's so a quick search cannot disturb a list built up
 * over a morning, nor be cleared by one.
 */
export const NEXTLL_WATCHLIST_KEY = key('nextll.watchlist');
