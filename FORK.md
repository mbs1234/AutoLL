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

## Syncing upstream

```bash
git fetch upstream
git merge upstream/mickey
```

Conflicts should be limited to the one-line URL changes in the table above.
The URL is left hardcoded per-file rather than extracted to a shared
constant precisely so these conflicts stay trivial.
