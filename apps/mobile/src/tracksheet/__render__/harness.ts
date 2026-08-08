// ─── THE RENDER-LANE HARNESS (transition contract F3) ────────────────────────
//
// One shared mutable world every mock reads from and records into. The mocks
// are THIN: controllable data in, call records out — no host logic lives here.
// Tests drive the world (frame flips, publications, native events, scroll
// facts) and assert on what the REAL host/page wiring did with it.

import { resetTrackMotionAuthorityForTest } from '../track-motion-authority';
import {
  TRACK_NATIVE_CONTRACT_VERSION,
  TRACK_NATIVE_REQUIRED_CAPABILITIES,
} from '../track-native-contract';

type Listener = () => void;

export type HarnessFrame = {
  presentedSceneKey: string | null;
  activeSceneKey: string | null;
  presentedEntryId: string | null;
  activeEntryId: string | null;
  switchId: number;
};

type SceneInputSnapshot = {
  sceneBodyContent: unknown;
  sceneBodyForEntryId?: string | null;
} | null;

type PartsSpec = {
  sceneBodyContent: Record<string, unknown> & { surfaceKind: string };
  sceneBodyTransport: { onUserListScrollActivity?: (o: number, d: number) => void };
};

const makeStore = <T>(initial: T) => {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      [...listeners].forEach((listener) => listener());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type NativeCall = { name: string; args: unknown[] };

const buildWorld = () => {
  // ── presentation frame ──
  const frameStore = makeStore<HarnessFrame>({
    presentedSceneKey: 'home',
    activeSceneKey: 'home',
    presentedEntryId: null,
    activeEntryId: null,
    switchId: 1,
  });

  // ── native TrackScrollPhysics module (the boundary stub) ──
  const nativeCalls: NativeCall[] = [];
  const record = (name: string, args: unknown[]) => {
    nativeCalls.push({ name, args });
  };
  // snapTo answers with the native outcome contract (G-HIDDEN native red
  // team): refused when a drag owns τ, hiddenGeneration minted per hidden
  // excursion (negative target). Tests may override per-call via
  // nextSnapOutcome.
  let hiddenGenerationCounter = 0;
  // The hidden DEPTH is native now (ratified item 5): JS commands the intent
  // through snapToHidden and the engine answers with the τ it aimed at. The
  // stub derives it the same way TrackHiddenDepthForBounds does, from this
  // world's geometry (collapsedTop 700, screen 844).
  const HIDDEN_TARGET_TAU = -(844 - 700);
  const nativePhysics = {
    attach: (tag: number, cfg: unknown) => {
      record('attach', [tag, cfg]);
      return Promise.resolve();
    },
    detach: (tag: number) => record('detach', [tag]),
    // The contract handshake's native half: constants a real binary exports.
    contractVersion: TRACK_NATIVE_CONTRACT_VERSION,
    capabilities: [...TRACK_NATIVE_REQUIRED_CAPABILITIES],
    snapTo: (tag: number, tau: number) => {
      record('snapTo', [tag, tau]);
      const override = world.nextSnapOutcome;
      if (override != null) {
        return Promise.resolve(override(tag, tau));
      }
      return Promise.resolve({ refused: false, targetTau: tau });
    },
    snapToHidden: (tag: number) => {
      record('snapToHidden', [tag]);
      const override = world.nextSnapOutcome;
      if (override != null) {
        return Promise.resolve(override(tag, HIDDEN_TARGET_TAU));
      }
      hiddenGenerationCounter += 1;
      world.lastHiddenGeneration = hiddenGenerationCounter;
      return Promise.resolve({
        refused: false,
        targetTau: HIDDEN_TARGET_TAU,
        hiddenGeneration: hiddenGenerationCounter,
      });
    },
    refuse: (tag: number, offset: number) => record('refuse', [tag, offset]),
    pinChrome: (tag: number, contentTag: number | null) => record('pinChrome', [tag, contentTag]),
    bindShell: (tag: number, cfg: unknown) => record('bindShell', [tag, cfg]),
    // auditShell deliberately absent: the host skips the audit poll body.
  };

  // ── native event emitter registry ──
  const emitterListeners = new Map<string, Set<(payload: unknown) => void>>();

  // ── transition transaction ──
  const txn = {
    live: null as null | {
      phase: string;
      plan: { content: { kind: string } };
      mutation: { targetSceneKey: string };
    },
    offers: [] as string[],
    amends: [] as string[][],
    seals: 0,
  };

  // ── search surface runtime (the sheet-leg fence's home) ──
  const surfaceListeners = new Set<Listener>();
  const surface = {
    redrawTxnId: null as string | null,
    readyMarks: [] as string[],
    motionPendingMarks: [] as string[],
    publish: () => {
      [...surfaceListeners].forEach((listener) => listener());
    },
    runtime: {
      getActiveOrPendingRedrawTransactionId: () => surface.redrawTxnId,
      markRedrawSheetReady: (id: string) => {
        surface.readyMarks.push(id);
      },
      markRedrawSheetMotionPending: (id: string) => {
        surface.motionPendingMarks.push(id);
      },
      subscribe: (listener: Listener) => {
        surfaceListeners.add(listener);
        return () => {
          surfaceListeners.delete(listener);
        };
      },
    },
  };

  // ── assistive tech (G-A11Y): what the track SAID and where it moved the
  //    screen-reader cursor. Announcements are recorded in order; focus targets
  //    are the node handles the RN mock mints per view instance.
  const a11y = {
    announcements: [] as string[],
    focusHandles: [] as number[],
    /** handle → the mocked node it names (so a focus target is identifiable). */
    nodesByHandle: new Map<number, unknown>(),
  };

  // ── scene-input publication lane ──
  const sceneInputListeners = new Map<string, Set<Listener>>();
  const sceneInputSnapshots = new Map<string, SceneInputSnapshot>();
  const publishSceneInput = (scene: string, snapshot: SceneInputSnapshot) => {
    sceneInputSnapshots.set(scene, snapshot);
    [...(sceneInputListeners.get(scene) ?? [])].forEach((listener) => listener());
  };

  // ── list-parts hooks (polls / home lanes) ──
  const partsStore = makeStore<{ polls: PartsSpec; home: PartsSpec }>({
    polls: {
      sceneBodyContent: { surfaceKind: 'placeholder' },
      sceneBodyTransport: {},
    },
    home: {
      sceneBodyContent: {
        surfaceKind: 'list',
        data: ['home-row-1'],
        renderItem: null,
        keyExtractor: undefined,
      },
      sceneBodyTransport: {},
    },
  });

  // ── route state / motion runtime / controllers ──
  const routeState = {
    overlayRouteStack: [] as Array<{ entryId: string; sceneKey?: string }>,
    activeOverlayRoute: { entryId: '' } as { entryId: string },
  };
  const settleCompletions: number[] = [];
  const paintAcks: number[] = [];
  const chromeAcks: string[] = [];
  const gestureSettles: unknown[] = [];
  const world = {
    frameStore,
    nativeCalls,
    nativePhysics,
    emitterListeners,
    emit: (name: string, payload?: unknown) => {
      [...(emitterListeners.get(name) ?? [])].forEach((listener) => listener(payload));
    },
    txn,
    surface,
    a11y,
    sceneInputListeners,
    sceneInputSnapshots,
    publishSceneInput,
    partsStore,
    routeState,
    settleCompletions,
    paintAcks,
    chromeAcks,
    gestureSettles,
    deliveredActivity: new Map<string, unknown>(),
    // Scenes whose mock mounted body renders the REAL SceneBodyReadyGate with an
    // unready query (pending=true). Default empty: other specs' body/skeleton
    // counts are untouched. The gate falsifier adds a scene here to prove the
    // track host provides SceneBodySceneKeyContext (blank-pending regression).
    mountedBodyPendingScenes: new Set<string>(),
    nextSnapOutcome: null as
      | null
      | ((
          tag: number,
          tau: number
        ) => { refused?: boolean; hiddenGeneration?: number; targetTau?: number }),
    lastHiddenGeneration: 0,
    motionTarget: null as null | {
      sceneKey: string;
      resolveCurrentSnapTarget: () => unknown;
      motionCommandValue: {
        value: { snapTo: string; token: number; settleToken?: number | null } | null;
      };
    },
    sceneRuntime: {} as Record<string, unknown>,
    sharedSheetOwner: {} as Record<string, unknown>,
  };

  world.sceneRuntime = {
    routeSceneSwitchRuntime: {
      getRouteState: () => world.routeState,
      commitPresentationPaintAck: (switchId: number) => {
        paintAcks.push(switchId);
      },
    },
    sceneInputAuthority: {
      getSceneInputSnapshot: (scene: string) => sceneInputSnapshots.get(scene) ?? null,
      subscribeSceneBody: (scene: string, listener: Listener) => {
        const set = sceneInputListeners.get(scene) ?? new Set<Listener>();
        sceneInputListeners.set(scene, set);
        set.add(listener);
        return () => {
          set.delete(listener);
        };
      },
    },
    routeSceneMotionRuntime: {
      registerSheetMotionTarget: (target: NonNullable<typeof world.motionTarget>) => {
        world.motionTarget = target;
        return () => {
          if (world.motionTarget === target) {
            world.motionTarget = null;
          }
        };
      },
      completeFromSheetSettle: (token: number) => {
        settleCompletions.push(token);
      },
    },
    routeSheetSnapSessionActions: {
      recordRouteSceneSheetSettle: (args: unknown) => {
        gestureSettles.push(args);
      },
    },
    routeHostVisualRuntimeAuthority: {},
  };

  world.sharedSheetOwner = {
    snapPoints: { expanded: 100, middle: 400, collapsed: 700 },
    sheetTranslateY: { value: 0 },
    sheetScrollOffset: { value: 0 },
  };

  return world;
};

export type HarnessWorld = ReturnType<typeof buildWorld>;

export const harness: { world: HarnessWorld } = { world: buildWorld() };

export const resetHarness = (): HarnessWorld => {
  // The motion authority is a module singleton (one authority per app): a prior
  // test's live episode would make the next test's sheet "already moving".
  resetTrackMotionAuthorityForTest();
  harness.world = buildWorld();
  return harness.world;
};
