import {
  resolveHeaderNavAction,
  resolveIsChildSceneRevealed,
} from './app-route-presentation-frame-contract';
import {
  APP_OVERLAY_ROUTE_METADATA_BY_KEY,
  getAppOverlayRouteMetadata,
  type OverlayKey,
} from './app-overlay-route-types';
import { extendActiveRootFromNavReTap } from './app-search-route-command-runtime';
import { createAppRouteSheetSnapSessionRuntime } from './app-route-sheet-snap-session-runtime';
import { createAppRouteSceneSwitchRuntime } from './app-route-scene-switch-controller';
import { isEditSessionLiveOnScene, publishEditSessionLive } from './edit-session-liveness-contract';

declare const global: { __DEV__?: boolean };

// The scene-switch controller (the PF's one writer, under test below) imports react-native for
// unstable_batchedUpdates only; this node-env suite substitutes the one function it uses.
jest.mock('react-native', () => ({
  unstable_batchedUpdates: (run: () => void) => run(),
}));

// ─── PF chrome clock (leg 6): headerNavAction + isChildSceneRevealed derivations ─────────────
// Type-list-disease-proof: the sweeps enumerate the LIVE metadata table, so a new OverlayKey is
// covered automatically (a role change shows up here, never a stale hand-list).

const ALL_KEYS = Object.keys(APP_OVERLAY_ROUTE_METADATA_BY_KEY) as OverlayKey[];

describe('resolveHeaderNavAction (PF chrome clock)', () => {
  it('null (pre-first-commit) rests at the create plus', () => {
    expect(resolveHeaderNavAction(null, false)).toBe('create');
  });

  it("presented 'search' (a results session) keeps the X", () => {
    expect(resolveHeaderNavAction('search', false)).toBe('close');
  });

  it('every topLevel presented scene rests at the plus; every other role shows the X', () => {
    for (const key of ALL_KEYS) {
      const role = getAppOverlayRouteMetadata(key).role;
      const expected = key === 'search' ? 'close' : role === 'topLevel' ? 'create' : 'close';
      expect({ key, action: resolveHeaderNavAction(key, false) }).toEqual({
        key,
        action: expected,
      });
    }
  });

  // Leg 9 (wave-2 §2 conformance): a LIVE edit session shows the X on ANY scene — the home
  // My-ranking edit on bookmarks (topLevel) must not keep a live create plus mid-edit.
  it('a live edit session shows the X on EVERY scene, topLevel included', () => {
    for (const key of ALL_KEYS) {
      expect({ key, action: resolveHeaderNavAction(key, true) }).toEqual({
        key,
        action: 'close',
      });
    }
  });
});

describe('resolveIsChildSceneRevealed (nav-out on the frame)', () => {
  it('exact role parity with the deleted nav-out store writer, over the live table', () => {
    expect(resolveIsChildSceneRevealed(null, false)).toBe(false);
    for (const key of ALL_KEYS) {
      expect(resolveIsChildSceneRevealed(key, false)).toBe(
        getAppOverlayRouteMetadata(key).role === 'child'
      );
    }
  });

  // Leg 9 (wave-3 §1b conformance): child-page tenure — a live edit session derives nav-out
  // on ANY scene ("nav bar transitions out … no tab-switching mid-edit"); a dead session on a
  // topLevel scene restores the pure role derivation (the sweep above).
  it('a live edit session derives nav-out on EVERY scene, topLevel included', () => {
    for (const key of ALL_KEYS) {
      expect({ key, navOut: resolveIsChildSceneRevealed(key, true) }).toEqual({
        key,
        navOut: true,
      });
    }
  });

  it('the null (pre-first-commit) frame never derives nav-out, live session or not', () => {
    expect(resolveIsChildSceneRevealed(null, true)).toBe(false);
  });
});

