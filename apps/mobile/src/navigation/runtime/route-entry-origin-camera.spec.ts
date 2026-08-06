import type { CameraSnapshot } from './app-route-profile-transition-state-contract';
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';
import type { OverlayKey } from './app-overlay-route-types';
import {
  ROOT_SEARCH_ROUTE_ENTRY,
  createRouteStateSnapshot,
  popToEntryRouteState,
  popToRootRouteState,
  pushRouteState,
  resolveSessionDismissPlan,
  type RouteSceneSwitchRouteStateSnapshot,
} from './app-overlay-route-stack-algebra';
import { createAppRouteOverlaySessionStateController } from './app-route-overlay-session-state-controller';
import {
  captureRouteEntryOrigin,
  stageRouteEntryOriginRestore,
} from './route-entry-origin-capture-delegate';
import {
  registerRouteEntryOriginCameraPort,
  resetRouteEntryOriginCameraPortForTests,
} from './route-entry-origin-camera-delegate';
import {
  consumePendingOriginSceneSegmentRestore,
  stageOriginSceneSegmentRestore,
} from '../../overlays/originSceneSegmentRuntime';
import { CameraIntentArbiter } from '../../screens/Search/runtime/map/camera-intent-arbiter';
import { resolveRouteEntryOriginCamera } from '../../screens/Search/runtime/shared/route-entry-origin-camera-source';

/** F2402: `stageRouteEntryOriginRestore` takes a NON-NULLABLE origin now — the seam no
 *  longer has a silent null arm. Every entry these cases pop is a PUSHED entry, so its
 *  origin is non-null by the capture contract; a null here is a defect in the case, and
 *  this helper fails loudly instead of silently staging nothing. */
const stagePoppedOrigin = (origin: OriginSnapshot | null | undefined): void => {
  expect(origin).not.toBeNull();
  expect(origin).not.toBeUndefined();
  stageRouteEntryOriginRestore(origin as OriginSnapshot);
};

/**
 * D56 — RETURN-TO-ORIGIN CAMERA (findings F1500-F1516).
 *
 * The law under test, owner-verbatim: "the map returns to the EXACT position where the search
 * flow was triggered". D56 makes that the SAME snapshot, taken at the SAME instant, at the SAME
 * chokepoint as the sheet's return-to-origin — a seventh field on OriginSnapshot.
 *
 * These specs drive the REAL production seam: the real session-state controller (which registers
 * both the capture arm and the restore arm), the real capture/restore delegates, the real stack
 * algebra, the real dismiss-plan resolver, and the real CameraIntentArbiter. The only spec-
 * authored glue is the one line each pop verb writes in production — "stage the origin of the
 * entry this pop removes" — which is quoted from the call sites it mirrors.
 */

// ---------------------------------------------------------------------------------------------
// Harness

type Recorded = { requestOverlaySwitch: Array<Record<string, unknown>> };

const camera = (lng: number, lat: number, zoom: number): CameraSnapshot => ({
  center: [lng, lat],
  zoom,
  padding: null,
});

const HOME_CAMERA = camera(-97.74, 30.27, 12);
const PROFILE_CAMERA = camera(-97.71, 30.29, 16);
const LIST_WORLD_CAMERA = camera(-97.6, 30.4, 9);
const POLL_DETAIL_CAMERA = camera(-73.99, 40.72, 14);

type Harness = {
  controller: ReturnType<typeof createAppRouteOverlaySessionStateController>;
  recorded: Recorded;
  /** what the map "is showing" — what the capture port reads at the next push commit */
  setLiveCamera: (next: CameraSnapshot | null) => void;
  /** every camera the restore lane committed, in order */
  committedCameras: CameraSnapshot[];
  setLiveScene: (sceneKey: OverlayKey) => void;
  dispose: () => void;
};

