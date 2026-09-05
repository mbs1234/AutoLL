# AutoLL

A personal Lightning Lane tool for Walt Disney World, built on two people's work:

- **[joelface/bg1](https://github.com/joelface/bg1)** by Joel Face — the original, and everything underneath this: the Lightning Lane, virtual queue, DAS and itinerary clients, the UI, the login flow.
- **[jgeurts/bg1](https://github.com/jgeurts/bg1)** — restores Lightning Lane booking at Walt Disney World, and adds tier grouping, availability sorting, an existing-bookings view, and offer auto-refresh.

On top of those, this repository adds an availability watcher with automatic booking, moving and swapping; corrected attraction data; and the build and deploy plumbing to run it independently. **GPL-3.0-only**, same as both.

Deployed at **<https://mbs1234.github.io/AutoLL/>**.

**WARNING! Use at your own risk. This is highly experimental, for demonstration purposes only, and provided "as is" without warranty of any kind. It is in no way endorsed by or associated with the Walt Disney Company and could stop working at any time for any reason. To ensure the intended experience, always use the official Disney app.**

AutoLL is an unofficial client for Lightning Lane Multi Pass reservations and virtual queue boarding groups at Disney parks in the United States. For background on the original, read the [upstream documentation](https://joelface.github.io/bg1/).

> ### ⚠️ Booking depends on a component this repository does not maintain
>
> Lightning Lane booking at Walt Disney World works here because the base from **[jgeurts/bg1](https://github.com/jgeurts/bg1)** sends a header Disney's bot filter requires. That component is inherited, not written or maintained here, and Disney has changed the rules around it four times since November 2025 — so treat booking as something that may stop working without warning, and keep the official Disney app as your fallback.
>
> Everything else — watching, alerting, drop learning, the return-time windows, the corrected data — is independent of it and keeps working either way.

---

## Two bookmarklets

**AutoLL** (`index.html`) is the full tool: a watch list, per-attraction toggles, windows, a day budget, drop learning and diagnostics. It is for setting up a park day in advance.

**NextLL** (`nextll.html`) is one attraction, one goal, one button. Pick a ride, optionally say "return by", tap **Find it**: it takes the first Lightning Lane it can get and then keeps trying to move it earlier. Same engine underneath — it is `book then move` with a single target — but none of the levers, because at 7am with one hand and a coffee the levers are the problem.

They share a login, the action budget and the attraction data, and keep separate watch lists, so starting one does not disturb the other.

## Getting started

1. Open <https://mbs1234.github.io/AutoLL/> on your phone and install the bookmarklet (or userscript).
2. Run it on `disneyworld.disney.go.com/vas/` and sign in.
3. On the **LL** tab, tap the **clock button** to open Autopilot.
4. Star the attractions you want watched, then **Turn on autopilot** and allow notifications.
5. Leave the page open and in the foreground.

The header button is green while watching, yellow in dry run, red if it stopped after repeated errors.

## Autopilot

Upstream refreshes only when you tap refresh. Autopilot watches for you, alerts you, and — if you arm it — books.

**Pacing.** Rather than a fixed rate, it adjusts to what is coming:

| Mode | When | Interval |
| --- | --- | --- |
| Watching | nothing imminent | ~45s |
| Drop approaching | within 5 min of a drop or one of your booking windows | ~6s |
| Checking rapidly | 30s before to 120s after a drop | ~1.2s |

Targets come from the per-attraction drop times in `src/api/data/wdw.ts` and from every booking window Disney reports for your party — their slots free at different times, and each one is a moment inventory opens. The lead exists because inventory sometimes releases early; the trail because it trickles in and good times are gone within a minute. Every interval carries ±20% jitter. Timing runs on the drift-corrected clock in `src/timesync.ts`, which upstream computes but only ever uses to render the on-screen clock.

**Per-attraction toggles.** Each is off by default and independent, because the risks differ.

| Toggle | What it does |
| --- | --- |
| **Auto-book** | Books it when it appears inside your window. |
| **Auto-move** | Moves a reservation you already hold to a better time — at least 30 minutes better, never later, never outside your window. |
| **Book then move** | Books the first time offered *even outside your window*, then works it into the window. Wait Magic's "start wide, then narrow in": holding something beats holding nothing. Implies both of the above. |
| **Pause** | Keeps watching and alerting but takes no action — use it to force a higher-priority attraction to be booked first. |
| **Swap in** | When all three slots are full, gives up your lowest-priority reservation for this one, preferring a non-Tier-1 and never trading down. A single atomic request, so the old one is released only if the new one is secured. |

**Return-time window.** Set an earliest and latest return time per attraction. The window governs what Autopilot will *take*; it deliberately does not silence alerts, so an out-of-window offer is still reported rather than hidden.

**Ordering.** When two armed attractions appear in the same tick, the better one is booked first, ranked by the same order the LL list's **Priority** sort uses. When a higher-ranked Tier 1 is armed and still has a drop ahead of it, Autopilot passes on a lesser Tier 1 rather than spend the party's Tier 1 slot — releasing that hold once the better attraction's drops have passed, **or as soon as your party redeems its first Lightning Lane**, since the one-Tier-1 limit only applies until then.

**Dry run.** Everything except acting: it watches, alerts, checks eligibility and applies every guard, then logs *"would have booked Slinky Dog Dash for 11:05 AM"*. Nothing is committed and none of it spends the day's budget — though it does stop once that budget is gone, since a live run with nothing left would do nothing either. The recommended way to spend a first park day with it. Deliberately loud — yellow banner, yellow header button — because a forgotten dry run looks exactly like a broken booker.

**Whole party only.** Off by default, matching how booking by hand works: Autopilot books for whoever is eligible. Turn it on and it acts only when everyone in your saved party is eligible.

**Avoid clashes.** On by default. Autopilot refuses a return time that lands on top of a reservation you already hold, dining included — checked before the offer is requested and again on the offer's real time. Booking by hand only warns about this; Autopilot has nobody to warn.

**Alerts** are edge-triggered per attraction: one alert when it becomes available, silence while it stays, eligible again once it goes away and returns. On iOS, notifications require adding the page to your Home Screen; without that you still get the chime.

### Safety limits

- **Ten actions per park day,** settable from 1 to 30. Bookings, moves and swaps share one budget, so a matching bug cannot burn a day of Lightning Lanes. It is persisted, so it survives a reload and turning Autopilot off and on — both of which used to refill it silently, which meant it bounded nothing. When it runs out Autopilot keeps watching and alerting, and offers a top-up rather than stopping quietly. A new park day starts clean.
- **One attempt per attraction per action,** recorded *before* the request goes out — a timed-out request may have succeeded, so retrying is the dangerous option. **Booking is the exception:** Disney lets you book, cancel and rebook the same attraction, and only *redeeming* it is once per day. A booking lock therefore lifts once the itinerary has shown the reservation and then shown it gone. A booking never seen keeps its lock, since absence cannot be told from an itinerary that has not caught up; so does one whose entitlement was redeemed or expired unredeemed, which Disney counts as ridden.
- **An unsettled booking holds a slot.** A request that never returned may still have landed, so it counts against the allowance until plans settle it. The cap bounds Lightning Lanes *possibly* spent, and the on-screen "N left" follows it.
- **An empty cache** each time you turn Autopilot on, so a stale eligibility result cannot drive a booking. The day's spend is deliberately *not* reset with it.
- **Arming persists, running does not.** Auto-book choices and the day's budget are saved; Autopilot itself is always off after a reload.
- **The offer's real time is re-checked** before booking. Matching runs on the tipboard's advertised time, but the offer that comes back can be later — inventory moves, and Disney sometimes places a third Lightning Lane between two you hold. An offer outside your window is abandoned, and the next check is a second away.

### Scope

**Multi Pass only, by design.** Matching reads the `flex` field and BG1 has no Single Pass booking flow, so TRON, Rise of the Resistance, Seven Dwarfs Mine Train, Guardians and Flight of Passage are deliberately not watchable. **Must stay foregrounded:** mobile browsers throttle background timers. Autopilot holds a screen wake lock so the phone will not lock mid-drop, but switching apps still backgrounds the page. A service worker cannot fix this — BG1 runs injected into Disney's origin, and a worker must be served from the origin it controls.

## Learning and diagnostics

**Learned drop times.** The built-in schedule comes from third-party reports that bucket to five minutes. Autopilot watches at up to one-second resolution, so it records when availability *actually* appears and compares. A drop counts as an attraction becoming available, or its earliest return time jumping ≥15 minutes earlier; observations within two minutes are one drop. It also records **when it was watching**, so a scheduled time reads as *"seen 2 of 2 watched days"*, or in red *"seen 0 of 3"* — real evidence the schedule is wrong — or *"not watched yet"*, which says nothing. A drop seen on **two or more distinct days** is added to the times Autopilot bursts for, so the schedule self-corrects. Kept for 30 days.

**Why nothing was booked.** Skips are counted rather than logged — during a drop they happen every second — and shown ranked: *"7× not everyone in the party was eligible"*, *"3× it clashed with something already booked"*.

**Refused requests.** If Disney refuses the booking calls outright — a 403, which is what the bot filter returns — the Autopilot screen says so plainly and names which call is being refused. It waits for three refusals spanning at least a minute, so an ordinary hiccup mid-drop does not trip it, and a single success clears it. This matters because a refusal lands on *eligibility*, one step before an offer exists: without it, Autopilot keeps polling, alerting and learning drop times while silently never acting.

**Activity log.** What was booked, moved, swapped or failed, surviving a reload for the rest of the park day.

**Unknown attractions.** If Disney's tipboard lists a facility ID this build does not know, the Autopilot screen says so. Unknown IDs are otherwise dropped in silence — no row, no alert, no booking, and nothing explaining why.

## Improving pre-booked selections before your trip

Pick a later date in the LL tab and Autopilot works on that day instead of today — **booking as well as moving**. Neither paid tool makes new bookings before the park day, and this is the scenario it wins: you buy Multi Pass at the 7-day window with one selection because the headliners were gone, and Autopilot fills slots 2 and 3 overnight from cancellations.

Everything that decides an action is scoped to the day being worked on — the reservations you hold, the free slots, the clash check, the eligibility fetch, and the offer itself. Three facts that are only ever about *today* are now fenced off from it: whether an attraction has been ridden, whether the party has redeemed anything (which lifts the one-Tier-1 limit), and the drop schedule that governs the Tier 1 hold. Riding Space Mountain this morning no longer makes Autopilot behave as though you had ridden it next Tuesday.

Alerts name the date when it isn't today, and are keyed by it, so a find for tomorrow can't be silently replaced by one for this afternoon. Drops are a day-of phenomenon, so a future date polls at the slow steady rate; its availability comes from cancellations, which have no schedule.

## Faster booking

Booking costs three sequential requests: eligibility, offer, book. Eligibility is the only one that does not change second to second, so it is fetched in advance for armed attractions and cached — a third of the round trips removed from the moment a drop lands. The cache expires as soon as an ineligible guest's eligibility time passes, and clears entirely after any booking, since party, tier and overlap limits shift eligibility for every attraction at once. Prewarm requests go one at a time; a fan-out is exactly the burst that trips the rate limiter.

## Fixes and corrections

**Attraction data**

- **Three attractions were invisible.** Disney re-issues a facility ID when a ride is re-themed, and `LLClient.experiences()` drops an unknown ID silently. Rock 'n' Roller Coaster Starring The Muppets (`412573652`), Soarin' Across America (`412577054`) and Disney Jr. Mickey Mouse Clubhouse Live! (`412521565`) all had new IDs this build lacked — two of them headliners — so they could not be listed, watched or booked. Added, with the retired IDs kept as `null`, and unknown IDs now surfaced on screen instead of only in the console.
- **Two attractions were in the wrong park.** Zootopia and Moana (Character Landing) pointed at EPCOT's World Discovery instead of Animal Kingdom's Discovery Island, so a held Zootopia Lightning Lane made Autopilot poll EPCOT's tipboard on an Animal Kingdom day. A test now scans every entry against the section it is declared under.
- **Priorities re-ranked** where the published order had moved on: Big Thunder Mountain Railroad to the top of Magic Kingdom's Tier 1, Buzz Lightyear out of the unbadgeable band, Kilimanjaro Safaris above Expedition Everest (they collide at the 12:47 drop), Little Mermaid below Alien Swirling Saucers, plus Soarin' and Zootopia. Big Thunder deliberately carries no `avgWait`: no trustworthy post-reopening average exists, and an invented one would decide swaps.
- **Drop times added,** cross-checked against TouringPlans, WDWMagic observer logs and BlogMickey: Tiana's Bayou Adventure 14:17, Expedition Everest 14:47 and 15:47.

**Correctness**

- **Slot accounting counted spent reservations.** A fully-redeemed Lightning Lane survives in the itinerary with no guests, and counting it meant that after the first tap-in of the day Autopilot believed the party was full and swapped a reservation away instead of booking into the slot that had just come free. Now only cancellable reservations with a guest left count, and Multiple Experiences Passes are excluded.
- **Booking locks are released by evidence, not at session end,** so cancelling a late return time by hand no longer forfeits the earlier one that drops an hour later. During a drop plans are polled roughly every 12 seconds, so the two consecutive absences a release needs are about 24 seconds apart.
- **Only the earliest booking window was read.** Disney reports one moment per freeing slot, and Autopilot kept the first and idled at 45 seconds through the rest. It now paces itself to all of them. The old code also ordered them as text, so a window just after midnight sorted to the front of a late Magic Kingdom night and was reported as the next one.
- **Cached eligibility outlived the party.** The cache was cleared only for actions Autopilot took itself, so a tap-in, an expiry, a reservation cancelled by hand, or one booked in Disney's own app all moved eligibility and cleared nothing — leaving a party that tapped in mid-drop sitting out the rest of it on a stale “you cannot book”. It now clears whenever what the party holds changes.
- **A Multiple Experiences Pass blocked bookings.** The pass Disney issues when a ride goes down is good any time, but it parses with a start time, so clash avoidance treated it as a 100-minute reservation and refused every return time in that band until it was used.
- **The acting loop read stale plans.** On the tick that polled plans it was still reading the copy from the previous render, so a slot that had just come free looked taken — and Autopilot gave up a reservation to swap into a slot it could simply have booked.
- **The return-time window had no UI.** It was declared, persisted, revived and gating four code paths, but the only way to set one was to hand-edit `localStorage`.
- **`RateLimit` no longer latches permanently.** Upstream set an "exceeded" flag on the first violation and never cleared it, so one burst rejected *every* later API call until a reload. This was the prerequisite for any automated polling.
- **The tree actually builds.** Upstream's `src/api/diu` module is gitignored and never published, and its build script deletes the public shim, so a clean clone cannot resolve the import. A stub restores it; only Disneyland calls it.
- **A silent, awaitable poll path.** Upstream's refresh functions return `undefined` and swallow errors into a toast, so nothing could sequence polls or detect failure.
- **The screen stays awake** while Autopilot runs. Degrades silently where unsupported (needs iOS Safari 16.4+).
- **`nextBookTime` is read for the date you asked about,** not always today.
- **The usage ping is disabled** — a personal build has no reason to phone home.

`src/timesync.ts` and `src/api/livedata.ts` still call `bg1.joelface.com` deliberately: clock correction, and show times unavailable through Disney's tipboard.

## Development

```bash
npm ci
npm run checkall      # tests, lint, typecheck
npm run test:ci       # tests, excluding suites already broken upstream
npm run build:fork    # vite build, keeping the diu stub
npm start             # dev server
```

Upstream ships a red test suite — 8 suites fail in a clean checkout of upstream `mickey`, mostly stale fixtures. CI gates on `test:ci` so it stays a useful signal, and runs the full suite for visibility. See **[FORK.md](FORK.md)** for the exclusion list and how to sync upstream, and **[docs/PLAN.md](docs/PLAN.md)** for the research behind the data corrections and what is planned next.

Pushing to `mickey` builds and deploys to GitHub Pages, merging in the static pages from `goofy` — see `.github/workflows/deploy.yml`.

## Acknowledgments

First and foremost **[Joel Face](https://github.com/joelface)**, who wrote BG1. This fork is a small addition to a large amount of his work.

Upstream's acknowledgments, preserved:

- **Len Testa:** For helping me get as close as I could ever reasonably expect to accomplish a not very serious childhood dream of almost being an Imagineer. Also for creating [Touring Plans](https://touringplans.com/), which is pretty rad.
- **Barry, Stacy, Jeff, Michelle, Jim, Stuart, Bob, Kimberly, Milissa, Jennifer, Erin & Erin, Kristina, Lemonia, Scott, Jorge, Phil, Kellianne, Joshua, Brandon, Megan, Jennifer, Gary, Alexander, and others:** For helping me test and improve BG1.
- **Arialvetica:** For creating the awesome BG1 logo.
- **[ThemeParks.wiki](https://themeparks.wiki/):** For the free API used for showtime data not available via Disney's tipboard.
- **[Thrill Data](https://www.thrill-data.com/):** For providing data used to help determine Lightning Lane priorities.
- **[IcoMoon](https://icomoon.io/#icons-icomoon):** For the free icons, provided under a [Creative Commons license](https://creativecommons.org/licenses/by/4.0/).

For this fork additionally: **[ThemeParks.wiki](https://themeparks.wiki/)** for the live facility IDs that surfaced the three stale ones, and **[TouringPlans](https://touringplans.com/)**, **WDWMagic** forum observers and **BlogMickey** for the drop-time reports.
