// RED contracts for the transition-perf fence + dismiss-choreography release:
// - `sheetReady` means "the sheet is not physically moving": redraws are BORN ready
//   (stationary redraws never gate on a slide that will not run); the sheet host flips
//   it pending at snap START and restores it at snap SETTLE.
// - Persistent-poll release on dismiss requires the WHOLE choreography (bottom boundary
//   AND nav return), and the commit stamp uses the same single derivation.
jest.mock('../../../../perf/perf-scenario-runtime-store', () => ({
  usePerfScenarioRuntimeStore: { getState: () => ({ activeConfig: null }) },
}));

import {
  SearchSurfaceRuntime,
  isDismissChoreographyComplete,
  selectSearchSurfaceVisualPolicy,
} from './search-surface-runtime';
import { resetTransitionTxnHolderForTest } from '../../../../navigation/runtime/transition-engine/transition-transaction';
import {
  getTrackMotionAuthority,
  resetTrackMotionAuthorityForTest,
} from '../../../../tracksheet/track-motion-authority';

// The engine holder is module-scope; a prior test's live episode would make the next
// test's staging DEFER (route-window semantics) and its offers bounce.
beforeEach(() => {
  resetTransitionTxnHolderForTest();
});

// The runtime arms real watchdog timers; fake them so the hermetic run exits cleanly.
jest.useFakeTimers();

const markAllPollPartsReady = (runtime: SearchSurfaceRuntime, transactionId: string): void => {
  runtime.markPollPagePartReady('header', transactionId, 'sceneStack:persistent:header');
  runtime.markPollPagePartReady('body', transactionId, 'sceneStack:persistent:body');
  runtime.markPollPagePartReady('host', transactionId, 'sceneStack:persistent:host');
};

describe('SearchSurfaceRuntime sheet-motion fence (redraw-object shrink: SURFACE state)', () => {
  it('the surface is BORN fence-open (stationary redraws never gate on a slide that will not run)', () => {
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'toggle' });
    expect(runtime.getSnapshot().redrawTransaction?.id).toBe(id);
    expect(runtime.getSnapshot().sheetMotionSettled).toBe(true);
  });

  it('snap START flips pending, snap SETTLE restores — the motion window is fenced', () => {
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'submit' });
    runtime.markRedrawSheetMotionPending(id);
    expect(runtime.getSnapshot().sheetMotionSettled).toBe(false);
    runtime.markRedrawSheetReady(id);
    expect(runtime.getSnapshot().sheetMotionSettled).toBe(true);
  });

  it('THE MID-SLIDE LAW: the episode-driven redraw commit defers while the sheet moves and lands at fence restore', () => {
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'submit' });
    runtime.markRedrawSheetMotionPending(id);
    // The episode joins via the marks (paint + mapFrame offers ride them), but the
    // commit must hold while the sheet is physically moving.
    runtime.markRedrawCardsReady(id);
    runtime.markRedrawNativeMarkerFrameReady(id);
    expect(runtime.getSnapshot().redrawTransaction?.committedAtMs ?? null).toBeNull();
    runtime.markRedrawSheetReady(id);
    // F6405 — THE LAND HALF. This used to read
    // `expect(stillPending == null || stillPending.committedAtMs != null).toBe(true)`,
    // whose first arm is satisfied by the transaction having VANISHED — the opposite of
    // landing, and a live outcome: the settle path sets
    // `redrawTransaction: null, completedRedrawTransaction: redrawTransaction`. The test
    // proved the DEFER half of its name and nothing at all of the LAND half.
    // The commit moves between two snapshot fields, so NAME the handoff instead of
    // accepting either.
    const snapshot = runtime.getSnapshot();
    expect(snapshot.redrawTransaction).toBeNull();
    const committed = snapshot.redrawTransaction ?? snapshot.completedRedrawTransaction;
    expect(committed?.id).toBe(id);
    expect(committed?.committedAtMs ?? null).not.toBeNull();
  });
});