const createHarness = (): Harness => {
  const recorded: Recorded = { requestOverlaySwitch: [] };
  const committedCameras: CameraSnapshot[] = [];
  let liveCamera: CameraSnapshot | null = HOME_CAMERA;
  let liveSceneKey: OverlayKey = 'search';
  const routeState: RouteSceneSwitchRouteStateSnapshot = createRouteStateSnapshot({
    activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
    overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
  });

  const unregisterCameraPort = registerRouteEntryOriginCameraPort({
    readOriginCamera: () => (liveCamera == null ? null : { ...liveCamera }),
    commitOriginCamera: (next) => {
      committedCameras.push(next);
    },
  });

  const controller = createAppRouteOverlaySessionStateController({
    routeOverlayIdentityAuthority: {
      // F1509: the resolver is uncollapsed — the identity snapshot serves BOTH facts.
      getSnapshot: () =>
        ({ activeOverlayRouteKey: liveSceneKey, rootOverlayKey: liveSceneKey }) as never,
    },
    routeSceneSwitchActions: {
      getRouteState: () => routeState,
      getPresentationFrame: () => ({ laneKind: 'top-level' }) as never,
      subscribePresentationFrame: () => () => undefined,
      requestOverlaySwitch: (args: Record<string, unknown>) => {
        recorded.requestOverlaySwitch.push(args);
        return 1;
      },
    } as never,
    routeSearchCommandActions: {} as never,
    routeSheetSnapSessionAuthority: {
      subscribe: () => () => undefined,
      getSnapshot: () => ({ isDockedSceneDismissed: false }) as never,
    },
    routeSheetSnapSessionActions: {
      getRouteSceneSwitchSceneSnap: () => 'collapsed',
      recordRouteSceneSheetSettle: () => undefined,
    } as never,
  });

  return {
    controller,
    recorded,
    committedCameras,
    setLiveCamera: (next) => {
      liveCamera = next;
    },
    setLiveScene: (sceneKey) => {
      liveSceneKey = sceneKey;
    },
    dispose: () => {
      controller.dispose();
      unregisterCameraPort();
      resetRouteEntryOriginCameraPortForTests();
    },
  };
};

/** The production push: capture the departing scene's origin, then stack the entry with it. */
const pushFrom = (
  routeState: RouteSceneSwitchRouteStateSnapshot,
  departingSceneKey: OverlayKey,
  pushedSceneKey: OverlayKey
): RouteSceneSwitchRouteStateSnapshot =>
  pushRouteState(routeState, pushedSceneKey, undefined, captureRouteEntryOrigin(departingSceneKey));

// ---------------------------------------------------------------------------------------------

