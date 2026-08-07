import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';
import type { OverlayKey } from './app-overlay-route-types';
import {
  ROOT_SEARCH_ROUTE_ENTRY,
  createRouteStateSnapshot,
  pushRouteState,
  type RouteSceneSwitchRouteStateSnapshot,
} from './app-overlay-route-stack-algebra';
import { createAppRouteOverlaySessionStateController } from './app-route-overlay-session-state-controller';
import { captureRouteEntryOrigin } from './route-entry-origin-capture-delegate';
import { publishOriginSceneLiveState } from './origin-scene-live-state-registry';

/**
 * F1509 — THE UNCOLLAPSED LIVE-IDENTITY RESOLVER (rederivation of the root-collapsed
 * `resolveLiveOriginIdentity` and its two patches), plus the F1508 sheet half of the
 * dismiss lane.
 *
 * Laws under proof, each with a named mutation that turns it RED:
 *  1. CHILD-DEPARTURE capture is child-keyed on BOTH axes — sceneKey (the delegate's atomic
 *     departing key) AND detent (the child's own remembered snap, not the root seat).
 *     MUTATION (the reverted collapse): resolve the detent from the root seat for children
 *     → the detent spec goes RED (the rig-proven mis-keyed child lane, one field over).
 *  2. The DISMISS lane's return address is the PER-ENTRY origin captured at PUSH COMMIT —
 *     an origin is captured at DEPARTURE, never at RETURN.
 *     MUTATION: revert captureSearchCloseOrigin to the live snapshot → the departure-vs-live
 *     scroll spec goes RED.
 *  3. The dismiss lane NEVER carries a camera, even when the per-entry origin does (D56).
 *     MUTATION: stop stripping camera in resolveSearchSessionEntryOrigin → RED.
 *  4. The docked-home lane keeps the collapsed answer BY CONSTRUCTION (red-team ruling on
 *     the F1509 row): no session entry → degenerate docked-root origin; a CHILD per-entry
 *     origin cannot ride the re-root emission and falls back to the root projection.
 */

type SnapMap = Partial<Record<OverlayKey, string>>;

type Harness = {
  controller: ReturnType<typeof createAppRouteOverlaySessionStateController>;
  setIdentity: (active: OverlayKey, root: OverlayKey) => void;
  setRouteState: (next: RouteSceneSwitchRouteStateSnapshot) => void;
  setSnap: (sceneKey: OverlayKey, snap: string) => void;
  dispose: () => void;
};

const createHarness = (): Harness => {
  let activeOverlayRouteKey: OverlayKey = 'search';
  let rootOverlayKey: OverlayKey = 'search';
  let routeState: RouteSceneSwitchRouteStateSnapshot = createRouteStateSnapshot({
    activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
    overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
  });
  const snapBySceneKey: SnapMap = {};

  const controller = createAppRouteOverlaySessionStateController({
    routeOverlayIdentityAuthority: {
      getSnapshot: () => ({ activeOverlayRouteKey, rootOverlayKey }) as never,
    },
    routeSceneSwitchActions: {
      getRouteState: () => routeState,
      getPresentationFrame: () => ({ laneKind: 'top-level' }) as never,
      subscribePresentationFrame: () => () => undefined,
      requestOverlaySwitch: () => 1,
    } as never,
    routeSearchCommandActions: {} as never,
    routeSheetSnapSessionAuthority: {
      subscribe: () => () => undefined,
      getSnapshot: () => ({ isDockedSceneDismissed: false }) as never,
    },
    routeSheetSnapSessionActions: {
      getRouteSceneSwitchSceneSnap: (sceneKey: OverlayKey) =>
        snapBySceneKey[sceneKey] ?? 'collapsed',
      recordRouteSceneSheetSettle: () => undefined,
    } as never,
  });

  return {
    controller,
    setIdentity: (active, root) => {
      activeOverlayRouteKey = active;
      rootOverlayKey = root;
    },
    setRouteState: (next) => {
      routeState = next;
    },
    setSnap: (sceneKey, snap) => {
      snapBySceneKey[sceneKey] = snap;
    },
    dispose: () => {
      controller.dispose();
    },
  };
};

const origin = (partial: Partial<OriginSnapshot> & Pick<OriginSnapshot, 'sceneKey'>) =>
  ({
    sceneParams: null,
    detent: 'middle',
    segment: null,
    scroll: [],
    camera: null,
    ...partial,
  }) as OriginSnapshot;

