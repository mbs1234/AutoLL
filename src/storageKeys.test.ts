import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  KEY_SUFFIXES,
  LEGACY_NS,
  NS,
  key,
  legacyKey,
  migrateLegacyStorage,
  pingKey,
} from './storageKeys';

beforeEach(() => localStorage.clear());

describe('migrateLegacyStorage()', () => {
  it('adopts what the old namespace holds', () => {
    localStorage.setItem(legacyKey('autopilot.watchlist'), '[{"id":"a"}]');
    migrateLegacyStorage();
    expect(localStorage.getItem(key('autopilot.watchlist'))).toBe(
      '[{"id":"a"}]'
    );
  });

  // Copying rather than moving is what makes this reversible: reverting the
  // change that introduced it restores the previous behaviour exactly.
  it('leaves the original where it was', () => {
    localStorage.setItem(legacyKey('auth'), 'token');
    migrateLegacyStorage();
    expect(localStorage.getItem(legacyKey('auth'))).toBe('token');
  });

  // The half that stops a bg1 build run later from reaching back in: once
  // this build has its own value, the old one is never read again.
  it('never overwrites a value this build already has', () => {
    localStorage.setItem(key('autopilot.budget'), 'mine');
    localStorage.setItem(legacyKey('autopilot.budget'), 'theirs');
    migrateLegacyStorage();
    expect(localStorage.getItem(key('autopilot.budget'))).toBe('mine');
  });

  // Runs on every import of kvdb, so it has to be safe to repeat.
  it('is idempotent', () => {
    localStorage.setItem(legacyKey('autopilot.log'), 'first');
    migrateLegacyStorage();
    localStorage.setItem(legacyKey('autopilot.log'), 'second');
    migrateLegacyStorage();
    expect(localStorage.getItem(key('autopilot.log'))).toBe('first');
  });

  it('does nothing when there is nothing to adopt', () => {
    migrateLegacyStorage();
    expect(localStorage.length).toBe(0);
  });

  it('carries every key it knows about', () => {
    for (const suffix of KEY_SUFFIXES) {
      localStorage.setItem(legacyKey(suffix), suffix);
    }
    migrateLegacyStorage();
    for (const suffix of KEY_SUFFIXES) {
      expect(localStorage.getItem(key(suffix))).toBe(suffix);
    }
  });
});

/**
 * The check that actually protects this.
 *
 * Missing a key is the realistic failure, and it is invisible in review: the
 * build still compiles, the tests still pass, and the only symptom is one
 * setting quietly reverting to its default the first time someone runs
 * another bg1 build. `key()` accepts only a listed suffix, so a key that is
 * not on the list cannot be constructed -- but a bare string literal
 * bypasses that entirely, and this is what stops one being written.
 *
 * Matched against any quote character, and against the bare prefix rather
 * than `bg1.` -- twice widened, and twice because something real was hiding
 * in the gap. First `ping.ts` held `` `bg1.ping...` `` in a template literal
 * while this looked only for an apostrophe. Then the notification tags
 * (`bg1-autopilot-...`) turned out to be a second per-origin namespace the
 * builds shared, and being dash-shaped rather than key-shaped they slipped
 * the trailing dot too. The prefix is what names upstream's namespace;
 * whatever follows it is this build's business.
 */
describe('the namespace', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      if (!/\.tsx?$/.test(entry.name)) return [];
      if (/\.test\.tsx?$/.test(entry.name)) return [];
      if (entry.name === 'storageKeys.ts') return [];
      return [path];
    });
  }

  it('is the only one the source names', () => {
    const offenders = sources('src')
      .map(path => ({ path, text: readFileSync(path, 'utf8') }))
      .filter(({ text }) => new RegExp(`['"\`]${LEGACY_NS}`).test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('prefixes every key', () => {
    for (const suffix of KEY_SUFFIXES) {
      expect(key(suffix).startsWith(`${NS}.`)).toBe(true);
    }
  });

  it('does not collide with the namespace it replaced', () => {
    expect(NS).not.toBe(LEGACY_NS);
  });

  it('lists no suffix twice', () => {
    expect(new Set(KEY_SUFFIXES).size).toBe(KEY_SUFFIXES.length);
  });

  // The one key built rather than listed, and so the one `key()` cannot gate.
  it('prefixes the ping key too', () => {
    expect(pingKey('WDW', 'G')).toBe(`${NS}.ping.WDW.G`);
  });
});