// ─── Leg 9: edit-session liveness → PF re-mint (the one-writer law holds) ────────────────────
// The session primitive publishes; the ONE frame writer subscribes and re-mints. Proves the
// LIVE wiring end-to-end: publish on the presented scene ⇒ the committed frame flips to
// nav-out + close; release ⇒ the topLevel derivation restores. RED without the controller's
// liveness subscription (no re-mint) or without the derivation inputs (fields never flip).
describe('edit-session liveness re-mints the PresentationFrame', () => {
  it('publish ⇒ nav-out + close on the committed frame; release ⇒ topLevel derivation restored', () => {
    type RuntimeArgs = Parameters<typeof createAppRouteSceneSwitchRuntime>[0];
    const controller = createAppRouteSceneSwitchRuntime({
      sheetMotionTargetRegistry: {
        resolveCurrentSnapTarget: () => null,
      } as unknown as RuntimeArgs['sheetMotionTargetRegistry'],
      routeSceneVisibilityPolicyRuntime: {} as RuntimeArgs['routeSceneVisibilityPolicyRuntime'],
      resolveSceneRememberedSnap: () => null,
    });
    try {
      // Boot state: root 'search' presents — topLevel-rich, pure role derivation at rest.
      const frames: Array<ReturnType<typeof controller.getPresentationFrame>> = [];
      controller.subscribePresentationFrame((frame) => frames.push(frame));

      const release = publishEditSessionLive('search');
      const liveFrame = controller.getPresentationFrame();
      expect(liveFrame.isChildSceneRevealed).toBe(true);
      expect(liveFrame.headerNavAction).toBe('close');
      // The re-mint DELIVERED (not just mutated): subscribers saw the live frame.
      expect(frames[frames.length - 1]?.isChildSceneRevealed).toBe(true);

      release();
      const restoredFrame = controller.getPresentationFrame();
      expect(restoredFrame.isChildSceneRevealed).toBe(false);
      expect(frames[frames.length - 1]?.isChildSceneRevealed).toBe(false);

      // Scene-scoped law: a live session on ANOTHER scene never leaks into this one.
      const otherSceneRelease = publishEditSessionLive('bookmarks');
      expect(controller.getPresentationFrame().isChildSceneRevealed).toBe(false);
      otherSceneRelease();
    } finally {
      controller.dispose();
    }
  });
});

describe('edit-session liveness contract (counted, scene-scoped)', () => {
  it('counts stacked publications per scene; double-release is inert', () => {
    expect(isEditSessionLiveOnScene('listDetail')).toBe(false);
    const releaseA = publishEditSessionLive('listDetail');
    const releaseB = publishEditSessionLive('listDetail');
    expect(isEditSessionLiveOnScene('listDetail')).toBe(true);
    releaseA();
    releaseA(); // idempotent — must not steal B's publication
    expect(isEditSessionLiveOnScene('listDetail')).toBe(true);
    releaseB();
    expect(isEditSessionLiveOnScene('listDetail')).toBe(false);
    expect(isEditSessionLiveOnScene(null)).toBe(false);
  });
});

// ─── Nav re-tap named intent (§4 / snap-law writer category (c)) ─────────────────────────────
describe('extendActiveRootFromNavReTap', () => {
  it("extends to expanded and writes the side's seat via the 'named' lane (home → carrier)", () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    const promoteActiveSheet = jest.fn();
    extendActiveRootFromNavReTap({
      targetSceneKey: 'search',
      promoteActiveSheet,
      routeSheetSnapSessionActions: runtime.actions,
    });
    expect(promoteActiveSheet).toHaveBeenCalledWith({ snap: 'expanded' });
    // Home's carrier scene is 'polls' — the HOME seat remembers expanded.
    expect(runtime.authority.getSnapshot().homeSeatSnap).toBe('expanded');
  });

  it('content-side re-tap writes the content seat', () => {
    const runtime = createAppRouteSheetSnapSessionRuntime();
    extendActiveRootFromNavReTap({
      targetSceneKey: 'bookmarks',
      promoteActiveSheet: jest.fn(),
      routeSheetSnapSessionActions: runtime.actions,
    });
    expect(runtime.authority.getSnapshot().contentSeatSnap).toBe('expanded');
  });

  it("RED: the same write routed as 'programmatic' is dropped with the [snap-law] bark", () => {
    global.__DEV__ = true;
    const runtime = createAppRouteSheetSnapSessionRuntime();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    runtime.actions.recordRouteSceneSheetSettle({
      sceneKey: 'polls',
      snap: 'expanded',
      writer: 'programmatic',
    });
    expect(runtime.authority.getSnapshot().homeSeatSnap).not.toBe('expanded');
    expect(String(consoleError.mock.calls[0]?.[0])).toContain('[snap-law]');
    consoleError.mockRestore();
  });
});
