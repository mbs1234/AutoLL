import { use } from 'react';

import { Experience } from '@/api/ll';
import { PollerStatus } from '@/autopilot/usePoller';
import Button from '@/components/Button';
import Screen from '@/components/Screen';
import { Time } from '@/components/Time';
import AutopilotContext from '@/contexts/AutopilotContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import StarIcon from '@/icons/StarIcon';

export const AUTOPILOT = 'Autopilot';

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
    notifications,
    lastHit,
  } = use(AutopilotContext);
  const { experiences } = use(ExperiencesContext);
  const { park } = use(ParkContext);

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
      {watched.length === 0 ? (
        <p className="text-sm text-gray-600">
          Nothing selected yet. Pick attractions below.
        </p>
      ) : (
        <ul>
          {watched.map(exp => (
            <li key={exp.id} className="flex items-center gap-2 py-1">
              <Button
                title={`Stop watching ${exp.name}`}
                onClick={() => removeTarget(exp.id)}
              >
                <StarIcon />
              </Button>
              <span className="font-semibold">{exp.name}</span>
            </li>
          ))}
        </ul>
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
