import { createContext } from 'react';

import { AlertPermission } from '@/autopilot/alert';
import { DEFAULT_MAX_PER_SESSION } from '@/autopilot/autobook';
import { PollerStatus } from '@/autopilot/usePoller';
import { WatchTarget } from '@/autopilot/watchlist';
import { ParkTime } from '@/datetime';

export interface AutopilotHit {
  experienceId: string;
  name: string;
  returnTime: ParkTime;
}

export interface BookingLogEntry {
  name: string;
  at: ParkTime;
  status: 'booked' | 'modified' | 'swapped' | 'failed' | 'skipped';
  /** Return time for a booking. */
  returnTime?: ParkTime;
  /** Previous return time, for a modification. */
  fromTime?: ParkTime;
  /** The reservation given up, for a swap. */
  replacedName?: string;
  /** Error message or skip reason. */
  detail?: string;
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
  /** Turn automatic booking on or off for one watched attraction. */
  toggleAutoBook: (experienceId: string) => void;
  /** Turn automatic re-timing of an existing reservation on or off. */
  toggleAutoModify: (experienceId: string) => void;
  /** Book any time first, then move toward the window. Implies both. */
  toggleBookThenMove: (experienceId: string) => void;
  /** Keep alerting but take no action for this attraction. */
  togglePaused: (experienceId: string) => void;
  /** When full, give up the worst held reservation for this attraction. */
  toggleAutoSwap: (experienceId: string) => void;
  notifications: AlertPermission;
  /** The most recent alert, for showing what was found without a toast. */
  lastHit?: AutopilotHit;
  /** Newest first, capped. Skips are omitted -- they are the common case. */
  bookingLog: BookingLogEntry[];
  bookedCount: number;
  bookingsRemaining: number;
  /** Act only when every party member is eligible. Persisted. */
  requireWholeParty: boolean;
  setRequireWholeParty: (on: boolean) => void;
  /**
   * How often each reason stopped an action this session. Skips are the
   * ordinary outcome and are kept out of the log, so this is where "why did
   * nothing get booked?" gets answered.
   */
  skipCounts: Record<string, number>;
}

export default createContext<AutopilotState>({
  enabled: false,
  setEnabled: () => undefined,
  status: { mode: 'off', consecutiveFailures: 0, polls: 0 },
  targets: [],
  isWatched: () => false,
  addTarget: () => undefined,
  removeTarget: () => undefined,
  toggleAutoBook: () => undefined,
  toggleAutoModify: () => undefined,
  toggleBookThenMove: () => undefined,
  togglePaused: () => undefined,
  toggleAutoSwap: () => undefined,
  notifications: 'unsupported',
  bookingLog: [],
  bookedCount: 0,
  bookingsRemaining: DEFAULT_MAX_PER_SESSION,
  requireWholeParty: false,
  setRequireWholeParty: () => undefined,
  skipCounts: {},
});
