/**
 * F2805 — THE BANNER RECOVERY PROBE MUST START AGAINST AN ISSUE THAT IS ALREADY
 * LIVE WHEN IT MOUNTS.
 *
 * zustand does not invoke a `subscribe` listener at subscription time, so the
 * old subscribe-only wiring created no timer when `serviceIssue != null` at the
 * moment `startBannerRecoveryProbe` ran — the probe never started and the
 * banner hung indefinitely. The fix reconciles against the current state with
 * an initial `sync(getState())` before subscribing.
 *
 * RED recipe: delete the `sync(useSystemStatusStore.getState())` line in
 * api.ts's `startBannerRecoveryProbe` and this test fails — no health GET is
 * attempted because the pre-existing issue fires no `subscribe` callback.
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: null, easConfig: null, manifest: null },
}));
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import axios from 'axios';
import { startBannerRecoveryProbe, HEALTH_PROBE_INTERVAL_MS } from './api';
import { useSystemStatusStore } from '../store/systemStatusStore';

describe('startBannerRecoveryProbe — reconciles against a live-at-mount issue (F2805)', () => {
  let getSpy: jest.SpyInstance;
  let stop: (() => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    getSpy = jest
      .spyOn(axios, 'get')
      .mockRejectedValue(new Error('still down')) as jest.SpyInstance;
    useSystemStatusStore.getState().clearServiceIssue();
  });

  afterEach(() => {
    stop?.();
    stop = null;
    useSystemStatusStore.getState().clearServiceIssue();
    getSpy.mockRestore();
    jest.useRealTimers();
  });

  it('probes /health when an issue was reported BEFORE the probe started', () => {
    // Issue is live at the moment the probe mounts — the exact remount-while-
    // degraded / rehydrated-with-an-issue ordering the subscribe-only wiring missed.
    useSystemStatusStore
      .getState()
      .reportServiceIssue({ scope: 'global', message: 'Service temporarily unavailable.' });

    stop = startBannerRecoveryProbe();

    // One interval later a health GET must have been attempted.
    jest.advanceTimersByTime(HEALTH_PROBE_INTERVAL_MS);

    const calls = getSpy.mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0][0])).toContain('/health');
  });
});
