# BG1 — personal fork

A personal fork of **[joelface/bg1](https://github.com/joelface/bg1)** by Joel Face, the original author of everything this is built on. All of the Lightning Lane, virtual queue, DAS and itinerary work is his; this fork adds an availability watcher, optional automatic booking, and fixes for a few things needed to build and run it independently. Licensed **GPL-3.0-only**, same as upstream.

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

- **Multi Pass only, by design.** Matching reads the `flex` field, and BG1 has no Single Pass booking flow. Most famous headliners — TRON, Rise of the Resistance, Seven Dwarfs Mine Train, Guardians, Flight of Passage — are Single Pass and are deliberately *not* watchable here; Slinky Dog Dash is the one Multi Pass headliner. This is settled scope rather than a missing feature: Single Pass is a separate paid-per-ride product, and watching something this app cannot book would be worse than not offering it.
- **Must stay foregrounded.** Mobile browsers heavily throttle timers in background tabs.
- **Off after a reload,** by design: a watcher resuming with no user gesture behind it cannot unlock audio, and silently issuing requests on page load is a surprising default. Your watch list persists; the on/off state does not.
- **On iOS,** notifications require adding the page to your Home Screen. Without that you still get the chime.
- Alerts are edge-triggered per attraction: one alert when it becomes available, then silence until it goes away and comes back.

### Automatic booking

Autopilot can book for you instead of only telling you. It is **opt-in per attraction and off by default**, because alerting is cheap to get wrong and booking is not.

**How to use it**

1. Add an attraction to your watch list as above.
2. On the Autopilot screen, tap **Auto-book off** next to it — it flips to **Auto-book on**.
3. Set a time window for that attraction if you care when the return time is. With no window, any offered time is acceptable.
4. Turn autopilot on. When the attraction appears, it books without asking and notifies you with the return time it got.

If two armed attractions become available at once, the better one is booked first, ranked by the same priority order the LL list's **Priority** sort uses. And when a higher-ranked Tier 1 attraction is armed and still has a drop ahead of it, Autopilot will pass on a lesser Tier 1 offer rather than spend the party's Tier 1 slot on it — releasing that hold on its own once the better attraction's drops have passed, **or as soon as your party redeems its first Lightning Lane of the day**, since the one-Tier-1 limit only applies until then.

The screen shows a **Booking activity** log of what was booked and anything that failed.

**The guard that matters.** Matching runs against the return time the tipboard advertises, but the offer that actually comes back can carry a *later* time — inventory moves between the two requests, and Disney sometimes places a third Lightning Lane between two you already hold. So the real return time is re-checked against your window before booking, and an offer outside it is abandoned rather than booked. A Lightning Lane is not free to undo, so handing you a time you explicitly excluded would be the worst outcome. An abandoned offer stays retryable — the next check is about a second away.

**Other safety limits**

- **Three actions per session** — bookings, moves, and swaps share one budget — so a bug in matching cannot burn a whole day of Lightning Lanes. The count resets only on reload.
- **One attempt per action per attraction.** Booking, moving, and swapping are each tried at most once per attraction per session. Each attempt is recorded *before* the request goes out: a request that times out may still have succeeded server-side, so retrying risks doing it twice.
- **A fresh allowance and empty cache every time you turn autopilot on**, so a stale eligibility result cannot drive a booking.
- **Arming persists, running does not.** Your auto-book choices are saved, but autopilot itself is always off after a reload — nothing can book until you deliberately turn it on again.

### Automatic re-timing

Autopilot can also move a reservation you **already hold** to a better time. Separate per-attraction toggle from booking, because the risks differ: booking spends an entitlement you did not have, while moving puts one you already hold through a round trip.

**How to use it**

1. Watch the attraction, then tap **Auto-move off** next to it so it reads **Auto-move on**.
2. Turn autopilot on. If a much better return time appears for something you hold, it moves the reservation and tells you both times.

**What it guarantees**

- **Never moves you later.** A modify offer can come back with a different time than the tipboard advertised, including a worse one. The real time is re-checked before anything is committed, so it will not trade an 11am return for a 7pm one — a failure mode plain booking does not have.
- **At least 30 minutes better,** or it does not bother. Swapping 7:10pm for 6:55pm is not worth putting a held reservation through a round trip.
- **Stays inside your window,** same as booking.
- **One move per attraction per session,** sharing the overall action cap — so it will not thrash a reservation back and forth as availability shifts. A move is tracked separately from a booking, which is what lets *book then move* work.
- **Skips reservations Disney marks unmodifiable.**

If you hold a reservation and have both toggles on, moving takes precedence — booking a second one for the same attraction would just be rejected.

### Book then move

The strategy Thrill Data's Wait Magic recommends: **start wide, then narrow in.** A wide search finds availability far more often than a narrow one, and holding *something* beats holding nothing while you wait for the perfect time.

Tap **Book then move off** next to a watched attraction so it reads **Book then move on**. While you hold nothing for that attraction, Autopilot books the first time offered — **even outside your window** — so you have a reservation. Once you hold one, your window becomes the goal, and Autopilot moves the reservation into it when a qualifying time appears (same 30-minute-gain and never-later rules as re-timing). It implies both booking and moving; you don't need the other toggles on.

### Pause

**Pause** keeps an attraction watched and alerting but takes no action on it — no booking, moving, or swapping. Use it to control order by hand: pause the lesser attractions so a higher-priority one gets booked first, then resume them. A paused attraction also stops making Autopilot hold the Tier 1 slot for it, since pausing it means "not now."

### Swap in

When **all three** Multi Pass slots are taken and a watched attraction marked **Swap in** appears, Autopilot gives up your **lowest-priority** reservation for it — preferring to let go of a non-Tier-1, which is easier to claim again later, and never giving up anything ranked equal to or better than the incoming attraction.

This is the safe form of "don't be afraid to cancel." The swap is a **single request**: Disney releases the old reservation only if the new one is secured, so there is no moment where you hold nothing. With a slot free, it simply books instead. The offered time is still checked against your window before anything is committed.

### Improving pre-booked selections before your trip

Auto-move works on future dates too. Select a later date in the LL tab's date picker, watch the attractions you pre-booked, and turn on **Auto-move**; Autopilot will improve those return times as cancellations open up. Drop times are a day-of phenomenon, so on a future date it polls at its slow steady rate rather than bursting. Reservations are matched to the specific park day being watched, so watching today never touches tomorrow's selections.

### Whole-party guard, activity log, and diagnostics

**Whole party only.** By default Autopilot books for whoever is eligible — the way booking by hand in bg1 or Disney's app does. If two of your five are eligible, you get a Lightning Lane for two. Turn on **Whole party only** on the Autopilot screen and it will not book, move, or swap unless *everyone in your saved party* is eligible; a Lightning Lane for part of the group is often worse than none. Guests outside your saved party never count against this. The setting is remembered.

**Activity log.** What Autopilot booked, moved, swapped, or failed at is listed on the screen and now **survives a reload for the rest of the park day.** (Autopilot itself is still off after a reload — only the record persists.)

**Why nothing was booked.** Attempts that were skipped are deliberately kept out of the log — during a drop they happen every second and would bury the real entries. Instead they are counted, and the screen shows a ranked list such as *"7× not everyone in the party was eligible"* or *"3× the offered time was outside the window"*, so a quiet day is explainable rather than mysterious. The counts reset each time you turn Autopilot on.

### Faster booking

Booking a new Lightning Lane costs three sequential requests: guest eligibility, then offer generation, then the booking itself. Eligibility is the only one that does not change second to second, so Autopilot fetches it in advance for armed attractions and caches it — removing a third of the round trips from the moment a drop lands, which is exactly when seconds decide whether you get an 11am return time or a 7pm one.

The cache invalidates aggressively, because a wrong answer here is expensive:

- It expires as soon as an ineligible guest's eligibility time passes. Reusing it past that point would silently book for part of your party and leave the rest out.
- It clears entirely after any booking, since party, tier and overlap limits shift eligibility for *every* attraction at once, not just the one that changed.

Prewarm requests go out one at a time rather than in parallel — a fan-out across several attractions is exactly the burst that trips the shared rate limiter.

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
