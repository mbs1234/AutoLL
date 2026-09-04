# BG1 — personal fork

A personal fork of **[joelface/bg1](https://github.com/joelface/bg1)** by Joel Face, the original author of everything this is built on. All of the Lightning Lane, virtual queue, DAS and itinerary work is his; this fork adds an availability watcher on top and fixes a few things needed to build and run it independently. Licensed **GPL-3.0-only**, same as upstream.

Deployed at **<https://mbs1234.github.io/bg1/>**.

**WARNING! Use at your own risk. BG1 is highly experimental, for demonstration purposes only, and provided "as is" without warranty of any kind. It is in no way endorsed by or associated with the Walt Disney Company and could stop working at any time for any reason. To ensure the intended experience, always use the official Disney app.**

BG1 is an unofficial, experimental client for obtaining Lightning Lane Multi Pass reservations and virtual queue boarding groups at Disney theme parks in the United States. For background on the original, read the [upstream BG1 documentation](https://joelface.github.io/bg1/).

---

## Enhancements in this fork

### Autopilot — drop-aware watching with alerts

Upstream refreshes only when you tap the refresh button. Autopilot watches for you and tells you when something you want becomes bookable.

**How to use it**

1. Open <https://mbs1234.github.io/bg1/> on your phone and follow the setup instructions to install the bookmarklet (or the userscript).
2. Go to `disneyworld.disney.go.com/vas/` and run it, then sign in with your Disney account.
3. On the **LL** tab, tap the **clock button** in the header to open the Autopilot screen.
4. Tap the star next to each attraction you want watched. Your list is saved between sessions.
5. Tap **Turn on autopilot**, and allow notifications when prompted.
6. Leave the page open and in the foreground. When a watched attraction becomes available you get a chime, a vibration (Android), and a notification naming the ride and its return time.

The header button turns green while watching and shows how many attractions are on your list; it turns red if the watcher stopped because of repeated errors.

**How the pacing works.** Rather than polling at a fixed rate, Autopilot adjusts to what is coming up:

| Mode | When | Interval |
| --- | --- | --- |
| Watching | nothing imminent | ~45s |
| Drop approaching | within 5 min of a drop or your next booking window | ~6s |
| Checking rapidly | 30s before to 120s after a drop | ~1.2s |

Targets come from the per-attraction drop times in `src/api/data/wdw.ts` and from `nextBookTime`, which Disney's tipboard reports. The lead exists because inventory sometimes releases a few seconds early; the longer trail exists because dropped inventory trickles in and good return times are gone within a minute. Every interval gets ±20% jitter so the request pattern has no fixed period.

Autopilot also uses the **drift-corrected clock** that upstream computes in `src/timesync.ts` but only ever uses to render the on-screen clock — all of upstream's internal logic runs on the raw device clock. For hitting a drop on the correct second, that difference matters.

**Limits worth knowing**

- **Multi Pass only.** Matching reads the `flex` field, and BG1 has no Single Pass booking flow. Most famous headliners — TRON, Rise of the Resistance, Seven Dwarfs Mine Train, Guardians, Flight of Passage — are Single Pass and cannot be watched here. Slinky Dog Dash is Multi Pass.
- **Must stay foregrounded.** Mobile browsers heavily throttle timers in background tabs.
- **Off after a reload,** by design: a watcher resuming with no user gesture behind it cannot unlock audio, and silently issuing requests on page load is a surprising default. Your watch list persists; the on/off state does not.
- **On iOS,** notifications require adding the page to your Home Screen. Without that you still get the chime.
- Alerts are edge-triggered per attraction: one alert when it becomes available, then silence until it goes away and comes back.

### Fixes and corrections

- **`RateLimit` no longer latches permanently.** Upstream set an "exceeded" flag on the first violation and never cleared it, so one burst of 6 requests in a second rejected *every* later API call — refreshes and bookings alike — until a page reload. Now a short cooldown applies and the limiter recovers. This was the prerequisite for any automated polling.
- **The tree actually builds.** Upstream's `src/api/diu` module is gitignored and never published, and its build script deletes the public shim, so a clean clone cannot resolve the import and `vite build` fails. A stub restores it. Only Disneyland calls it, so Walt Disney World is unaffected.
- **Two missing drop times added,** cross-checked against TouringPlans, WDWMagic observer logs, and BlogMickey: Tiana's Bayou Adventure 14:17, Expedition Everest 15:47.
- **A silent, awaitable poll path.** Upstream's refresh functions return `undefined` and swallow errors into a toast, so no caller can sequence polls or detect failure. The new path resolves with the data and rejects on error.
- **The usage ping is disabled** — a personal build has no reason to phone home.

`src/timesync.ts` and `src/api/livedata.ts` still call `bg1.joelface.com` deliberately: the first for clock correction, the second for show times unavailable through Disney's tipboard.

## Development

```bash
npm ci
npm run checkall      # tests, lint, typecheck
npm run test:ci       # tests, excluding suites already broken upstream
npm run build:fork    # vite build, keeping the diu stub
npm start             # dev server
```

Upstream ships a red test suite — 8 suites fail in a clean checkout of upstream `mickey`, mostly stale fixtures. CI gates on `test:ci` so it stays a useful signal, and also runs the full suite for visibility. See **[FORK.md](FORK.md)** for the exclusion list, why a plain `mickey` build fails, and how to sync upstream.

Pushing to `mickey` builds and deploys to GitHub Pages, merging in the static pages from the `goofy` branch — see `.github/workflows/deploy.yml`.

## Acknowledgments

First and foremost, **[Joel Face](https://github.com/joelface)**, who wrote BG1. This fork is a small addition to a large amount of his work.

Upstream's acknowledgments, preserved:

- **Len Testa:** For helping me get as close as I could ever reasonably expect to accomplish a not very serious childhood dream of almost being an Imagineer. Also for creating [Touring Plans](https://touringplans.com/), which is pretty rad.

- **Barry, Stacy, Jeff, Michelle, Jim, Stuart, Bob, Kimberly, Milissa, Jennifer, Erin & Erin, Kristina, Lemonia, Scott, Jorge, Phil, Kellianne, Joshua, Brandon, Megan, Jennifer, Gary, Alexander, and others:** For helping me test and improve BG1.

- **Arialvetica:** For creating the awesome BG1 logo.

- **[ThemeParks.wiki](https://themeparks.wiki/):** For the free API used for showtime data not available via Disney's tipboard.

- **[Thrill Data](https://www.thrill-data.com/):** For providing data used to help determine Lightning Lane priorities.

- **[IcoMoon](https://icomoon.io/#icons-icomoon):** For the free icons, provided under a [Creative Commons license](https://creativecommons.org/licenses/by/4.0/).

Additionally, for this fork: **[TouringPlans](https://touringplans.com/)**, **WDWMagic** forum observers, and **BlogMickey** for independently reported drop-time data used to verify and correct the drop schedule.
