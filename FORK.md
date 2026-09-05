# Fork notes

Personal fork of [joelface/bg1](https://github.com/joelface/bg1) (GPL-3.0-only).
Deployed to <https://mbs1234.github.io/bg1/>.

## Why a plain `mickey` build does not work

Three separate gaps, worth understanding before touching the build:

1. **`src/api/diu` is never published.** `.gitignore` excludes it, and
   upstream's build script is `rm -f src/api/diu.ts && vite build` — it
   deletes the public shim so a private implementation resolves instead.
   A clean clone cannot resolve `import('../diu')` in `src/api/ll/dlr.ts`,
   so `vite build` fails outright.

2. **The build emits only the app bundle.** `rollupOptions.input` in
   `vite.config.mts` is exactly `src/bg1.tsx`, `src/bg1.css`,
   `src/responder.html`. No `index.html`, `start.html`, `news.html`,
   `contact.html`, `autoloader.user.js`, `icon.png` or `index.css` — so
   there is nothing to install or launch the bookmarklet from.

3. **Those static pages exist only on the `goofy` branch**, upstream's
   published Pages output. `goofy` is an orphan branch with no shared
   history with `mickey`; it is not a stale build, it is the only copy of
   the surrounding site.

## How this fork resolves them

`.github/workflows/deploy.yml` builds `mickey`, overlays the static pages
from `goofy`, rewrites upstream URLs, and deploys to Pages:

```
mickey (source) ──► npm run build:fork ──► dist/
goofy  (static) ──► overlay index/start/news/contact/autoloader/icon/css
                    (never overwriting freshly built bg1.js, bg1.css,
                     responder.html or their chunks)
                 ──► sed joelface.github.io/bg1 → mbs1234.github.io/bg1
                 ──► GitHub Pages
```

## Changes against upstream

| Change | Files | Why |
| --- | --- | --- |
| Added `diu` stub returning `{}` | `src/api/diu.ts` | Makes the tree buildable. Only DLR imports it; WDW never does, so WDW booking is unaffected. DLR booking is already broken upstream (commit `3eaf2a4`). |
| Added `build:fork` script | `package.json` | `vite build` without upstream's `rm -f src/api/diu.ts`, which would delete the stub. |
| Pages URL repointed | `App.tsx`, `LoginForm.tsx`, `screens/News.tsx` + both `.test.tsx` | `LoginForm.tsx` is the critical one — it is the OneID `responderPage`. Wrong value breaks login entirely. |
| Usage ping disabled | `src/ping.ts`, `src/ping.test.ts` | No reason for a personal build to phone home. `PING_ENABLED = false`. |
| `repository` field | `package.json` | Points at this fork. |
| Deploy workflow added | `.github/workflows/deploy.yml` | Upstream has no CI; it builds and commits to `goofy` by hand. |

## Verified

Login works from this fork's own origin (confirmed on device 2026-09-04).
Disney's OneID does **not** allowlist the `responderPage` redirect URI, so
`https://mbs1234.github.io/bg1/responder.html` authenticates normally. This was
the main risk in forking at all -- had OneID validated redirect URIs against a
registered allowlist, no amount of build fixing would have produced a working
fork.

Deliberately left pointing at upstream infrastructure:

- `src/timesync.ts` → `bg1.joelface.com/t` — reads a server `Date` header to
  correct client clock drift. Genuinely useful for hitting drop times
  precisely; replace only if you want zero third-party dependency.
- `src/api/livedata.ts` → `bg1.joelface.com/livedata/*.json` — show times
  sourced from ThemeParks.wiki, not available via Disney's tipboard.
- `github.com/joelface/bg1` source links in `start.html` / `index.html` —
  GPL-3.0 attribution, kept intentionally.

Not copied from `goofy`: `diu.js` (obfuscated private module),
`sensor-data.js` (bot-detection payload, referenced by no page),
`google*.html` (upstream's site-verification token).

## Testing

Upstream ships a **red test suite**. Verified against a clean worktree of
upstream `mickey` (f1f022a): 8 suites / 11 tests fail there, and the same 8
suites fail here. `src/api/ll.test.ts` additionally cannot load upstream at all
— it imports the unpublished `./diu` — so its ~27 stale failures were invisible
until this fork's stub made the file runnable. They are genuinely stale
fixtures, e.g. `experiences()` reads `data.availableExperiences`, which the
test's mocked response no longer provides.

| Command | Scope | Status |
| --- | --- | --- |
| `npm run test:ci` | excludes upstream's broken suites | **green** (69 suites / 593 tests) |
| `npm test` | everything | 8 suites / 38 tests fail (pre-existing) |
| `npm run lint` | | green |
| `npm run typecheck` | | green |

CI gates on `test:ci` so it stays a real signal; the full suite also runs, as
`continue-on-error`, to keep the pre-existing count visible. The exclusion list
lives in `jest.ci.config.js` — delete an entry if that suite gets repaired.
Note two of the excluded suites (`Home.test.tsx`, `Home/MultiPassList.test.tsx`)
cover screens this fork modified, so the Autopilot UI carries its own tests
(`screens/Autopilot.test.tsx`) rather than relying on the stale ones.

## Local toolchain

Node is installed via Homebrew at `/opt/homebrew` (node 26.x). `brew shellenv`
was appended to `~/.zprofile` and `~/.zshrc`. CI pins Node 22, so a
version-specific failure can differ between local and CI.

## Autopilot

Everything this fork adds beyond the build fixes lives under `src/autopilot/`,
wired in by `src/providers/AutopilotProvider.tsx` and surfaced in
`src/components/ll/screens/Autopilot.tsx`. The README is the user-facing guide;
this is the map.

| Module | Role |
| --- | --- |
| `schedule.ts` | Pure cadence policy (idle / approach / burst) from drop times and `nextBookTime`, on the drift-corrected clock; backoff. |
| `usePoller.ts` | The single sequential polling loop. |
| `wakelock.ts` | Screen Wake Lock held while autopilot runs, re-acquired when the page becomes visible. Best-effort: unsupported or refused leaves prior behaviour. |
| `watchlist.ts` | Targets and their flags; matching; edge-triggered alert selection; persistence. |
| `alert.ts` | Chime, vibration, notification, each degrading independently. |
| `prewarm.ts` | Guest-eligibility cache, invalidated on `eligibleAfter` and on any booking. |
| `priority.ts` | Priority ordering (same comparator as the LL list) and the Tier 1 hold. |
| `autobook.ts` / `automodify.ts` / `autoswap.ts` | The three actions, each guarded on the offer's *real* time; shared per-action ledger. |
| `party.ts` | Whole-party guard. |
| `overlap.ts` | Whether a return time clashes with an existing plan, using Disney's own window from `api/ll/wdw.ts`. |
| `observe.ts` / `learned.ts` | Drop-time learning: detection, coverage, clustering, and merging learned times into the cadence. |
| `storage.ts` | Persisted settings and the day-scoped activity log. |

Design rules that hold throughout, and that a future change should keep:

- **Pure core, thin shell.** Every decision is a pure function with its own
  tests; the provider only sequences them. Almost all of the ~620 tests in
  `test:ci` are on these.
- **Never commit an offer without re-checking its real time.** The tipboard
  time you matched on and the offer Disney returns can differ; booking, moving
  and swapping all re-verify before committing, and moving additionally refuses
  ever to trade down.
- **Mark attempts before the request goes out.** A timed-out request may have
  succeeded server-side; retrying is the dangerous option.
- **Only a literal `true` arms anything** when reading persisted flags. The one
  exception is `avoidOverlaps`, which defaults on and so needs a literal
  `false` -- the asymmetry follows the cost of guessing wrong.
- **Resort data is checked, not assumed.** `src/api/resortData.test.ts` scans
  each entry against the `// <Park> - <Type>` section it is declared under, and
  pins the facility ids that went stale in 2026. It lives outside
  `src/api/data/` on purpose: `loadResort` dynamic-imports `./data/${id}.ts`
  with a variable, so Rollup bundles every `.ts` in that directory.
- **On/off never persists;** per-attraction arming does. That asymmetry is
  what makes persisted arming safe.

A structural limit worth knowing before anyone tries to fix it: background
operation via a service worker is impossible, not hard. BG1 runs injected into
a page on Disney's origin; a service worker must be same-origin with the page
it controls, and this fork's worker would live on `mbs1234.github.io`.

## Syncing upstream

```bash
git fetch upstream
git merge upstream/mickey
```

Conflicts should be limited to the one-line URL changes in the table above.
The URL is left hardcoded per-file rather than extracted to a shared
constant precisely so these conflicts stay trivial.