// ─── F2 (deep red team round 2) — the redraw born mid-flight ─────────────────
// THE BUG THIS CLOSES: a redraw arming while the sheet was ALREADY in motion
// was born sheetMotionSettled:true, because the seed had no authority to ask —
// the at-rest fact lived in three refs inside a React hook. Its reveal could
// land mid-slide. The seed now ASKS THE MOTION AUTHORITY.
// PROVEN RED by mutation: drop `&& getTrackMotionAuthority().isAtRest()` from
// publishArmedRedrawTransaction and the first two cases below fail.
describe('F2: a redraw armed MID-FLIGHT is born NOT settled (the seed asks the motion authority)', () => {
  beforeEach(() => resetTrackMotionAuthorityForTest());
  afterEach(() => resetTrackMotionAuthorityForTest());

  it('armed during a live DRAG → born fenced, and it opens only on a real rest fact', () => {
    getTrackMotionAuthority().dispatch({ type: 'drag-begin', atMs: 0 });
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'toggle' });
    expect(runtime.getSnapshot().redrawTransaction?.id).toBe(id);
    expect(runtime.getSnapshot().sheetMotionSettled).toBe(false);
    // The REAL rest fact (the settle observer) ends the episode; the host's
    // rest handler is what marks the leg ready — nothing else may open it.
    const transition = getTrackMotionAuthority().dispatch({ type: 'settle' });
    expect(transition.rest).toBe(true);
    runtime.markRedrawSheetReady(id);
    expect(runtime.getSnapshot().sheetMotionSettled).toBe(true);
  });

  it('armed during a commanded FLIGHT → born fenced (the F2 window, any producer)', () => {
    getTrackMotionAuthority().dispatch({
      type: 'command-issued',
      willMove: true,
      snapTo: 'expanded',
      settleToken: 1,
      atMs: 0,
    });
    const runtime = new SearchSurfaceRuntime();
    runtime.beginRedrawTransaction({ reason: 'submit' });
    expect(runtime.getSnapshot().sheetMotionSettled).toBe(false);
  });

  it('armed AT REST → still born open (a sheet that never moves has no settle to wait for)', () => {
    expect(getTrackMotionAuthority().isAtRest()).toBe(true);
    const runtime = new SearchSurfaceRuntime();
    runtime.beginRedrawTransaction({ reason: 'toggle' });
    expect(runtime.getSnapshot().sheetMotionSettled).toBe(true);
  });

  it('THE MID-SLIDE LAW holds for the mid-flight arm: the commit defers until the fence restores', () => {
    getTrackMotionAuthority().dispatch({ type: 'drag-begin', atMs: 0 });
    const runtime = new SearchSurfaceRuntime();
    const id = runtime.beginRedrawTransaction({ reason: 'submit' });
    runtime.markRedrawCardsReady(id);
    runtime.markRedrawNativeMarkerFrameReady(id);
    expect(runtime.getSnapshot().redrawTransaction?.committedAtMs ?? null).toBeNull();
    getTrackMotionAuthority().dispatch({ type: 'settle' });
    runtime.markRedrawSheetReady(id);
    // F6405: same LAND assertion as the sibling above — the fence restore must STAMP the
    // commit, not merely drop the transaction.
    const snapshot = runtime.getSnapshot();
    const committed = snapshot.redrawTransaction ?? snapshot.completedRedrawTransaction;
    expect(committed?.id).toBe(id);
    expect(committed?.committedAtMs ?? null).not.toBeNull();
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
    expect(heldPolicy.canReleaseDockedScene).toBe(false);
    expect(heldPolicy.sheetClipMode).toBe('animatedSearchTransition');
    expect(heldPolicy.bottomBandOwner).toBe('results_header');
    // committedAtMs (the release stamp) must not be minted yet either.
    expect(runtime.getSnapshot().dismissTransaction?.committedAtMs ?? null).toBeNull();

    runtime.markBottomNavReturnReady(id);
    const releasedPolicy = selectSearchSurfaceVisualPolicy(runtime.getSnapshot());
    expect(releasedPolicy.canReleaseDockedScene).toBe(true);
    expect(releasedPolicy.sheetClipMode).toBe('dockedScene');
    expect(releasedPolicy.bottomBandOwner).toBe('docked_scene');
    expect(runtime.getSnapshot().dismissTransaction?.committedAtMs).not.toBeNull();
  });
});
