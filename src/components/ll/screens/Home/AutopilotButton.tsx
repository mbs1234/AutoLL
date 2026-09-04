import { use } from 'react';

import Button from '@/components/Button';
import AutopilotContext from '@/contexts/AutopilotContext';
import NavContext from '@/contexts/NavContext';
import ClockIcon from '@/icons/ClockIcon';

import Autopilot, { AUTOPILOT } from '../Autopilot';

/**
 * Opens the Autopilot screen, and shows at a glance whether it is running.
 *
 * Deliberately not a toggle. Enabling autopilot is a setup step -- choose
 * attractions, grant notification permission -- and a mis-tap here silently
 * starting or stopping background polling would be worse than one extra tap.
 */
export default function AutopilotButton() {
  const { goTo } = use(NavContext);
  const { enabled, status, targets } = use(AutopilotContext);
  const running = enabled && status.mode !== 'stopped';
  const attention = enabled && status.mode === 'stopped';

  return (
    <Button
      title={
        running
          ? `${AUTOPILOT} on, watching ${targets.length}`
          : attention
            ? `${AUTOPILOT} stopped after errors`
            : `${AUTOPILOT} off`
      }
      onClick={() => goTo(<Autopilot />)}
      color={
        attention
          ? 'bg-red-700 text-white'
          : running
            ? 'bg-green-700 text-white'
            : undefined
      }
    >
      <ClockIcon />
      {running && targets.length > 0 && (
        <span className="ml-1 text-xs font-semibold">{targets.length}</span>
      )}
    </Button>
  );
}
