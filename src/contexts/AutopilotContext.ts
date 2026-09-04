import { createContext } from 'react';

import { AlertPermission } from '@/autopilot/alert';
import { PollerStatus } from '@/autopilot/usePoller';
import { WatchTarget } from '@/autopilot/watchlist';
import { ParkTime } from '@/datetime';

export interface AutopilotHit {
  experienceId: string;
  name: string;
  returnTime: ParkTime;
}

export interface AutopilotState {
  enabled: boolean;
  /**
   * Must be called from a user gesture when turning on: unlocking audio and
   * prompting for notification permission both require one.
   */
  setEnabled: (on: boolean) => void;
  status: PollerStatus;
  targets: WatchTarget[];
  isWatched: (experienceId: string) => boolean;
  addTarget: (target: WatchTarget) => void;
  removeTarget: (experienceId: string) => void;
  notifications: AlertPermission;
  /** The most recent alert, for showing what was found without a toast. */
  lastHit?: AutopilotHit;
}

export default createContext<AutopilotState>({
  enabled: false,
  setEnabled: () => undefined,
  status: { mode: 'off', consecutiveFailures: 0, polls: 0 },
  targets: [],
  isWatched: () => false,
  addTarget: () => undefined,
  removeTarget: () => undefined,
  notifications: 'unsupported',
});
