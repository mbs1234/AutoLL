# bg1 — Booking intelligence plan for December 2026

Written 2026-09-05. Sources: the four strategy articles supplied by the owner,
Thrill Data's public Lightning Lane pages and Wait Magic FAQ, Disney's own
Lightning Lane FAQ, TouringPlans, BlogMickey, WDWMagic's drop-tracking thread,
themeparks.wiki's live facility data, and a line-by-line read of this codebase
at `d8dd6c5`.

Seventy candidate findings came out of five parallel research passes. Each was
then handed to an independent agent told to _refute_ it. **Nineteen were
refuted and are recorded in §9 so they are not rediscovered later.** What
follows is what survived, plus what I verified directly against the tree and
against Disney's live data.

Platform work — the Capacitor app and the Fly.io service — is a separate track
and deliberately absent here. This document is about making the booker smarter.

## Status

This plan was written for the `mbs1234/bg1` fork. That work now lives in
**AutoLL**, merged onto [jgeurts/bg1](https://github.com/jgeurts/bg1) so that
Lightning Lane booking works; see FORK.md, "Booking". Section numbers below are
unchanged.

**Landed:** all of Phase 0 (§3) and all of Phase 1 (§4).

Phase 0 and P1.1–P1.4: the three missing facility ids plus an on-screen warning
for the next one, the priority, land and drop-time corrections, the return-time
window UI, slot accounting, the overlap guard, and treating an expired pass as
ridden. A section-consistency test also found two Disneyland entries filed under
the wrong park.

P1.5–P1.8, with three of the four items corrected by the code:

- **P1.5** landed as written, and the same pass found a second bug the item did
  not name: the windows were ordered as `HH:MM:SS` text, so one just after
  midnight sorted ahead of a late Magic Kingdom night.
- **P1.6**'s diagnosis was wrong on both halves. Nothing was ever pinned --
  `staleAfter` layers on top of the 3-minute TTL rather than replacing it -- and
  its _absence_ means fewer refetches, not more. What is real is that the cache
  was cleared only for actions autopilot took itself, so a tap-in, an expiry, a
  hand cancellation, or a booking made in Disney's own app all moved eligibility
  and cleared nothing. It now clears whenever what the party holds changes,
  which is both simpler and covers the direction the item missed.
- **P1.7** is mostly refuted; see §9. An MEP parses as `subtype: 'OTHER'`, so
  `isLLMP` already excluded it from every path the item wanted guarded, and a
  burst cannot be forced from inside the tick that detects one. What survived is
  a bug P1.3 introduced: an MEP carries a start time, so the overlap guard was
  giving it a 100-minute clash band for the rest of the day.
- **P1.8** landed with the ceiling enforced on the effective budget rather than
  only on the setting, since the refill total is persisted and therefore
  editable; and dry run stops at an exhausted budget rather than being exempt
  from it.

Two fixes fell out that no item asked for: the acting loop was reading the
previous render's plans on the tick that polled them, and `heldMPToday` now also
excludes an MEP (a boundary guard rather than a live fix).

**Also landed since, beyond the plan:** P2.5's `hasUpcomingDrop` half — the
Tier 1 hold is now bounded to a 90-minute horizon rather than "any drop still
ahead today", which was holding Magic Kingdom's Tier 1 slot from park open
until the first tap-in because Tiana's drop list runs to 21:47. The party-night
date table (P2.5's other half) is deliberately **not** built: the horizon bounds
that case to ninety minutes, and a wrong date would silently suppress real drops
on a normal day, which is the worse failure.

§3.2's Jingle Cruise renumbering was also restored. It had been reverted by the
wholesale adoption of upstream's priority/avgWait values in `a474377`, which
re-tied it with Big Thunder at priority 1 — handing Magic Kingdom's single Tier 1
selection to a re-themed Jungle Cruise on the `avgWait` tiebreak, and disabling
the hold between the only pair it matters for. `priority.test.ts` now asserts
that ordering over the shipped data, which nothing did before.

**Decided against:** a Tier 1 guard for the future-date booking path
(§7 adjacent). `shouldHoldTierSlot` is gated `forToday`, so an overnight
cancellation fill can spend a park day's Tier 1 selection on a lesser ride. The
obvious guard deadlocks — the hold avoids deadlock only because the better
attraction has a drop still ahead _today_, and a date a week out has no such
clock. Left as is by decision, 2026-09-05.

**Outstanding:** Phases 2–5 (§5–§8). Section numbers below are unchanged, so an
item still described in the present tense there and not listed as landed above
has not been built.

---

## 1. Start here: three attractions are invisible to bg1 right now

This was not in the original research. It came out of cross-checking bg1's
facility IDs against Disney's live data, and it is the highest-value finding in
this document.

`LLClient.experiences()` maps Disney's tipboard through
`this.resort.experience(exp.id)` inside a `try/catch` that does `return []` on
`InvalidId` (`api/ll.ts:266-283`). **An attraction whose facility ID is missing
from `wdw.ts` is silently dropped** — no tipboard row, no watch target, no
alert, no auto-book, and nothing on screen saying why.

Three attractions were re-themed or added in 2026 and Disney issued each a new
facility ID. bg1 still carries only the retired one:

| Attraction                                   | bg1 has    | Disney serves   | Status                           |
| -------------------------------------------- | ---------- | --------------- | -------------------------------- |
| Rock 'n' Roller Coaster Starring The Muppets | `80010182` | **`412573652`** | DHS **Tier 1**, #2 behind Slinky |
| Soarin' Across America                       | `20194`    | **`412577054`** | EPCOT's **#1 Tier 2** attraction |
| Disney Jr. Mickey Mouse Clubhouse Live!      | `19583373` | **`412521565`** | DHS Tier 2, ~8 shows daily       |

Verified 2026-09-05 against `api.themeparks.wiki/v1/entity/{park}/children`,
which mirrors Disney's facility IDs (all of bg1's other DHS IDs match exactly).

This also explains why several verification agents refuted the "rename
`80010182` and re-rank it" proposals: that ID is retired, so editing it changes
nothing at runtime. **The fix is to add the new IDs, not to edit the old ones.**

The Clubhouse show matters more than its size suggests: an easy Tier 2 with
eight daily showtimes and near-certain availability is the ideal _passkey_ for
the tap-in-to-untier strategy in §5.

**Action.** Add three entries to `src/api/data/wdw.ts` with the new IDs, correct
names, and lands (`sunsetBlvd`, `world nature`/Land pavilion, and the DHS
Animation Courtyard land respectively). Keep the retired IDs as `id: null`
under the file's existing `// Ignored` convention rather than deleting them —
that is what the file already does for retired IDs, and it suppresses the
`Missing experience` warning if Disney ever returns one. Then add a startup
check that logs any tipboard ID absent from `wdw.ts`, so the next re-theme
surfaces immediately instead of silently.

Related but separate: the `animation` land is named "Animation Courtyard,"
which closed in September 2025 and reopened 2026-05-26 as **The Walt Disney
Studios**. Five entries point at it. Cosmetic, but wrong today.

---

## 2. The rules, as precisely as they can be stated

**Booking windows.** Resort guests book from 7:00am ET seven days before
check-in, for the whole stay up to fourteen days. Everyone else books from
7:00am ET three days before each park day. No rule changes landed in 2026 — the
September 1 announcement was pricing only. `NUM_BOOKING_DAYS = 22` is a correct
upper bound on the longest published window, not a bug.

**Three at a time.** You hold at most three Multi Pass selections; as one is
used a slot frees.

**When the next slot opens — corrected.** My first draft of this plan said the
slot frees when the arrival window _ends_. That is wrong, and the correction
matters. Disney's own FAQ: _"After redeeming a Lightning Lane experience — or
after two hours have passed since making your selection — you can choose
another."_ So the gate is **120 minutes after you book, or on redemption,
whichever comes first** — it is not a function of the return time you hold.

The practical consequence is the opposite of what the "cascade" idea in my
draft assumed: booking at 9:05 with an 8pm return unlocks your next pick at
11:05, exactly as a 10am return would. Stacking late returns while the
120-minute clock runs is a _recommended_ strategy, and it is precisely what
bg1's `bookThenMove` already implements.

**bg1 does not need to model any of this.** `LLClient.nextBookTime` reads
`flexEligibilityWindows` straight from the tipboard — Disney's authoritative
answer, refreshed every poll. The remaining gap is display, not logic.

**Tier 1 unlock.** Lifted by an **actual tap-in**, not by a window elapsing.
Tracked per guest; a party is blocked until every member has tapped in
somewhere. Two-touchpoint attractions need the second tap. Once unlocked, any
number of Tier 1 selections may be held. This is the single highest-leverage
moment of the day.

**Park hopping.** No 2pm rule any more. With a Park Hopper, second-park booking
unlocks on the first redemption. The two API codes almost certainly split as
`TOO_EARLY_FOR_PARK_HOPPING` = ticket clock (carries `eligibleAfter`, so
schedulable) and `TOO_EARLY_FOR_NEXT_PARK` = redemption gate (no timestamp).

**Grace period.** A pass keeps scanning for **119 minutes past the end** of its
window (TouringPlans measured it; Disney's stated policy is 5 early / 15 late).
Enforcement is Cast Member discretion. **Letting a pass expire unredeemed
counts as having ridden it** — that attraction cannot be rebooked that day.
Modifying it away before expiry preserves rebookability.

**Multiple Experiences Pass.** Issued when a ride goes down during your window.
Exempt from the once-per-attraction rule, holdable alongside others, clears any
ineligibility timer, expires end of day.

**Drops.** Disney withholds inventory at the 7am sale and returns the remainder
in scheduled batches; cancellations return continuously. The `:47`/`:17`
schedule is confirmed by four independent sources and all nine of bg1's entries
corroborate. The real event is a ±2-minute band. Animal Kingdom drops are
**crowd-level gated** (CL 4+ or CL 7+). Beyond discrete drops, a dozen
attractions have sustained **refill windows** — Test Track every 1–9 minutes
from 8:00–9:06am, Slinky 8:15–9:26am, Peter Pan's 10:55am–2:28pm — and
pre-arrival "earlier time" releases cluster heavily on the **day before**.

**Competitors.** Wait Magic and Standby Skipper run server-side through Disney's
Friends & Family connector, poll every few minutes, and **make no new bookings
before the park day**. Standby Skipper books whatever is soonest with no
priority ordering; Wait Magic's only ordering control is a manual pause.
TouringPlans plans but cannot book. **Nobody sells a tool that plans the day and
books it.** bg1's 1.2s drop burst, priority ordering and Tier 1 hold are already
ahead of every paid competitor on the things that decide a drop.

---

## 3. Phase 0 — Data corrections (ship first)

All in `src/api/data/wdw.ts`. **The 13 `tier: 1` flags are all correct** —
verified independently twice, including against a per-attraction scrape. No
tier edits are needed.

Because `comparePriority` is `(a.priority || Infinity) - (b.priority ||
Infinity) || (b.avgWait || -1) - (a.avgWait || -1)`, and `MultiPassList`
truncates priority to a band gating the Lightning Pick badge at `band < 3`,
these numbers drive same-tick attempt order, swap-victim choice, the list sort,
and the badge.

### 3.1 The three missing IDs (§1) — highest priority

### 3.2 Priority corrections that survived verification

| Attraction                                | Now               | To                                 | Why                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Big Thunder Mountain Railroad** (MK T1) | 2.3, no `avgWait` | **1.0** + `avgWait` from real data | Hardest MK Tier 1 since reopening: gone 8:47am (May) and 9:07am (Jul) vs Tiana's ~11am. At 2.3 it ranks below Haunted Mansion and Pirates, `chooseSwapVictim` refuses to swap it in, and — worse — `shouldHoldTierSlot` actively **skips an available Big Thunder to hold the slot for Tiana's**. |
| Peter Pan's Flight                        | 1.1               | 1.2                                | Renumber so Big Thunder at 1.0 does not tie Jingle Cruise (1.0), which it would _lose_ on the `avgWait` tiebreak.                                                                                                                                                                                 |
| **Buzz Lightyear** (MK T2)                | 3.0, `avgWait` 22 | **1.2**, `avgWait` ~32             | #1 MK Tier 2 since its April 2026 reopening (DTB, mousehacking). Last touched 2025-11-12 while closed. Band 3 makes the badge unreachable, and `chooseSwapVictim` currently surrenders a held Buzz to book Haunted Mansion.                                                                       |
| Winnie the Pooh                           | 1.2               | 1.3 or leave                       | Published order is Buzz > Pooh > Haunted Mansion > Pirates. 1.3 ties Jungle Cruise — harmless (avgWait breaks it) but 1.4 is cleaner.                                                                                                                                                             |
| **Kilimanjaro Safaris** (AK)              | 3.1               | **3.0**                            | Three 2026 sources rank Safaris above Everest. They **collide at the 12:47 drop**, which is exactly the same-tick case `orderByPriority` decides — today bg1 attempts the worse ride first.                                                                                                       |
| **Expedition Everest** (AK)               | 3.0               | **3.1**                            | Swap in place. **Do not promote to 2.x** — that changes the truncated band, newly badges both and doubles their tolerated LL wait.                                                                                                                                                                |
| Little Mermaid (DHS)                      | 2.3, no `avgWait` | 4.0                                | Large-capacity show ranked above Alien Swirling Saucers (3.0, 28 min). Both sources rank Alien higher. Upstream already demoted it once; not far enough.                                                                                                                                          |
| Zootopia (AK)                             | none              | ~3.2                               | Real Multi Pass option sorting last. Rank below Everest, above Kali for a cold-weather trip.                                                                                                                                                                                                      |
| **New RnRC Muppets**                      | —                 | 1.1, `avgWait` ~59                 | Thrill Data: sells out 3:18pm / 59 min vs Runaway Railway 6:10pm / 47 min.                                                                                                                                                                                                                        |
| **New Soarin' Across America**            | —                 | 1.3                                | #1 Tier 2 in all of WDW. Must outrank Mission: SPACE (2.0 → 2.1).                                                                                                                                                                                                                                 |
| **New Disney Jr. Clubhouse**              | —                 | unranked                           | Sorts last; its value is as a passkey, not a rank.                                                                                                                                                                                                                                                |

### 3.3 Land corrections — a real bug

`Zootopia: Better Zoogether` (`412430582`) and `Moana (Character Landing)`
(`411921961`) both use `land: discovery` — **EPCOT's** World Discovery — instead
of `discIsland`. A scripted scan of every entry against its section comment
found exactly these two mismatches.

The tipboard corrects `park` on the way through, so listing is unaffected. But
`Itinerary.experienceData()` does not: a held Zootopia LL carries `park =
EPCOT`, which flows into `useUpdateParkFromPlans`, so on a fresh open whose only
LLMP plan is Zootopia, **autopilot polls EPCOT's tipboard on an Animal Kingdom
day.**

### 3.4 Drop-time corrections

- Add `14:47` to Expedition Everest alongside `15:47` (sources disagree; an
  extra burst is cheap, a missed CL10 December drop is not).
- Keep Test Track `17:47` despite being single-sourced, same reasoning.
- **Do not seed Big Thunder drop times** from pre-closure 2024 evidence. Every
  current source says "no predictable drop times" post-reopening, and
  `park.dropTimes` is the union of every experience's — fabricated entries make
  the poller burst at 1.2s when nothing drops.
- The nine existing entries are correct. Keep rejecting the viral "1:02 PM mega
  drop," which traces to a single tweet.

### 3.5 Tests worth adding

- Section-consistency scan: for each `// <Park> - <Type>` block, every entry's
  `land.park.name` matches. This is the scan that caught §3.3.
- A startup check logging tipboard IDs absent from `wdw.ts` (§1).
- **Do not** add "every `tier: 1` has a numeric priority and `avgWait`" — it
  fails on Big Thunder's missing `avgWait`, would force a fabricated number,
  and forbids upstream's deliberate removal of Space Mountain's priority.

---

## 4. Phase 1 — Correctness fixes, in dependency order

**P1.1 · Return-time window UI.** `WatchTarget.after`/`before` are declared,
persisted, revived, and gate **four** paths — `matchWatchList` itself (so
alerts), `offerIsAcceptable`, `shouldModify` and its post-offer re-check, and
`attemptAutoSwap`. But the app's only `addTarget` call passes `{ experienceId }`
and the context exposes no setter, so the only way to set one is hand-editing
localStorage. In practice `inWindow` always returns true and the
`offer-outside-window` skip reason is unreachable. README:58 tells the user to
do something the UI cannot do.

Add `setTargetWindow` to the context, implement beside `toggleFlag`, render two
`<input type="time">` per watched row. `parseBound` is module-private and needs
exporting. Apply the window to _actions_ but keep alerts wider, or an
out-of-window offer goes silently unmentioned.

_Correction to an earlier claim:_ `bookThenMove` is **not** a no-op without
this. It implies both booking and moving, so with empty windows it equals
autoBook + autoModify. What is inert is its distinguishing relax-then-retighten
mechanism. _Effort: small. Unblocks P4.1, P5.2._

**P1.2 · Slot accounting.** `heldMPToday` filters only `isLLMP && same park
day`. `itinerary.ts` drops guests with `redemptionsRemaining === 0` but keeps
the booking, so a fully-redeemed LL survives with `guests: []` and still counts
toward `MAX_HELD_MP`. After your first tap-in bg1 believes the party is full and
**swaps away a reservation it did not need to** instead of booking into the free
slot — inverting the comment at the top of `autoswap.ts`. `LLTracker.update`
already uses `cancellable` as its slot signal, so the two paths disagree about
what "held" means.

Count only bookings that occupy a slot: `isLLMP` + same day + `cancellable` +
`guests.length > 0` + not an MEP. _Verified by direct code read. Effort: small._

**P1.3 · Overlap check on the autopilot path.** Every offer carries `itinerary`
with an `Overlap`; `OverlappingPlans.tsx` uses it to warn before a manual
confirm. The autopilot never looks. For December this is how a slot gets spent
on top of a Candlelight Processional dining package.

Three corrections from verification: (a) build the check from **plans**, not
the offer, so it is a pre-offer guard that works in dry run and saves a doomed
offerset round trip mid-drop; (b) **union** the offer's itinerary with plans
rather than intersecting — a booking made minutes ago may be in one and not the
other; (c) a hard skip is stricter than the warning it models, so
`allowOverlap` is required, not optional. The strongest case is `bookThenMove`,
which strips the window entirely, and the fact that `after`/`before` is one
contiguous interval — two dining reservations in a day cannot be excluded by
hand at all. _Effort: small._

**P1.4 · Expiry counts as ridden.** `resolveBook` releases a booking lock after
two consecutive absences from plans, treating absence as "cancelled, therefore
rebookable." An **expired** pass also leaves plans, and Disney will refuse to
rebook it. Gate the release on `LLTracker`'s `experienced` flag being false too.
_Effort: small._

**P1.5 · Use every `flexEligibilityWindows` entry.** `ll.ts` sorts and keeps
`[0]`. The field is plural because a party can have several slots freeing at
different times; each discarded entry is a moment Disney has told you inventory
opens. Change to `nextBookTimes: ParkTime[]` (keep a `nextBookTime` getter) and
pass the array into `cadence()` — the target loop already handles a list. The
array length is also a live count of imminent free slots. _Effort: small._

**P1.6 · Two kinds of ineligibility in the prewarm cache.** `staleAfter:
earliestEligibleAfter(guests)` is right only for `TOO_EARLY`-style reasons. A
guest blocked by `REDEMPTION_NEEDED` / `TIER_LIMIT_REACHED` /
`TOO_EARLY_FOR_NEXT_PARK` has no expiry and today gets `staleAfter: undefined`,
which either pins a stale entry or forces refetches. Invalidate those on an
observed tap-in. _Effort: small._

**P1.7 · Multiple Experiences Pass handling.** bg1 parses the shape but treats
an MEP as an ordinary held pass. Exclude from `heldMPToday` and from
`chooseSwapVictim` (giving up an anytime pass for a timed one is a downgrade);
when one appears, clear the prewarm cache and force a burst poll — the
ineligibility timer just vanished. _Effort: small._

**P1.8 · A budget that survives a day.** The three-action cap is shared across
all three action kinds and hard-coded (`new AutoBookLedger()` with no argument;
no settings field). It does **not** cap the day at three — re-arming refills it
— but the refill is manual, undiscoverable, and bundled with a state wipe that
also clears the guest cache and the drop-detection baseline, so the first poll
after every re-arm provably cannot detect a drop.

Worse, discoverability is nil: the `break` on `remaining <= 0` sits _ahead_ of
every call site that returns the `session-cap` skip reason, so that label is
dead code and "Why nothing was booked" never mentions the budget. And
`bookingsRemaining` renders only under `anyAutoBook`, so a user running only
book-then-move or swap sees no count at all.

Make it a per-day allowance in settings, add a ledger-only refill action, and
add a `budget-exhausted` state to `StatusRow`. _Effort: small._

---

## 5. Phase 2 — Cadence and drop intelligence

**P2.1 · Widen the burst lead.** `BURST_LEAD_S = 30` starts bursting at :46:30
against a drop landing anywhere from :45 to :49 — bg1 is in 6-second approach
mode for the first half of the band. Raise to ~120 for drop targets; keep
`nextBookTime` targets tight since those are exact. `CLUSTER_TOLERANCE_MIN = 2`
in `observe.ts` already encodes the right band, so the constants are
inconsistent today. _Effort: small._

**P2.2 · Refill windows as a target kind.** `cadence()` models only
instantaneous targets, so bg1 idles at 45s from park open until its first
hardcoded burst — missing the morning re-release window entirely. Add a target
kind with a start and end returning `approach` (6s) across the span. Seed with
park-open+90min for Test Track, Slinky, Tower, Toy Story Mania and Na'vi, and
midday windows for Peter Pan's, Jungle/Jingle Cruise and Runaway Railway — four
of bg1's highest-ranked targets, all currently treated as never dropping. Do
not paste these as `dropTimes`; a 3.5-hour window is not a burst target.
_Effort: medium. Highest-value structural gap found._

**P2.3 · Demote drops that stop firing.** `mergeDropTimes` only ever appends;
there is no negative evidence. Thrill Data publishes only times that fired on
25%+ of the last 30 days, and currently shows _zero_ reliable pop-ups for five
of bg1's nine attractions. Add demotion using the `ScheduledDropCheck` plumbing
that already exists in `observe.ts`. This is what makes the crowd-level and
party-night problems self-correcting without a crowd feed. _Effort: medium._

**P2.4 · Day-before cadence.** README says drops are "a day-of phenomenon" so
future dates poll at idle. Thrill Data shows Slinky with 34 distinct
earlier-return release times at 1 day out, Soarin' with 57. Use approach cadence
during daytime when the watched date is tomorrow. _Effort: small._

**P2.5 · Party nights.** Mickey's Very Merry Christmas Party: Dec 1, 3, 4, 6, 8,
10, 11, 13, 15, 17, 18, 20, 22 (MK closes to day guests at 6pm). Jollywood
Nights: Dec 5, 7, 12, 14, 19, 21, 23. Hardcode both lists and use them to
truncate the park's drop list and the `TimeBanner` label, which will otherwise
advertise 5:47/7:47/9:47pm drops that cannot occur.

The real defect here is in `hasUpcomingDrop`, a bare `+time >= +now` over the
static list: at 4pm on a party day Tiana's still "has an upcoming drop" at
17:47/19:47/21:47, and since Tiana's is the only MK Tier 1 with drop times, the
hold it triggers **never releases for the rest of the day**. _Note: the related
proposal to reject post-close offers was refuted — Disney does not sell LL
return times past close, so that guard is a no-op. The `hasUpcomingDrop` half
stands and is unverified; confirm in park._ _Effort: small._

**P2.6 · Crowd-gated drops.** All five AK drop times carry a CL 4+/7+
qualifier. For December this is good news — AK will be CL 7–10 and they all
fire. Carry the qualifier in the data and gate on a "busy day" toggle so an
off-season user is not burst-polling five dead times. _Effort: small._

**P2.7 · Pop-up vs earlier-time.** Thrill Data separates "a sold-out LL coming
back" from "one that jumps ≥1 hour earlier"; they have different schedules per
attraction, and Flight of Passage and Kali show _only_ earlier-time events.
bg1's `dropTimes` is an undifferentiated union. Tag each entry so `automodify`
can burst on earlier-time targets for attractions it already holds.
_Effort: medium._

**P2.8 · Ride-down detection.** A ride going down and reopening produces a burst
of near-term returns — a drop-class event no schedule predicts. The tipboard
carries standby status beside `flex.nextAvailableTime` and `observe.ts` already
snapshots per poll. Feed the **alert** path only. _Effort: small._

**P2.9 · Faster learning within a trip.** `LEARNED_MIN_DAYS = 2` needs two
distinct park days; a 4–6 day trip barely gets there. Allow the second
observation from the same day at a different hour when the minute-of-hour
matches — that is the actual recurrence pattern. _Effort: small._

---

## 6. Phase 3 — Strategy

**P3.1 · Passkey role and tap-in detector.** Every guide leads with the same
move: book an easy early Tier 2, tap in at rope drop, and the rest of the day is
untiered and cross-park. bg1 has no mechanism for it.

Add a `passkey` role that, before any redemption, books the earliest-returning
eligible non-Tier-1 regardless of rank. Add a detector that, the moment the
party's tap is observed, drops the Tier 1 hold, widens the watchlist to Tier 1
and other parks, clears the prewarm cache and forces one burst poll. Banner:
_"Tap in to Haunted Mansion before 10:15 to lift the Tier 1 limit."_

**Do not derive this from `plans[].guests[].redemptions`** — the itinerary
filters out guests with `redemptionsRemaining === 0` _before_ assigning that
field, so it is structurally incapable of ever being 0. The authoritative
signal is `TIER_LIMIT_REACHED` disappearing from the eligibility response bg1
already fetches via `GuestCache`. Because the gate is per-guest, release only
when every party member has tapped — reuse the whole-party guard's
least-advanced-member logic. _Effort: medium._

**P3.2 · Surface the timing (not a cascade model).** My draft proposed a
`cascade.ts` scoring offers by how much they delay the next booking. **That was
refuted and should not be built:** the gate is 120 minutes from booking, not a
function of the return time you hold, so a late first booking delays nothing.
Two further reasons it was wrong — bg1 already sends `targetedTime:
nextAvailableTime` on every offer and calls `changeOfferTime()` when the result
comes back >10 minutes later, so "nothing prefers an earlier return time" is
false; and `ll.times()` is switched off at WDW (`rules.timeSelect = false`).

What survives is display: show `nextBookTime` as _"you can book your next
Lightning Lane at 11:52 AM"_ on Home and Autopilot. It is authoritative, bg1
already has it, and it turns the whole start-vs-end debate into a non-question.
_Effort: small._

**P3.3 · Expiry rescue.** Letting a pass expire unredeemed counts as riding it.
When a held LL's window plus grace is about to lapse unredeemed, modify it to a
low-demand always-available filler so the good attraction stays rebookable.
Reuses `automodify.ts` wholesale — only the trigger and target differ. Nobody
else offers this. _Effort: medium._

**P3.4 · Park-hop codes handled distinctly.** `TOO_EARLY_FOR_PARK_HOPPING`
carries `eligibleAfter` → schedule a poll target. `TOO_EARLY_FOR_NEXT_PARK` has
no timer → suppress cross-park targets until the tap-in detector fires, and
label it _"tap in at Magic Kingdom first."_ Lets bg1 pre-stage a second-park
watchlist and arm it the instant the tap is seen. _Effort: small–medium._

**P3.5 · Live tier membership.** `LLClientWDW.experiences()` has `return exps;`
on its second line, making the block below unreachable — a block that already
calls `/ea-vas/planning/api/v1/experiences/availability/bundles/experiences` and
destructures a `tiers[]` response. Disney publishes current tier grouping per
park per date. The static flags are correct _today_, but tiers moved twice in
the last twelve months (Big Thunder returned May 2026; Rock 'n' Roller Coaster
left Tier 1 in March and returned in May under a new ID). December is three
months out. Delete the dead return, read tier membership live, keep the static
flag as a fallback that warns on divergence. _Effort: medium._

**P3.6 · Reclaimability for swap victims.** `chooseSwapVictim` assumes Tier 2 is
always cheap to give up. Thrill Data shows Kali selectable for 10h 28m of the
day and Everest 10h 43m — genuinely reclaimable — while some Tier 2s sell out by
9am. A per-attraction "typically gone by HH:MM" lets autoswap surrender the
genuinely cheapest slot. _Effort: small._

---

## 7. Phase 4 — Planning and visibility

**P4.1 · A plan for the day.** `WatchTarget` has no date, park, rank or role,
and one un-keyed array (stored with `kvdb.get`/`set`, not the daily helpers)
applies to every park and every date and survives indefinitely. The strongest
consequence is not the missing screen: the static `priority` is the sole input
to both `orderByPriority` **and** `shouldHoldTierSlot`, so a guest whose
preferred Tier 1 ranks lower in `wdw.ts` has the tool actively pass on it to
protect one they want less. A per-user `rank` feeding both is a
booking-correctness fix, not just UX.

Two secondary hazards: an armed entry for another park is invisible in the
Autopilot screen while you are elsewhere and silently re-arms on return; and
the only ordering lever, `paused`, requires manual intervention during a drop —
exactly when a human cannot intervene.

Introduce `DayPlan { date, parkId, entries: { experienceId, rank, after?,
before?, role }[] }` stored per date. Build the Plan screen from `wdw.ts`
directly rather than a live tipboard call, since watch entries can currently
only be added from a loaded tipboard — that is the real blocker to planning
offline, not the date picker. _Effort: large._

**P4.2 · Auto-book on future dates.** Neither paid competitor makes new bookings
before the park day. bg1 already supports future dates for auto-_move_, and the
offer/book path is date-agnostic. The scenario it wins: you buy Multi Pass at
the 7-day window with one selection because your headliners were gone, and bg1
fills slots 2 and 3 overnight from cancellations. **This is the feature that
would beat both paid tools outright.** _Effort: small–medium._

**P4.3 · Booking-window guidance.** Thrill Data's 7 AM Drop data shows booking
earlier in your window buys dramatically earlier return times (Na'vi: 8:48am at
8 days out, 10:29am at 7, 1:58pm at 1 day). Surface a compact table on
`BookingDateSelect` answering the 7:00am question: which three to grab first,
which are safe to leave. **Use bg1's own observations or attributed public
data — do not scrape Thrill Data's paid tables into the repo.** _Effort: medium._

**P4.4 · Plain-English reasons.** bg1 already computes every reason it acted or
skipped. Extend log entries to _"booked Slinky Dog Dash for 11:05 AM — top-ranked
armed attraction, whole party eligible, inside your 10:00–13:00 window,"_ and add
the counterfactual on holds. UX over data that already exists. _Effort: small._

**P4.5 · Make the timing legible.** A "next drop in 4:12" countdown in the
header and an audible pre-drop chime at T−60s (the AudioContext is already
unlocked). bg1's advantage is being the one looking in the first two seconds;
this converts its foregrounding constraint into a ritual. _Effort: small._

**P4.6 · Show the grace expiry.** A muted _"usable until 7:49 PM"_ beside the
one-hour window. _Effort: small._

**P4.7 · Holiday overlays.** Jingle Cruise (`412010035`) and Jungle Cruise
(`80010153`) are two IDs for one ride; same for Glimmering Greenhouses and
Living with the Land. Both overlay IDs _are_ in `wdw.ts` — confirmed — and both
were absent from Disney's live September data, exactly as expected for a
seasonal overlay. A watch list built now matches nothing once the swap happens,
and the failure is unexplained rather than silent: the header reads "Watching
(5)" while the list shows fewer rows.

The cheap half is the durable fix and should be built first: render watched
targets absent from today's tipboard as a distinct **"not on today's list"**
group. That catches any ID drift, including drift nobody thought to alias.
An alias table is a best-effort convenience — and note commit `f1f022a`
reassigned three holiday IDs last November, so the current overlay IDs need
re-verifying against a live December tipboard. _Effort: small._

**P4.8 · Per-target guest subset.** Both competitors treat "which guests" as a
per-search field; bg1 has one global whole-party flag. _Effort: medium._

**P4.9 · A picture of the day.** Held reservations, windows, grace expiries and
the next booking window on one screen. _Effort: medium._

---

## 8. Phase 5 — Live data (optional)

**Live standby in the ranking.** Replace the hardcoded `avgWait` tiebreak with
today's standby wait from themeparks.wiki. On a December CL10 day the gap
between a 40-minute average and a 110-minute actual is the whole decision. Note
`livedata.ts` currently calls `bg1.joelface.com`, not themeparks.wiki directly,
so this is a new dependency rather than a second call to an existing one. None
of the free feeds carry Multi Pass availability — Disney's tipboard stays the
only source for what bg1 books. _Effort: medium._

---

## 9. Refuted — do not rebuild these

Nineteen findings were adversarially refuted. The most consequential:

1. **A cascade scoring model.** The gate is 120 minutes from booking, not the
   return time you hold. bg1 also already targets the earliest time and
   self-corrects via `changeOfferTime`. See P3.2.
2. **Rejecting post-close offers.** Disney does not sell LL return times past
   close, and LL is unavailable during party hours. The guard is a no-op.
3. **Deleting DINOSAUR.** The tipboard never returns it, so its priority
   influences nothing — the static table is a lookup keyed by API results, never
   a source list. Optional hygiene at most, and the repo convention is
   `id: null`, not deletion.
4. **Removing TRON's priority.** Single Pass rides have no `flex` block and are
   filtered out of the list, the watch picker, `matchWatchList` and autoswap.
   The field is inert on every path.
5. **Giving Space Mountain and Millennium Falcon priorities.** Upstream
   _deliberately removed_ Space Mountain's in commit `1dac5d7`. Worse, Millennium
   Falcon at 2.1 would make `shouldHoldTierSlot` decline an offered Rock 'n'
   Roller Coaster to hold the slot for a weaker attraction.
6. **Swapping Frozen Ever After and Remy.** Three of four post-refurbishment
   sources put Remy at or ahead of Frozen, and bg1's own `avgWait` agrees. The
   December argument does not discriminate — both are in World Showcase.
7. **Swapping Tower of Terror and Toy Story Mania.** Sources call it a tie
   ("mostly academic"); bg1's own `avgWait` favours Toy Story Mania. Only the
   Little Mermaid demotion survives.
8. **Re-ranking Glimmering Greenhouses to 3.0.** It would tie Soarin' and win
   the `avgWait` tiebreak, putting an always-available greenhouse boat ride
   ahead of the scarcest Tier 2.
9. **Demoting Jingle Cruise to 2.2.** Self-contradictory (2.2 is _worse_ than
   base Jungle Cruise at 1.3), and it would subordinate Jingle Cruise to a
   Tiana's hold all day in the month Tiana's demand is weakest.
10. **Feeding learned drop times into the Tier 1 hold.** `detectDropEvents`
    fires on cancellation flicker; a false positive that costs a wasted request
    in the cadence would cost a forfeited Tier 1 in the hold.
11. **A "every tier:1 has priority and avgWait" test.** Fails on Big Thunder,
    forces a fabricated number, and fights upstream data merges.

---

## 10. Open questions to settle in park

Instrument these; do not model them from folklore.

1. **Does an expired, never-tapped first LL free its slot?** One well-cited
   DISboards report says no until you tap into something else. Log the
   ineligible reason at the moment a window lapses. Until settled, treat an
   expected free slot as a hypothesis — try one offer, back off on
   `REDEMPTION_NEEDED` rather than burning the budget.
2. **Is tier release per-guest, and does it need a Tier 1 redemption?**
   Consensus says per-guest and any redemption. Log `TIER_LIMIT_REACHED` before
   and after the first tap, ideally with a split-party tap-in.
3. **Big Thunder's post-reopening drop schedule.** Unmeasured. Let the learner
   run at approach cadence.
4. **Do the December overlay IDs still resolve?** Re-verify `412010035` and
   `412010036` against a live tipboard once the overlays start.

---

## 11. December specifics

- **Party nights** truncate MK on 13 dates and HS on 7. On those MK dates
  daytime crowds are low and the 6pm close kills evening drops; on non-party
  dates crowds are displaced and drops run late.
- **Live overlays:** Jingle Cruise (whole trip), Glimmering Greenhouses
  (Nov 27 – Dec 30).
- **Animal Kingdom** will be CL 7–10, so all five gated drop times fire. Kali
  River Rapids closes on cold days and took an accelerated refurbishment in late
  2025 — check whether it operates at all.
- **Book at the earliest moment your window opens.** The 7 AM data is
  unambiguous: a week out buys morning return times that are gone by three days
  out. On-site, that 7:00am moment is the most important minute of the trip.

---

## 12. Suggested schedule

| When             | What                                              | Gate                                                             |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Week of Sept 8   | §1 missing IDs, §3 data, section-consistency test | `test:ci` green; the three attractions appear on their tipboards |
| Sept 15 – 26     | Phase 1 (P1.1 window UI first)                    | Dry run shows `offer-outside-window` and overlap skips firing    |
| Sept 29 – Oct 17 | Phase 2 cadence                                   | Learned-drop screen shows demotions; burst covers :45–:49        |
| Oct 20 – Nov 14  | Phase 3 (P3.1 passkey, P3.5 live tiers)           | A simulated day books a passkey first and explains why           |
| Nov 17 – Dec 5   | Phase 4 planner; P4.2 future-date booking         | A December plan built in November drives a dry run end to end    |
| Dec 6 – trip     | Freeze. Full-day dry runs. Instrument §10.        | No code changes in the final two weeks                           |

Each phase ships independently. If the schedule slips, Phase 4 is what to cut.
**§1 must not slip** — three attractions, two of them headliners, are
unbookable until it lands.