describe('D56 return-to-origin camera', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  describe('capture at PUSH COMMIT, per entry-point class', () => {
    // The D55/D56 entry-point table. Every row is the same assertion — the origin carries the
    // camera the map was showing WHEN THE FLOW WAS TRIGGERED — because after D56 there is only
    // one capture path for all of them.
    it('restaurant tap from home captures the HOME camera on the pushed entry', () => {
      harness.setLiveCamera(HOME_CAMERA);
      const next = pushFrom(
        createRouteStateSnapshot({
          activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
          overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
        }),
        'search',
        'restaurant'
      );
      expect(next.activeOverlayRoute.origin?.camera).toEqual(HOME_CAMERA);
    });

    it('LIST LAUNCH captures the departing camera even though committedBounds is null (F1502)', () => {
      // The F1502 repro, verbatim: home → restaurant → open a list FROM that profile. The old
      // camera lane keyed its slot to `committedBounds`, which `launchListSearchResults` sets to
      // null BY DESIGN (a list world is bounds-independent) — so the slot kept the HOME camera
      // and the dismiss flew the map back to home instead of the profile the list was opened
      // from. Capture is now bounds-independent: it reads the map, not the fetch.
      let routeState = createRouteStateSnapshot({
        activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
        overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
      });
      harness.setLiveCamera(HOME_CAMERA);
      routeState = pushFrom(routeState, 'search', 'restaurant');
      harness.setLiveCamera(PROFILE_CAMERA);
      harness.setLiveScene('profile');
      routeState = pushFrom(routeState, 'profile', 'listDetail');

      expect(routeState.activeOverlayRoute.origin?.camera).toEqual(PROFILE_CAMERA);

      // …and dismissing the list returns to the PROFILE camera, not home.
      stagePoppedOrigin(routeState.activeOverlayRoute.origin);
      expect(harness.committedCameras).toEqual([PROFILE_CAMERA]);
    });

    it('COMMENT-SPAN entry captures the pollDetail camera', () => {
      harness.setLiveScene('pollDetail');
      harness.setLiveCamera(POLL_DETAIL_CAMERA);
      const next = pushFrom(
        createRouteStateSnapshot({
          activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
          overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
        }),
        'pollDetail',
        'search'
      );
      expect(next.activeOverlayRoute.origin?.camera).toEqual(POLL_DETAIL_CAMERA);
      expect(next.activeOverlayRoute.origin?.sceneKey).toBe('pollDetail');
    });

    it('a PAN AFTER the trigger does NOT move the captured origin (owner law, verbatim)', () => {
      harness.setLiveCamera(HOME_CAMERA);
      const next = pushFrom(
        createRouteStateSnapshot({
          activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
          overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
        }),
        'search',
        'restaurant'
      );
      // the user drags the map around inside the revealed world
      harness.setLiveCamera(camera(-1, -1, 3));
      stagePoppedOrigin(next.activeOverlayRoute.origin);
      expect(harness.committedCameras).toEqual([HOME_CAMERA]);
    });

    it('captures null — never a guess — when no camera is knowable', () => {
      harness.setLiveCamera(null);
      const next = pushFrom(
        createRouteStateSnapshot({
          activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
          overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
        }),
        'search',
        'restaurant'
      );
      expect(next.activeOverlayRoute.origin?.camera).toBeNull();
      stagePoppedOrigin(next.activeOverlayRoute.origin);
      expect(harness.committedCameras).toEqual([]);
    });
  });

  describe('nested flows unwind the stack IN ORDER (F1504)', () => {
    it('pops restore each entry in reverse push order — never one shared slot', () => {
      // F1504's opposite-directions case: the sheet unwinds to the bottom of the flow while the
      // old camera slot tracked the LATEST search commit, so in ANY session with more than one
      // world the two lanes restored two different places. The camera is on the entry now, so
      // "the stack gives nesting" is not a claim — it is the same data structure.
      let routeState = createRouteStateSnapshot({
        activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
        overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
      });
      harness.setLiveCamera(HOME_CAMERA);
      routeState = pushFrom(routeState, 'search', 'search');
      harness.setLiveCamera(PROFILE_CAMERA);
      routeState = pushFrom(routeState, 'search', 'restaurant');
      harness.setLiveCamera(LIST_WORLD_CAMERA);
      routeState = pushFrom(routeState, 'profile', 'listDetail');

      const popOnce = () => {
        stagePoppedOrigin(routeState.activeOverlayRoute.origin);
        routeState = popToEntryRouteState(
          routeState,
          routeState.overlayRouteStack[routeState.overlayRouteStack.length - 2]!.entryId
        );
      };
      popOnce();
      popOnce();
      popOnce();

      expect(harness.committedCameras).toEqual([LIST_WORLD_CAMERA, PROFILE_CAMERA, HOME_CAMERA]);
    });
  });

  describe('per-pop restore for pops that keep a world ALIVE (F1505)', () => {
    it('popToEntry beneath a surviving world restores the camera (the old lane restored nothing)', () => {
      // The old restore fired ONLY on the set→idle tuple transition. A dismiss that pops to a
      // surviving world-bearing entry never idles the tuple, so the sheet returned and the map
      // stayed wherever the dismissed world's fitAll left it — "sometimes it gets stuck".
      let routeState = createRouteStateSnapshot({
        activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
        overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
      });
      harness.setLiveCamera(POLL_DETAIL_CAMERA);
      routeState = pushFrom(routeState, 'pollDetail', 'pollDetail');
      harness.setLiveCamera(PROFILE_CAMERA);
      routeState = pushFrom(routeState, 'pollDetail', 'search');
      harness.setLiveCamera(LIST_WORLD_CAMERA);
      routeState = pushFrom(routeState, 'search', 'restaurant');

      // the pollDetail child beneath the session survives — the real resolver picks it
      const plan = resolveSessionDismissPlan({
        ...routeState,
        overlayRouteStack: routeState.overlayRouteStack.map((entry, index) =>
          index === 2 ? ({ ...entry, desire: { worldKey: 'w' } } as never) : entry
        ),
      });
      expect(plan.kind).toBe('popToEntry');

      // production (app-overlay-route-command-runtime popToEntryRoute): the revealed entry's
      // presentation restores from the entry directly ABOVE it.
      const targetIndex = routeState.overlayRouteStack.findIndex(
        (entry) => entry.entryId === (plan as { entryId: string }).entryId
      );
      stagePoppedOrigin(routeState.overlayRouteStack[targetIndex + 1]?.origin);
      expect(harness.committedCameras).toEqual([PROFILE_CAMERA]);
    });

    it('popToRoot restores the DEEPEST pushed entry camera (the presentation the root departed from)', () => {
      let routeState = createRouteStateSnapshot({
        activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
        overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
      });
      harness.setLiveCamera(HOME_CAMERA);
      routeState = pushFrom(routeState, 'lists', 'search');
      harness.setLiveCamera(PROFILE_CAMERA);
      routeState = pushFrom(routeState, 'search', 'restaurant');

      // production (popToRootRoute): stack[1]'s origin, not the top entry's.
      stagePoppedOrigin(routeState.overlayRouteStack[1]?.origin);
      routeState = popToRootRouteState(routeState);
      expect(harness.committedCameras).toEqual([HOME_CAMERA]);
    });
  });

  describe('the camera can NEVER reach the degenerate home emission', () => {
    const feedThrough = (origin: OriginSnapshot) => {
      harness.controller.actions.restoreSearchCloseOrigin(origin);
      return harness.recorded.requestOverlaySwitch;
    };

    it('a CAMERA-BEARING degenerate home origin still emits the golden home switch', () => {
      // The RED case, fed through on purpose: if a future edit ever attaches the origin camera
      // to the emission as a `cameraIntent` (or lets the camera flip the richness gate and take
      // the rich branch), this spec fails — and so does the golden assertion, which throws.
      const emissions = feedThrough({
        sceneKey: 'search',
        sceneParams: null,
        detent: 'collapsed',
        segment: null,
        scroll: [],
        anchor: null,
        camera: HOME_CAMERA,
      });
      expect(emissions).toHaveLength(1);
      expect(emissions[0]).toEqual({
        targetSceneKey: 'search',
        sheetTransitionKind: 'topLevelSwitch',
        sheetOpenerSource: 'routeCommand',
        sheetMotion: { kind: 'snapTo', snap: 'collapsed' },
        dockedSceneRestoreSnap: 'collapsed',
      });
      expect(emissions[0]).not.toHaveProperty('cameraIntent');
    });

    it('takes the DEGENERATE SHORT-CIRCUIT — the camera is not a richness axis', () => {
      // The two branches happen to emit the same args for a collapsed home origin, so arg
      // equality alone cannot tell which one ran. The rich branch ALSO seeds scene-restore
      // state; the degenerate short-circuit returns before it. A pending segment that survives
      // the restore proves the short-circuit (and therefore the golden assertion) ran — if a
      // future edit makes `camera` flip isDegenerateHomeOrigin, this goes RED.
      stageOriginSceneSegmentRestore('search', 'contributed');
      feedThrough({
        sceneKey: 'search',
        sceneParams: null,
        detent: 'collapsed',
        segment: null,
        scroll: [],
        anchor: null,
        camera: HOME_CAMERA,
      });
      expect(consumePendingOriginSceneSegmentRestore('search')).toBe('contributed');
    });

    it('is byte-identical to the camera-less home emission', () => {
      const withCamera = createHarness();
      withCamera.controller.actions.restoreSearchCloseOrigin({
        sceneKey: 'search',
        sceneParams: null,
        detent: 'collapsed',
        segment: null,
        scroll: [],
        anchor: null,
        camera: PROFILE_CAMERA,
      });
      const withoutCamera = createHarness();
      withoutCamera.controller.actions.restoreSearchCloseOrigin({
        sceneKey: 'search',
        sceneParams: null,
        detent: 'collapsed',
        segment: null,
        scroll: [],
        anchor: null,
        camera: null,
      });
      expect(withCamera.recorded.requestOverlaySwitch).toEqual(
        withoutCamera.recorded.requestOverlaySwitch
      );
      withCamera.dispose();
      withoutCamera.dispose();
    });
  });

  describe('the DISMISS-TIME lane carries no camera (the fourth ledger is closed, F1508)', () => {
    it('captureSearchCloseOrigin never captures a camera, however live the map is', () => {
      harness.setLiveCamera(PROFILE_CAMERA);
      const closeOrigin = harness.controller.actions.captureSearchCloseOrigin({
        allowFallback: true,
        searchRootRestoreSnap: 'collapsed',
      });
      // An origin is captured at DEPARTURE, never at RETURN: a camera here would fly the map to
      // the world being dismissed.
      expect(closeOrigin?.camera ?? null).toBeNull();
    });
  });

  describe('an in-flight programmatic intent WINS over the observed viewport (D56 ruling (a))', () => {
    it('resolves the arbiter target while a fly-to is in flight, the viewport once settled', () => {
      const arbiter = new CameraIntentArbiter({
        setMapCenter: () => undefined,
        setMapZoom: () => undefined,
        setMapBearing: () => undefined,
        setMapPitch: () => undefined,
        setMapCameraAnimation: () => undefined,
      });
      // settled: no pending completion → no target
      expect(arbiter.getInFlightCameraTarget()).toBeNull();
      expect(
        resolveRouteEntryOriginCamera({
          inFlightCameraTarget: arbiter.getInFlightCameraTarget(),
          liveViewportCamera: { center: HOME_CAMERA.center, zoom: HOME_CAMERA.zoom },
          livePadding: null,
        })
      ).toEqual({ source: 'viewport', camera: HOME_CAMERA });

      // a fly-to is committed and still animating
      arbiter.commit({
        center: PROFILE_CAMERA.center,
        zoom: PROFILE_CAMERA.zoom,
        animationMode: 'easeTo',
        animationDurationMs: 400,
      });
      expect(arbiter.hasPendingProgrammaticCameraCompletion()).toBe(true);
      expect(
        resolveRouteEntryOriginCamera({
          // the map is mid-flight and the observed viewport is an intermediate frame
          inFlightCameraTarget: arbiter.getInFlightCameraTarget(),
          liveViewportCamera: { center: [-97.73, 30.28], zoom: 13.4 },
          livePadding: null,
        })
      ).toEqual({ source: 'arbiterTarget', camera: PROFILE_CAMERA });

      // once the animation resolves the observed viewport is the truth again
      arbiter.resolvePendingProgrammaticCameraAnimation('finished');
      expect(arbiter.getInFlightCameraTarget()).toBeNull();
    });

    it('keeps the padded shape the profile ledger used to own (band centering survives)', () => {
      const padding = { paddingTop: 120, paddingBottom: 380, paddingLeft: 0, paddingRight: 0 };
      expect(
        resolveRouteEntryOriginCamera({
          inFlightCameraTarget: null,
          liveViewportCamera: { center: PROFILE_CAMERA.center, zoom: PROFILE_CAMERA.zoom },
          livePadding: padding,
        }).camera?.padding
      ).toEqual(padding);
    });
  });
});
