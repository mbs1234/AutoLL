# AutoLL

An unofficial client for Lightning Lane Multi Pass and virtual queue boarding groups at Walt Disney World. Upstream refreshes when you tap refresh; AutoLL watches for you, alerts you, and — if you arm it — books.

Built on two people's work, and **GPL-3.0-only** like both:

- **[joelface/bg1](https://github.com/joelface/bg1)** by Joel Face — the original, and everything underneath this: the Lightning Lane, virtual queue, DAS and itinerary clients, the UI, the login flow. For background, read the [upstream documentation](https://joelface.github.io/bg1/).
- **[jgeurts/bg1](https://github.com/jgeurts/bg1)** — restores Lightning Lane booking at Walt Disney World, and adds tier grouping, availability sorting, an existing-bookings view, and offer auto-refresh.

On top of those this repository adds Autopilot and NextLL, corrected attraction data, and the build and deploy plumbing to run independently. Deployed at **<https://mbs1234.github.io/AutoLL/>**.

**WARNING! Use at your own risk. This is highly experimental, for demonstration purposes only, and provided "as is" without warranty of any kind. It is in no way endorsed by or associated with the Walt Disney Company and could stop working at any time for any reason. To ensure the intended experience, always use the official Disney app.**

> ### ⚠️ Booking depends on a component this repository does not maintain
>
> Booking works here because the base from **jgeurts/bg1** sends a header Disney's bot filter requires. That component is inherited, not written or maintained here, and Disney has changed the rules around it four times since November 2025 — so treat booking as something that may stop without warning, and keep the official Disney app as your fallback.
>
> Everything else — watching, alerting, drop learning, return-time windows, the corrected data — is independent of it and keeps working either way.

## Install

1. Open <https://mbs1234.github.io/AutoLL/> on your phone and install the bookmarklet (or userscript).
2. Run it on `disneyworld.disney.go.com/vas/` and sign in.
3. On iOS, add the page to your Home Screen if you want notifications; without that you still get the chime.

## How to use

Four tabs along the bottom: **LL** (the tipboard), **Times**, **Plans**, and **NextLL**.

Start on **LL**. Choose your park and your party, then tap the **clock button** in the header to open **Autopilot** — that is where you star attractions to watch, arm what may be booked, and turn it on. The clock button is green while watching, yellow in dry run, red if it stopped after repeated errors, with a badge showing how many attractions it is watching in the loaded park.

Use **NextLL** instead when you are standing in the park and want one specific ride as soon as possible.

At a glance:

|         | Autopilot                         | NextLL                |
| ------- | --------------------------------- | --------------------- |
| For     | a whole day, set up in advance    | one ride, right now   |
| Watches | as many attractions as you star   | exactly one           |
| Checks  | every 45s, speeding up near drops | every 0.6s            |
| Runs    | across tabs, all day              | while its tab is open |
| Budget  | 10 actions per park day           | exempt                |

Both need the page **open and in the foreground** — mobile browsers throttle background timers. Autopilot holds a screen wake lock so the phone will not lock mid-drop, but switching apps still backgrounds the page.

## Autopilot

**Pacing.** Rather than a fixed rate, it adjusts to what is coming:

| Mode             | When                                                  | Interval |
| ---------------- | ----------------------------------------------------- | -------- |
| Watching         | nothing imminent                                      | ~45s     |
| Drop approaching | within 5 min of a drop or one of your booking windows | ~6s      |
| Checking rapidly | 30s before to 120s after a drop                       | ~1.2s    |

Targets come from the per-attraction drop times in `src/api/data/wdw.ts` and from every booking window Disney reports for your party — their slots free at different times, and each is a moment inventory opens. The lead exists because inventory sometimes releases early; the trail because it trickles in and good times are gone within a minute. Every interval carries ±20% jitter, timed on the drift-corrected clock in `src/timesync.ts`.

**Per-attraction toggles.** Each is off by default and independent, because the risks differ.

| Toggle             | What it does                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto-book**      | Books it when it appears inside your window.                                                                                                                                                                               |
| **Auto-move**      | Moves a reservation you already hold to a better time — at least 30 minutes better, never later, never outside your window.                                                                                                |
| **Book then move** | Books the first time offered _even outside your window_, then works it into the window. Holding something beats holding nothing. Implies both of the above.                                                                |
| **Pause**          | Keeps watching and alerting but takes no action — use it to force a higher-priority attraction to be booked first.                                                                                                         |
| **Swap in**        | When all three slots are full, gives up your lowest-priority reservation for this one, preferring a non-Tier-1 and never trading down. A single atomic request, so the old one is released only if the new one is secured. |

**Return-time window.** An earliest and latest return time per attraction. It governs what Autopilot will _take_; it deliberately does not silence alerts, so an out-of-window offer is still reported rather than hidden.

**Ordering.** When two armed attractions appear in the same tick, the better one goes first, ranked as the LL list's **Priority** sort does. When a higher-ranked Tier 1 is armed and still has a drop ahead of it, Autopilot passes on a lesser Tier 1 rather than spend the party's Tier 1 slot — releasing that hold once the better attraction's drops have passed, or as soon as your party redeems its first Lightning Lane, since the one-Tier-1 limit only applies until then.

**Dry run.** Everything except acting: it watches, alerts, checks eligibility and applies every guard, then logs _"would have booked Slinky Dog Dash for 11:05 AM"_. The recommended way to spend a first park day with it. Deliberately loud — yellow banner, yellow header button — because a forgotten dry run looks exactly like a broken booker.

**Whole party only.** Off by default, matching how booking by hand works: Autopilot books for whoever is eligible. Turn it on and it acts only when everyone in your saved party is eligible.

**Avoid clashes.** On by default. Autopilot refuses a return time landing on top of a reservation you already hold, dining included — checked before the offer is requested and again on the offer's real time. Booking by hand only warns about this; Autopilot has nobody to warn.

**Alerts** are edge-triggered per attraction: one when it becomes available, silence while it stays, eligible again once it goes away and returns.

### Safety limits

- **Ten actions per park day,** settable from 1 to 50. Bookings, moves and swaps share one budget, so a matching bug cannot burn a day of Lightning Lanes. Persisted, so it survives a reload and turning Autopilot off and on. When it runs out Autopilot keeps watching and alerting, and offers a top-up rather than stopping quietly. A new park day starts clean.
- **One attempt per attraction per action,** recorded _before_ the request goes out — a timed-out request may have succeeded, so retrying is the dangerous option. A rejection Disney actually returned is different: nothing happened, so the lock comes back after a 20-second wait. **Booking is a further exception:** Disney lets you book, cancel and rebook, and only _redeeming_ is once per day, so a booking lock lifts once the itinerary has shown the reservation and then shown it gone.
- **An unsettled booking holds a slot.** A request that never returned may still have landed, so it counts against the allowance until plans settle it. The cap bounds Lightning Lanes _possibly_ spent.
- **An empty cache** each time you turn Autopilot on, so a stale eligibility result cannot drive a booking. The day's spend is deliberately _not_ reset with it.
- **Arming persists, running does not.** Choices and the day's budget are saved; Autopilot itself is always off after a reload.
- **The offer's real time is re-checked** before booking — the tipboard advertises one time and the offer can come back later. An offer outside your window is abandoned.

### Before your trip

Pick a later date in the LL tab and Autopilot works on that day instead of today — **booking as well as moving**. The scenario it wins: you buy Multi Pass at the 7-day window with one selection because the headliners were gone, and Autopilot fills slots 2 and 3 overnight from cancellations.

Everything deciding an action is scoped to the day being worked on. Three facts that are only ever about _today_ are fenced off from it: whether an attraction has been ridden, whether the party has redeemed anything, and the drop schedule governing the Tier 1 hold. Alerts name the date when it is not today and are keyed by it. A future date polls at the slow steady rate, since cancellations have no schedule.

### Learning and diagnostics

**Learned drop times.** The built-in schedule comes from third-party reports bucketed to five minutes; Autopilot watches at up to one-second resolution and records when availability _actually_ appears. A drop is an attraction becoming available, or its earliest return time jumping ≥15 minutes earlier. It also records **when it was watching**, so a scheduled time reads _"seen 2 of 2 watched days"_, or in red _"seen 0 of 3"_ — real evidence the schedule is wrong — or _"not watched yet"_, which says nothing. Seen on **two or more distinct days** and it is added to the times Autopilot bursts for. Kept 30 days.

**Why nothing was booked.** Skips are counted rather than logged — during a drop they happen every second — and ranked: _"7× not everyone in the party was eligible"_.

**Refused requests.** If Disney refuses the booking calls outright — a 403, what the bot filter returns — the screen says so and names which call. It waits for three refusals spanning at least a minute, and a single success clears it. This matters because a refusal lands on _eligibility_, one step before an offer exists: without it, Autopilot keeps polling, alerting and learning while silently never acting.

**Slow checking.** A failed check backs the poller off — 2s, 4s, up to 60s — and stops it after eight. The screen now says so while it is happening, with the error, so a backing-off Autopilot cannot be mistaken for an idle one.

**Activity log** and **unknown attractions** round it out: what was booked, moved, swapped or failed for the rest of the park day, and a notice if Disney's tipboard lists a facility ID this build does not know (otherwise dropped in silence — no row, no alert, no booking).

## NextLL

The fourth tab. One attraction, one goal, one button: pick a ride, optionally say "return by", tap **Find it**. It takes the first Lightning Lane it can get and then keeps trying to move it earlier.

The same engine underneath — `book then move` with a single target — but none of the levers, because at 7am with one hand the levers are the problem. It shares the saved party with the LL tab and carries its own park selector. Three deliberate differences from Autopilot:

- **It polls hard.** Every 0.6s, twice a drop burst — there is no drop schedule to pace against when you are waiting for someone else to cancel. Not faster: the client's rate limit throws rather than throttles, and the cooldown would land at the worst moment.
- **It ignores the day's action budget.** One named attraction with somebody standing over it is bounded by its own shape, and a morning of Autopilot should not silently disable an afternoon search.
- **It moves a reservation as often as it can improve it,** where Autopilot allows one move per attraction per session to stop it thrashing. Every move must still clear the 30-minute bar.

Its watch list is stored separately, so a search does not disturb what Autopilot is watching. Leaving the tab stops the search — a bookmarklet cannot keep a 0.6s loop alive behind a backgrounded page anyway — but not silently: the goal is remembered for the park day, and coming back offers **Resume** in one tap.

## Other details

**Multi Pass only, by design.** Matching reads the `flex` field and BG1 has no Single Pass booking flow, so TRON, Rise of the Resistance, Seven Dwarfs Mine Train, Guardians and Flight of Passage are deliberately not watchable.

**Faster booking.** Booking costs three sequential requests: eligibility, offer, book. Eligibility is the only one that does not change second to second, so it is fetched in advance for armed attractions and cached — a third of the round trips gone from the moment a drop lands. The cache clears after any booking, since party, tier and overlap limits shift eligibility for everything at once.

**Corrected attraction data.** Disney re-issues a facility ID when a ride is re-themed, and an unknown ID is dropped silently — Rock 'n' Roller Coaster Starring The Muppets, Soarin' Across America and Disney Jr. Mickey Mouse Clubhouse Live! were all invisible, two of them headliners. Zootopia and Moana pointed at the wrong park, so a held Zootopia pass made Autopilot poll EPCOT on an Animal Kingdom day. Priorities were re-ranked where the published order had moved on, and drop times added for Tiana's Bayou Adventure and Expedition Everest, cross-checked against TouringPlans, WDWMagic observer logs and BlogMickey.

**Correctness fixes worth knowing about.** Fully-redeemed passes no longer count against your three slots, so the first tap-in of the day no longer makes Autopilot swap instead of book. Booking locks release on evidence rather than at session end, so cancelling a late return time by hand no longer forfeits an earlier one. All of Disney's booking windows are paced for, not just the first. Cached eligibility clears whenever what the party holds changes, however it changed. A Multiple Experiences Pass no longer reads as a 100-minute reservation that blocks every booking in that band. `RateLimit` no longer latches permanently on the first violation. The usage ping is disabled.

`src/timesync.ts` and `src/api/livedata.ts` still call `bg1.joelface.com` deliberately: clock correction, and show times unavailable through Disney's tipboard.

**Storage.** The bookmarklet runs injected into `disneyworld.disney.go.com`, so
everything it saves lives in _Disney's_ local storage rather than this site's —
which every bg1-derived build on the same phone shares. AutoLL keeps its own
`autoll.*` namespace so that installing it alongside another build cannot make
the two overwrite each other's watch lists, budgets, booking tracking or
learned drop times. Anything found under the old shared `bg1.*` keys is adopted
once, on first load, and left in place rather than moved.

**Development.**

```bash
npm ci
npm run checkall      # tests, lint, typecheck
npm run test:ci       # tests, excluding suites already broken upstream
npm run build:fork    # vite build, keeping the diu stub
npm start             # dev server
```

Upstream ships a red test suite — 8 suites fail in a clean checkout of upstream `mickey`, mostly stale fixtures. CI gates on `test:ci` so it stays a useful signal, and runs the full suite for visibility. See **[FORK.md](FORK.md)** for the exclusion list, the booking history and how to sync upstream, and **[docs/PLAN.md](docs/PLAN.md)** for the research behind the data corrections and what is planned next. Pushing to `mickey` builds and deploys to GitHub Pages, merging in the static pages from `goofy`.

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
