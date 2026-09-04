import { act, renderHook, waitFor } from '@testing-library/react';

import { DateTime } from '@/datetime';

import {
  BACKOFF_CAP_MS,
  IDLE_INTERVAL_MS,
  MAX_CONSECUTIVE_FAILURES,
} from './schedule';
import usePoller from './usePoller';

jest.mock('@/timesync');

// jest.config.js sets `fakeTimers` options but not `enableGlobally`, so fake
// timers are off unless a file opts in. Without this the loop's setTimeout
// runs on the real clock and the scheduled ticks never arrive inside a test.
jest.useFakeTimers();

/** Jump far enough ahead to guarantee the next scheduled tick has fired. */
async function advancePastNextTick(ms = IDLE_INTERVAL_MS * 2) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('usePoller', () => {
  it('never ticks while disabled', async () => {
    const onTick = jest.fn(async () => undefined);
    const { result } = renderHook(() => usePoller({ enabled: false, onTick }));
    await advancePastNextTick();
    expect(onTick).not.toHaveBeenCalled();
    expect(result.current.mode).toBe('off');
  });

  it('ticks immediately when enabled', async () => {
    const onTick = jest.fn(async () => undefined);
    renderHook(() => usePoller({ enabled: true, onTick }));
    await waitFor(() => expect(onTick).toHaveBeenCalledTimes(1));
  });

  it('keeps ticking on a schedule', async () => {
    const onTick = jest.fn(async () => undefined);
    renderHook(() => usePoller({ enabled: true, onTick }));
    await waitFor(() => expect(onTick).toHaveBeenCalledTimes(1));
    await advancePastNextTick();
    expect(onTick.mock.calls.length).toBeGreaterThan(1);
  });

  it('reports idle mode with no upcoming targets', async () => {
    const onTick = jest.fn(async () => undefined);
    const { result } = renderHook(() => usePoller({ enabled: true, onTick }));
    await waitFor(() => expect(result.current.mode).toBe('idle'));
    expect(result.current.polls).toBeGreaterThan(0);
  });

  // Polls run strictly sequentially: the next is scheduled only once the
  // previous settles, so a slow request can never cause overlapping calls.
  it('does not overlap ticks', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const onTick = jest.fn(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await new Promise(resolve => setTimeout(resolve, 5000));
      --inFlight;
    });
    renderHook(() => usePoller({ enabled: true, onTick }));
    await advancePastNextTick(IDLE_INTERVAL_MS * 5);
    expect(maxInFlight).toBe(1);
  });

  it('counts consecutive failures', async () => {
    const onTick = jest.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => usePoller({ enabled: true, onTick }));
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1));
    expect(result.current.lastError).toBe('boom');
  });

  it('resets the failure count after a success', async () => {
    let fail = true;
    const onTick = jest.fn(async () => {
      if (fail) throw new Error('boom');
    });
    const { result } = renderHook(() => usePoller({ enabled: true, onTick }));
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1));
    fail = false;
    await advancePastNextTick(BACKOFF_CAP_MS);
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(0));
  });

  // A stuck loop is worse than a stopped one: a 401 clears the auth store, so
  // retrying forever against dead credentials just generates noise.
  it('gives up after too many consecutive failures', async () => {
    const onTick = jest.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => usePoller({ enabled: true, onTick }));
    await waitFor(() => expect(result.current.consecutiveFailures).toBe(1));
    for (let i = 1; i < MAX_CONSECUTIVE_FAILURES; ++i) {
      await advancePastNextTick(BACKOFF_CAP_MS);
    }
    await waitFor(() => expect(result.current.mode).toBe('stopped'));
    const callsAtStop = onTick.mock.calls.length;
    await advancePastNextTick(BACKOFF_CAP_MS * 3);
    expect(onTick).toHaveBeenCalledTimes(callsAtStop);
  });

  it('stops ticking after unmount', async () => {
    const onTick = jest.fn(async () => undefined);
    const { unmount } = renderHook(() => usePoller({ enabled: true, onTick }));
    await waitFor(() => expect(onTick).toHaveBeenCalledTimes(1));
    unmount();
    const callsAtUnmount = onTick.mock.calls.length;
    await advancePastNextTick(IDLE_INTERVAL_MS * 3);
    expect(onTick).toHaveBeenCalledTimes(callsAtUnmount);
  });

  it('picks up a drop time and bursts', async () => {
    const onTick = jest.fn(async () => undefined);
    // Derive the target the same way the hook does. syncedParkTime() reads
    // the mocked timesync clock (Date.now()) through DateTime, which is fixed
    // to America/New_York -- building a ParkTime from the raw local time
    // instead would be off by the UTC offset the suite runs under.
    const soon = DateTime.from(Date.now() + 10_000).time;
    const { result } = renderHook(() =>
      usePoller({ enabled: true, onTick, dropTimes: [soon] })
    );
    await waitFor(() => expect(result.current.mode).toBe('burst'));
    expect(result.current.target).toEqual(soon);
  });
});
