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
  setOffline: (isOffline: boolean) => void;
  reportServiceIssue: (issue: Omit<ServiceIssue, 'observedAt'>) => void;
  clearServiceIssue: (scope?: ServiceIssueScope) => void;
}

export const useSystemStatusStore = create<SystemStatusState>()((set) => ({
  isOffline: false,
  serviceIssue: null,
  setOffline: (isOffline) =>
    set((state) => (state.isOffline === isOffline ? state : { isOffline })),
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
