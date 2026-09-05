import { use } from 'react';

import { Experience } from '@/api/ll';
import { DEFAULT_MAX_PER_SESSION } from '@/autopilot/autobook';
import { LEARNED_MIN_DAYS } from '@/autopilot/learned';
import { PollerStatus } from '@/autopilot/usePoller';
import Button from '@/components/Button';
import Screen from '@/components/Screen';
import { Time } from '@/components/Time';
import AutopilotContext from '@/contexts/AutopilotContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import StarIcon from '@/icons/StarIcon';

export const AUTOPILOT = 'Autopilot';

/** Plain-language labels for skip reasons; unknown ones show as-is. */
const SKIP_TEXT: Record<string, string> = {
  'partial-party': 'not everyone in the party was eligible',
  'tier-hold': 'held the Tier 1 slot for a better attraction',
  'offer-outside-window': 'the offered time was outside the window',
  'not-an-improvement': 'the time was not enough better to move for',
  'offer-not-an-improvement': 'the offer came back not enough better',
  'no-eligible-guests': 'nobody was eligible',
  'not-full': 'a slot was free, so it booked instead of swapping',
  'no-worse-reservation': 'nothing held was worth giving up',
  'already-attempted': 'a booking for it was already held or in flight',
  'session-cap': 'the session limit was reached',
  'outside-window': 'the advertised time was outside the window',
  'overlaps-plans': 'it clashed with something already booked',
  'not-modifiable': 'Disney marked the reservation unmodifiable',
};

const MODE_TEXT: Record<PollerStatus['mode'], string> = {
  off: 'Off',
  idle: 'Watching',
  approach: 'Drop approaching',
  burst: 'Checking rapidly',
  stopped: 'Stopped after repeated errors',
};

function StatusRow({ status }: { status: PollerStatus }) {
  return (
    <div className="mt-3 text-sm">
      <div>
        <span className="font-semibold">Status:</span> {MODE_TEXT[status.mode]}
        {status.polls > 0 && (
          <span className="text-gray-500"> ({status.polls} checks)</span>
        )}
      </div>
      {status.target && (
        <div>
          <span className="font-semibold">Next drop:</span>{' '}
          <Time time={status.target} />
          {typeof status.secondsToTarget === 'number' &&
            status.secondsToTarget > 0 && (
              <span className="text-gray-500">
                {' '}
                (in {Math.round(status.secondsToTarget / 60)} min)
              </span>
            )}
        </div>
      )}
      {status.mode === 'stopped' && (
        <p className="mt-2 font-semibold text-red-700">
          Stopped after {status.consecutiveFailures} failed checks
          {status.lastError ? `: ${status.lastError}` : ''}. Turn it back on to
          retry.
        </p>
      )}
    </div>
  );
}

/**
 * Turning autopilot on and choosing what it watches.
 *
 * The on/off control lives here rather than in the tab header on purpose:
 * enabling is a deliberate setup step -- pick rides, grant notifications --
 * and a mis-tapped header toggle that silently started or stopped polling
 * would be worse than one extra tap.
 */
