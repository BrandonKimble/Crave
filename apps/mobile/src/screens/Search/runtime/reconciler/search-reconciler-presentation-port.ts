// S4b strangler glue (dies in S4c with the transaction machine): the reconciler drives
// the EXISTING presentation choreography — the toggle coordinator for rerun commits and
// the pending-cover arms — but those live in presentation runtimes composed after the
// reconciler. This settable port bridges the composition gap with ref semantics; the
// statechart host replaces it wholesale in S4c.

import type { ScheduleToggleCommit } from '../shared/results-toggle-interaction-contract';

export type SearchReconcilerPresentationPort = {
  scheduleToggleCommit: ScheduleToggleCommit;
  beginVariantRerunPresentationPending: (transactionId: string) => void;
  clearStagedSearchSurfaceResultsTransaction: () => void;
  /** S4c-1b: the tab-switch commit body — presents the CURRENT desired tab (direct
   *  activeTab publish, never the tuple writer) and arms the cache-keyed re-reveal. */
  presentTabSwitch: (args: { intentId: string; targetTab: 'dishes' | 'restaurants' }) => void;
};

let port: SearchReconcilerPresentationPort | null = null;

export const registerSearchReconcilerPresentationPort = (
  next: SearchReconcilerPresentationPort
): (() => void) => {
  port = next;
  return () => {
    if (port === next) {
      port = null;
    }
  };
};

export const getSearchReconcilerPresentationPort = (): SearchReconcilerPresentationPort | null =>
  port;

// View inputs the reconciler reads at transition time (the docked-polls flag drives the
// home-pill enter transition variant). Registered by the foreground command runtime.
export type SearchReconcilerViewInputs = {
  getDockedPollsFlag: () => boolean;
};

let viewInputs: SearchReconcilerViewInputs | null = null;

export const registerSearchReconcilerViewInputs = (
  next: SearchReconcilerViewInputs
): (() => void) => {
  viewInputs = next;
  return () => {
    if (viewInputs === next) {
      viewInputs = null;
    }
  };
};

export const getSearchReconcilerViewInputs = (): SearchReconcilerViewInputs | null => viewInputs;