describe('F1509 uncollapsed live-identity resolver', () => {
  let harness: Harness;
  const unpublishers: Array<() => void> = [];

  const publish = (sceneKey: OverlayKey, lanes: Array<{ laneKey: string; offset: number }>) => {
    unpublishers.push(publishOriginSceneLiveState(sceneKey, { getScrollLanes: () => lanes }));
  };

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    unpublishers.forEach((unpublish) => unpublish());
    unpublishers.length = 0;
    harness.dispose();
  });

  describe('child-departure capture (the rig-proven mis-keyed lane, both axes)', () => {
    it('captures the CHILD sceneKey, the CHILD scroll lane, and the CHILD remembered snap', () => {
      // The rig repro shape: a followList child is live over a profile-rooted stack. Under the
      // reverted collapse the origin carried the ROOT identity — and under the reverted detent
      // patch the ROOT seat's snap. Both must be the CHILD's.
      harness.setIdentity('followList', 'profile');
      harness.setSnap('followList', 'expanded');
      harness.setSnap('lists', 'collapsed'); // the content seat the collapse would read
      publish('followList', [{ laneKey: 'followList', offset: 731 }]);

      const captured = captureRouteEntryOrigin('followList');
      expect(captured.sceneKey).toBe('followList');
      expect(captured.scroll).toEqual([{ laneKey: 'followList', offset: 731 }]);
      // RED under the reverted collapse: root-seat resolution answers 'collapsed' here.
      expect(captured.detent).toBe('expanded');
    });

    it('a child with a hidden remembered snap degrades to the seat resolution', () => {
      harness.setIdentity('followList', 'profile');
      harness.setSnap('followList', 'hidden');
      harness.setSnap('lists', 'middle'); // the content seat (root 'profile' routes here)
      const captured = captureRouteEntryOrigin('followList');
      expect(captured.detent).toBe('middle');
    });

    it('a root departure keeps the seat-routed resolution (the docked nuances)', () => {
      harness.setIdentity('lists', 'lists');
      harness.setSnap('lists', 'middle');
      const captured = captureRouteEntryOrigin('lists');
      expect(captured.sceneKey).toBe('lists');
      expect(captured.detent).toBe('middle');
    });
  });

  describe('F1508 dismiss lane — the per-entry origin IS the return address', () => {
    it('returns the origin captured at PUSH COMMIT, not a live snapshot of what is being left', () => {
      // Departure truth: search pushed from lists@middle with the list scrolled to 480.
      const departureOrigin = origin({
        sceneKey: 'lists',
        detent: 'middle',
        scroll: [{ laneKey: 'lists', offset: 480 }],
      });
      harness.setRouteState(
        pushRouteState(
          createRouteStateSnapshot({
            activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
            overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
          }),
          'search',
          undefined,
          departureOrigin
        )
      );
      harness.setIdentity('search', 'lists');
      // The LIVE state has drifted since departure — a capture-at-return would read these.
      harness.setSnap('lists', 'expanded');
      publish('lists', [{ laneKey: 'lists', offset: 999 }]);

      const closeOrigin = harness.controller.actions.captureSearchCloseOrigin({
        allowFallback: true,
        searchRootRestoreSnap: 'collapsed',
      });
      // RED under the reverted live-snapshot dismiss capture (offset 999 / detent 'expanded').
      expect(closeOrigin?.sceneKey).toBe('lists');
      expect(closeOrigin?.scroll).toEqual([{ laneKey: 'lists', offset: 480 }]);
      expect(closeOrigin?.detent).toBe('middle');
    });

    it('strips the camera from the per-entry origin — the camera return rides the pop, never this lane (D56)', () => {
      harness.setRouteState(
        pushRouteState(
          createRouteStateSnapshot({
            activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
            overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
          }),
          'search',
          undefined,
          origin({
            sceneKey: 'lists',
            camera: { center: [-97.74, 30.27], zoom: 12, padding: null },
          })
        )
      );
      harness.setIdentity('search', 'lists');
      const closeOrigin = harness.controller.actions.captureSearchCloseOrigin({
        allowFallback: true,
      });
      expect(closeOrigin?.sceneKey).toBe('lists');
      expect(closeOrigin?.camera ?? null).toBeNull();
    });

    it('docked-home lane (no session entry): the COLLAPSED answer, by construction', () => {
      // Stack is just the root — nothing was pushed, so there is no departure origin; the live
      // scene IS the docked root and the degenerate home origin is the genuinely wanted answer.
      harness.setIdentity('search', 'search');
      const closeOrigin = harness.controller.actions.captureSearchCloseOrigin({
        allowFallback: true,
        searchRootRestoreSnap: 'collapsed',
      });
      expect(closeOrigin).toEqual({
        sceneKey: 'search',
        sceneParams: null,
        detent: 'collapsed',
        segment: null,
        scroll: [],
        camera: null,
      });
    });

    it('a CHILD per-entry origin cannot ride the re-root lane — falls back to the root projection', () => {
      // A search pushed over a pollDetail child: the child return rides the pop machinery;
      // the clear-flush restore is a re-ROOT emission and must never target a child scene.
      harness.setRouteState(
        pushRouteState(
          createRouteStateSnapshot({
            activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
            overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
          }),
          'search',
          undefined,
          origin({ sceneKey: 'pollDetail', detent: 'expanded' })
        )
      );
      harness.setIdentity('search', 'polls');
      harness.setSnap('lists', 'middle'); // root 'polls'… routes to the home seat, not this
      const closeOrigin = harness.controller.actions.captureSearchCloseOrigin({
        allowFallback: true,
      });
      expect(closeOrigin?.sceneKey).toBe('polls');
    });
  });
});