export default function Autopilot() {
  const {
    enabled,
    setEnabled,
    status,
    targets,
    isWatched,
    addTarget,
    removeTarget,
    toggleAutoBook,
    toggleAutoModify,
    toggleBookThenMove,
    togglePaused,
    toggleAutoSwap,
    notifications,
    lastHit,
    bookingLog,
    bookingsRemaining,
    requireWholeParty,
    setRequireWholeParty,
    dryRun,
    setDryRun,
    avoidOverlaps,
    setAvoidOverlaps,
    setTargetWindow,
    skipCounts,
    dropSummaries,
  } = use(AutopilotContext);
  const { experiences, unknownExperienceIds } = use(ExperiencesContext);
  const { park } = use(ParkContext);

  const targetFor = (experienceId: string) =>
    targets.find(t => t.experienceId === experienceId);
  const anyAutoBook = targets.some(t => t.autoBook);
  const anyAutoModify = targets.some(t => t.autoModify);
  const anyBookThenMove = targets.some(t => t.bookThenMove);
  const pausedCount = targets.filter(t => t.paused).length;
  const anyAutoSwap = targets.some(t => t.autoSwap);

  const nameOf = (experienceId: string) =>
    experiences.find(e => e.id === experienceId)?.name ?? experienceId;
  // Only attractions with something to say: an observation, or a scheduled
  // time the poller has actually watched for at least once.
  const learned = dropSummaries.filter(
    d => d.observed.length > 0 || d.scheduled.some(c => c.coveredDays > 0)
  );
  const observationCount = dropSummaries.reduce(
    (n, d) => n + d.observed.reduce((m, o) => m + o.count, 0),
    0
  );

  // Only Multi Pass attractions can be watched: matching reads the `flex`
  // field, and bg1 has no Single Pass booking flow, so offering Single Pass
  // headliners here would promise something it cannot deliver.
  const watchable = experiences
    .filter((exp): exp is Experience => !!exp.flex)
    .sort((a, b) => a.name.localeCompare(b.name));

  const watched = watchable.filter(exp => isWatched(exp.id));
  const unwatched = watchable.filter(exp => !isWatched(exp.id));

  return (
    <Screen title={AUTOPILOT}>
      <p>
        Autopilot checks {park.name} for the attractions you pick and alerts you
        when one becomes available. It checks slowly most of the time and speeds
        up around known drop times.
      </p>

      <div className="mt-4">
        <Button
          type="full"
          onClick={() => setEnabled(!enabled)}
          color={enabled ? 'bg-red-700 text-white' : undefined}
        >
          {enabled ? 'Turn off autopilot' : 'Turn on autopilot'}
        </Button>
        <StatusRow status={status} />
      </div>

      {dryRun && (
        <p className="mt-3 rounded-sm bg-yellow-100 p-2 text-sm font-semibold text-yellow-900">
          Dry run is on. Autopilot will watch, alert, and run every check, and
          the activity log will show what it <em>would</em> have booked, moved,
          or swapped &mdash; but nothing will actually be booked. Turn it off
          when you are ready for it to act.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="small"
          title={
            dryRun ? 'Let autopilot act for real' : 'Rehearse without booking'
          }
          color={dryRun ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-black'}
          onClick={() => setDryRun(!dryRun)}
        >
          {dryRun ? 'Dry run: on' : 'Dry run: off'}
        </Button>
        <Button
          type="small"
          title={
            requireWholeParty
              ? 'Allow booking for part of the party'
              : 'Only act when the whole party is eligible'
          }
          color={
            requireWholeParty
              ? 'bg-red-700 text-white'
              : 'bg-gray-200 text-black'
          }
          onClick={() => setRequireWholeParty(!requireWholeParty)}
        >
          {requireWholeParty ? 'Whole party only: on' : 'Whole party only: off'}
        </Button>
        <Button
          type="small"
          title={
            avoidOverlaps
              ? 'Allow times that clash with existing plans'
              : 'Refuse times that clash with existing plans'
          }
          color={
            avoidOverlaps ? 'bg-red-700 text-white' : 'bg-gray-200 text-black'
          }
          onClick={() => setAvoidOverlaps(!avoidOverlaps)}
        >
          {avoidOverlaps ? 'Avoid clashes: on' : 'Avoid clashes: off'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        {requireWholeParty
          ? 'Autopilot will not book, move, or swap unless everyone in your party is eligible. A Lightning Lane for part of the group is often worse than none.'
          : 'Autopilot books for whoever is eligible, the way booking by hand does. Turn this on to guarantee the group is never split.'}
      </p>

      <p className="mt-1 text-xs text-gray-600">
        {avoidOverlaps
          ? 'Autopilot will not take a return time that lands on top of a reservation you already hold &mdash; dining included. Booking by hand only warns about this; here there is nobody to warn.'
          : 'Autopilot will take any time that fits, even one overlapping an existing reservation.'}
      </p>

      {unknownExperienceIds && unknownExperienceIds.length > 0 && (
        <p className="mt-3 rounded-sm bg-red-100 p-2 text-sm font-semibold text-red-900">
          Disney is listing {unknownExperienceIds.length} attraction
          {unknownExperienceIds.length === 1 ? '' : 's'} this build does not
          recognise ({unknownExperienceIds.join(', ')}). They cannot be watched,
          alerted on, or booked. This is what a re-themed ride looks like:
          Disney issues a new facility ID and the old one stops appearing.
        </p>
      )}

      {notifications === 'denied' && (
        <p className="mt-3 text-sm font-semibold text-red-700">
          Notifications are blocked, so alerts will only chime. Enable them for
          this site in your browser settings.
        </p>
      )}
      {notifications === 'unsupported' && (
        <p className="mt-3 text-sm text-gray-600">
          This browser has no notification support, so alerts will chime and
          vibrate only. On iOS, notifications require adding this page to your
          Home Screen.
        </p>
      )}

      {lastHit && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Last found:</span> {lastHit.name} at{' '}
          <Time time={lastHit.returnTime} />
        </p>
      )}

      <h3>Watching ({targets.length})</h3>
      {watched.length > 0 && (
        <p className="text-xs text-gray-600">
          A return-time window limits what Autopilot will <em>take</em>, not
          what it tells you about: an attraction outside its window still
          alerts, so a window can never hide the fact that something came back.
        </p>
      )}
      {watched.length === 0 ? (
        <p className="text-sm text-gray-600">
          Nothing selected yet. Pick attractions below.
        </p>
      ) : (
        <ul>
          {watched.map(exp => {
            const target = targetFor(exp.id);
            const autoBook = !!target?.autoBook;
            const autoModify = !!target?.autoModify;
            const bookThenMove = !!target?.bookThenMove;
            const paused = !!target?.paused;
            const autoSwap = !!target?.autoSwap;
            return (
              <li key={exp.id} className="py-1.5">
                <div className="flex items-center gap-2">
                  <Button
                    title={`Stop watching ${exp.name}`}
                    onClick={() => removeTarget(exp.id)}
                  >
                    <StarIcon />
                  </Button>
                  <span className="flex-1 font-semibold">{exp.name}</span>
                </div>
                {/* Toggles on their own row: five controls plus a long
                    attraction name do not fit one phone-width line. */}
                <div className="mt-1 ml-11 flex flex-wrap gap-2">
                  <Button
                    type="small"
                    title={
                      autoBook
                        ? `Stop auto-booking ${exp.name}`
                        : `Auto-book ${exp.name}`
                    }
                    color={
                      autoBook
                        ? 'bg-red-700 text-white'
                        : 'bg-gray-200 text-black'
                    }
                    onClick={() => toggleAutoBook(exp.id)}
                  >
                    {autoBook ? 'Auto-book on' : 'Auto-book off'}
                  </Button>
                  <Button
                    type="small"
                    title={
                      autoModify
                        ? `Stop auto-moving ${exp.name}`
                        : `Auto-move ${exp.name}`
                    }
                    color={
                      autoModify
                        ? 'bg-red-700 text-white'
                        : 'bg-gray-200 text-black'
                    }
                    onClick={() => toggleAutoModify(exp.id)}
                  >
                    {autoModify ? 'Auto-move on' : 'Auto-move off'}
                  </Button>
                  <Button
                    type="small"
                    title={
                      bookThenMove
                        ? `Stop book-then-move for ${exp.name}`
                        : `Book then move ${exp.name}`
                    }
                    color={
                      bookThenMove
                        ? 'bg-red-700 text-white'
                        : 'bg-gray-200 text-black'
                    }
                    onClick={() => toggleBookThenMove(exp.id)}
                  >
                    {bookThenMove ? 'Book then move on' : 'Book then move off'}
                  </Button>
                  <Button
                    type="small"
                    title={paused ? `Resume ${exp.name}` : `Pause ${exp.name}`}
                    color={
                      paused
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-200 text-black'
                    }
                    onClick={() => togglePaused(exp.id)}
                  >
                    {paused ? 'Paused' : 'Pause'}
                  </Button>
                  <Button
                    type="small"
                    title={
                      autoSwap
                        ? `Stop swapping in ${exp.name}`
                        : `Swap in ${exp.name}`
                    }
                    color={
                      autoSwap
                        ? 'bg-red-700 text-white'
                        : 'bg-gray-200 text-black'
                    }
                    onClick={() => toggleAutoSwap(exp.id)}
                  >
                    {autoSwap ? 'Swap in on' : 'Swap in off'}
                  </Button>
                </div>
                {/* The window governs booking, moving and swapping. Leaving a
                    bound empty means unbounded on that side. */}
                <div className="mt-1 ml-11 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-600">Return between</span>
                  <input
                    type="time"
                    aria-label={`Earliest return time for ${exp.name}`}
                    className="rounded-sm border border-gray-300 px-1 py-0.5"
                    value={
                      target?.after ? String(target.after).slice(0, 5) : ''
                    }
                    onChange={e =>
                      setTargetWindow(exp.id, 'after', e.target.value)
                    }
                  />
                  <span className="text-gray-600">and</span>
                  <input
                    type="time"
                    aria-label={`Latest return time for ${exp.name}`}
                    className="rounded-sm border border-gray-300 px-1 py-0.5"
                    value={
                      target?.before ? String(target.before).slice(0, 5) : ''
                    }
                    onChange={e =>
                      setTargetWindow(exp.id, 'before', e.target.value)
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {anyAutoBook && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Automatic booking is on.</span>{' '}
          Autopilot will book the attractions marked above without asking, but
          only when the offered return time falls inside that attraction&rsquo;s
          window. It will book at most {DEFAULT_MAX_PER_SESSION} per session (
          {bookingsRemaining} left), will not book an attraction it is already
          holding or still waiting on an answer for, and forgets everything when
          the page reloads.
        </p>
      )}

      {anyAutoModify && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Auto-move is on.</span> For
          attractions marked above that you already hold a reservation for,
          Autopilot will move it earlier when a better time appears &mdash; but
          only if the gain is at least 30 minutes, and never to a later time
          than you already have.
        </p>
      )}

      {anyBookThenMove && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Book then move is on.</span> For
          attractions marked above, Autopilot books the first time offered
          &mdash; even outside your window &mdash; so you hold something, then
          works to move it into the window. A wide search finds availability far
          more often than a narrow one.
        </p>
      )}

      {pausedCount > 0 && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">{pausedCount} paused.</span> Paused
          attractions are still watched and still alert, but nothing is booked
          or moved for them &mdash; and they will not make Autopilot hold back
          on others. Use this to make sure a higher-priority attraction gets
          booked first.
        </p>
      )}

      {anyAutoSwap && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Swap in is on.</span> When all three
          Multi Pass slots are taken and an attraction marked above appears,
          Autopilot gives up your <em>lowest-priority</em> reservation for it
          &mdash; preferring to let go of a non-Tier-1. The swap is a single
          request, so the old reservation is only released if the new one is
          secured. With a slot free it simply books instead.
        </p>
      )}

      {learned.length > 0 && (
        <>
          <h3>Learned drop times</h3>
          <p className="text-xs text-gray-600">
            Autopilot records when availability actually appears while it runs,
            and compares that with the built-in drop schedule. A drop seen on{' '}
            {LEARNED_MIN_DAYS} or more days is added to the times Autopilot
            speeds up for. Absence is only reported for times it was actually
            watching. {observationCount} observation
            {observationCount === 1 ? '' : 's'} so far.
          </p>
          <ul className="text-sm">
            {learned.map(d => (
              <li key={d.experienceId} className="py-1">
                <div className="font-semibold">{nameOf(d.experienceId)}</div>
                {d.observed.length > 0 && (
                  <div>
                    Seen:{' '}
                    {d.observed.map((o, i) => (
                      <span key={String(o.time)}>
                        {i > 0 && ', '}
                        <Time time={o.time} />{' '}
                        <span className="text-gray-500">
                          ({o.days} day{o.days === 1 ? '' : 's'}
                          {o.days >= LEARNED_MIN_DAYS
                            ? ', used for timing'
                            : ''}
                          )
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {d.scheduled.length > 0 && (
                  <div>
                    Scheduled:{' '}
                    {d.scheduled.map((c, i) => (
                      <span key={String(c.time)}>
                        {i > 0 && ', '}
                        <Time time={c.time} />{' '}
                        <span
                          className={
                            c.coveredDays > 0 && c.observedDays === 0
                              ? 'text-red-700'
                              : 'text-gray-500'
                          }
                        >
                          {c.coveredDays === 0
                            ? '(not watched yet)'
                            : `(seen ${c.observedDays} of ${c.coveredDays} watched)`}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {Object.keys(skipCounts).length > 0 && (
        <>
          <h3>Why nothing was booked</h3>
          <ul className="text-sm">
            {Object.entries(skipCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <li key={reason} className="py-0.5">
                  <span className="font-semibold">{count}&times;</span>{' '}
                  {SKIP_TEXT[reason] ?? reason}
                </li>
              ))}
          </ul>
        </>
      )}

      {bookingLog.length > 0 && (
        <>
          <h3>Booking activity</h3>
          <ul className="text-sm">
            {bookingLog.map((entry, i) => (
              <li key={`${entry.name}-${i}`} className="py-0.5">
                <Time time={entry.at} />{' '}
                {entry.status === 'booked' ? (
                  <>
                    booked <b>{entry.name}</b>
                    {entry.returnTime && (
                      <>
                        {' '}
                        for <Time time={entry.returnTime} />
                      </>
                    )}
                  </>
                ) : entry.status === 'dry-run' ? (
                  <>
                    <span className="text-yellow-700">would have</span>{' '}
                    {entry.detail === 'modify'
                      ? 'moved'
                      : entry.detail === 'swap'
                        ? 'swapped in'
                        : 'booked'}{' '}
                    <b>{entry.name}</b>
                    {entry.returnTime && (
                      <>
                        {' '}
                        for <Time time={entry.returnTime} />
                      </>
                    )}
                  </>
                ) : entry.status === 'swapped' ? (
                  <>
                    swapped in <b>{entry.name}</b>
                    {entry.replacedName && (
                      <>
                        {' '}
                        for <b>{entry.replacedName}</b>
                      </>
                    )}
                    {entry.returnTime && (
                      <>
                        {' '}
                        at <Time time={entry.returnTime} />
                      </>
                    )}
                  </>
                ) : entry.status === 'modified' ? (
                  <>
                    moved <b>{entry.name}</b>
                    {entry.fromTime && entry.returnTime && (
                      <>
                        {' '}
                        from <Time time={entry.fromTime} /> to{' '}
                        <Time time={entry.returnTime} />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-red-700">failed</span> on{' '}
                    <b>{entry.name}</b>
                    {entry.detail ? `: ${entry.detail}` : ''}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Lightning Lane attractions</h3>
      {watchable.length === 0 ? (
        <p className="text-sm text-gray-600">
          No attractions loaded yet. Close this and refresh the LL list first.
        </p>
      ) : (
        <ul>
          {unwatched.map(exp => (
            <li key={exp.id} className="flex items-center gap-2 py-1">
              <Button
                title={`Watch ${exp.name}`}
                color="bg-gray-200 text-black"
                onClick={() => addTarget({ experienceId: exp.id })}
              >
                <StarIcon />
              </Button>
              <span>{exp.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
