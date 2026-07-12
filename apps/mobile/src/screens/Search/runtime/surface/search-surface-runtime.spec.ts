// RED contracts for the transition-perf fence + dismiss-choreography release:
// - `sheetReady` means "the sheet is not physically moving": redraws are BORN ready
//   (stationary redraws never gate on a slide that will not run); the sheet host flips
//   it pending at snap START and restores it at snap SETTLE.
// - Persistent-poll release on dismiss requires the WHOLE choreography (bottom boundary
//   AND nav return), and the commit stamp uses the same single derivation.
jest.mock('../../../../navigation/runtime/app-route-scene-switch-controller', () => ({
  markActiveSceneContentGate: jest.fn(),
}));
jest.mock('../../../../perf/perf-scenario-runtime-store', () => ({
  usePerfScenarioRuntimeStore: { getState: () => ({ activeConfig: null }) },
}));

import {
  SearchSurfaceRuntime,
  isDismissChoreographyComplete,
  selectSearchSurfaceVisualPolicy,
} from './search-surface-runtime';

// The runtime arms real watchdog timers; fake them so the hermetic run exits cleanly.
jest.useFakeTimers();

const markAllPollPartsReady = (runtime: SearchSurfaceRuntime, transactionId: string): void => {
  runtime.markPollPagePartReady('header', transactionId, 'sceneStack:persistent:header');
  runtime.markPollPagePartReady('body', transactionId, 'sceneStack:persistent:body');
  runtime.markPollPagePartReady('host', transactionId, 'sceneStack:persistent:host');
};

describe('SearchSurfaceRuntime sheetReady (sheet-motion fence)', () => {
  it('redraw transactions are BORN sheet-ready (stationary redraws commit without a slide)', () => {
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'toggle' });
    expect(runtime.getSnapshot().redrawTransaction?.id).toBe(id);
    expect(runtime.getSnapshot().redrawTransaction?.readiness.sheetReady).toBe(true);
  });

  it('snap START flips pending, snap SETTLE restores — the motion window is fenced', () => {
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'submit' });
    runtime.markRedrawSheetMotionPending(id);
    expect(runtime.getSnapshot().redrawTransaction?.readiness.sheetReady).toBe(false);
    runtime.markRedrawSheetReady(id);
    expect(runtime.getSnapshot().redrawTransaction?.readiness.sheetReady).toBe(true);
  });

  it('the 3-gate reveal commit waits for sheet motion to settle', () => {
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'submit' });
    runtime.markRedrawSheetMotionPending(id);
    runtime.markRedrawCardsReady(id);
    runtime.markRedrawNativeMarkerFrameReady(id);
    expect(runtime.getSnapshot().redrawTransaction?.committedAtMs ?? null).toBeNull();
    runtime.markRedrawSheetReady(id);
    // All three gates satisfied → the redraw commits (transaction completes).
    const snapshot = runtime.getSnapshot();
    const stillPending = snapshot.redrawTransaction;
    expect(stillPending == null || stillPending.committedAtMs != null).toBe(true);
  });
});

describe('dismiss choreography release (bottom boundary AND nav return)', () => {
  it('isDismissChoreographyComplete requires BOTH motion facts', () => {
    expect(
      isDismissChoreographyComplete({ bottomBoundaryReached: true, bottomNavReturnReady: false })
    ).toBe(false);
    expect(
      isDismissChoreographyComplete({ bottomBoundaryReached: false, bottomNavReturnReady: true })
    ).toBe(false);
    expect(
      isDismissChoreographyComplete({ bottomBoundaryReached: true, bottomNavReturnReady: true })
    ).toBe(true);
  });

  it('polls are NOT released at the bottom boundary while the nav is still returning', () => {
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.armDismissMotion({});
    markAllPollPartsReady(runtime, id);
    runtime.commitDismissBoundary(id);
    const heldPolicy = selectSearchSurfaceVisualPolicy(runtime.getSnapshot());
    expect(heldPolicy.canReleasePersistentPolls).toBe(false);
    expect(heldPolicy.sheetClipMode).toBe('animatedSearchTransition');
    expect(heldPolicy.bottomBandOwner).toBe('results_header');
    // committedAtMs (the release stamp) must not be minted yet either.
    expect(runtime.getSnapshot().dismissTransaction?.committedAtMs ?? null).toBeNull();

    runtime.markBottomNavReturnReady(id);
    const releasedPolicy = selectSearchSurfaceVisualPolicy(runtime.getSnapshot());
    expect(releasedPolicy.canReleasePersistentPolls).toBe(true);
    expect(releasedPolicy.sheetClipMode).toBe('dockedPersistentPoll');
    expect(releasedPolicy.bottomBandOwner).toBe('persistent_polls');
    expect(runtime.getSnapshot().dismissTransaction?.committedAtMs).not.toBeNull();
  });
});
