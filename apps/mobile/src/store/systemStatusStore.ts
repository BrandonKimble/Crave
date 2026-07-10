import { create } from 'zustand';

type ServiceIssueScope = 'global' | 'search';

export type ServiceIssue = {
  scope: ServiceIssueScope;
  message: string;
  observedAt: number;
};

interface SystemStatusState {
  isOffline: boolean;
  serviceIssue: ServiceIssue | null;
  /**
   * DEV RIG LEVER (failure-matrix harness): while non-null, `isOffline` is pinned to
   * this value and the NetInfo listener's writes are ignored — real-Wi-Fi flapping
   * wedges the simulator's NetInfo, so the matrix drives offline via a perf command
   * instead. __DEV__-only by construction (the setter no-ops in prod).
   */
  devOfflineOverride: boolean | null;
  setOffline: (isOffline: boolean) => void;
  setDevOfflineOverride: (value: boolean | null) => void;
  reportServiceIssue: (issue: Omit<ServiceIssue, 'observedAt'>) => void;
  clearServiceIssue: (scope?: ServiceIssueScope) => void;
}

export const useSystemStatusStore = create<SystemStatusState>()((set) => ({
  isOffline: false,
  serviceIssue: null,
  devOfflineOverride: null,
  setOffline: (isOffline) =>
    set((state) => {
      if (state.devOfflineOverride != null) {
        return state;
      }
      return state.isOffline === isOffline ? state : { isOffline };
    }),
  setDevOfflineOverride: (value) =>
    set((state) => {
      if (!__DEV__) {
        return state;
      }
      return {
        devOfflineOverride: value,
        isOffline: value ?? state.isOffline,
      };
    }),
  reportServiceIssue: (issue) =>
    set(() => ({
      serviceIssue: {
        scope: issue.scope,
        message: issue.message,
        observedAt: Date.now(),
      },
    })),
  clearServiceIssue: (scope) =>
    set((state) => {
      if (!state.serviceIssue) {
        return state;
      }
      if (scope && state.serviceIssue.scope !== scope) {
        return state;
      }
      return { serviceIssue: null };
    }),
}));

/**
 * THE reconnect primitive (foundation-hardening plan §A): the ONE offline→online
 * edge. Every surface that must resume paused work on reconnect subscribes HERE —
 * nobody re-implements edge detection. (react-query surfaces get the equivalent via
 * onlineManager; this is the primitive for everything hand-rolled.) The listener
 * decides WHAT resuming means for its surface; the edge is shared.
 */
export const subscribeToReconnect = (listener: () => void): (() => void) =>
  useSystemStatusStore.subscribe((state, prevState) => {
    if (prevState.isOffline && !state.isOffline) {
      listener();
    }
  });
