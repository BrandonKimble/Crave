/**
 * D45/F958 Cluster A — the overlay relay's COMPOSITE proof.
 *
 * This spec exists to make the collapse of the overlay relay (15 hops → 4 authorities)
 * provable rather than plausible. It wires the relay exactly as the runtime hooks do
 * (`use-search-root-overlay-local-restaurant-*-runtime.ts`), drives a scripted sequence of
 * SOURCE mutations, and records the terminal `SearchOverlayLocalRestaurantSheetHostSnapshot`
 * after every step, plus the terminal publication count.
 *
 * THE LAW: `RELAY_COMPOSITE_TRANSCRIPT` must be byte-identical after every hop of the
 * collapse. Only the wiring inside `buildRelay` may change.
 *
 * The second assertion is the F1608 metric: the number of listener fan-outs a single
 * binding-field re-mint costs as it walks the relay. That number is EXPECTED to fall as
 * hops die; it is recorded, not frozen.
 */
import { createSearchOverlayLocalRestaurantRouteVisualStateController } from './search-overlay-local-restaurant-route-visual-state-controller';
import { createSearchOverlayLocalRestaurantSheetControlSelectionStateController } from './search-overlay-local-restaurant-sheet-control-selection-state-controller';
import { createSearchOverlayLocalRestaurantSheetHostController } from './search-overlay-local-restaurant-sheet-host-controller';
import { createSearchOverlayLocalRestaurantSheetVisualStateController } from './search-overlay-local-restaurant-sheet-visual-state-controller';

type Listener = () => void;

/** A minimal stand-in for the source authorities the relay subscribes to. */
class SourceAuthority<T> {
  private snapshot: T;

  private readonly listeners = new Set<Listener>();

  public constructor(initial: T) {
    this.snapshot = initial;
  }

  public readonly authority = {
    subscribe: (listener: Listener): (() => void) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    },
    getSnapshot: (): T => this.snapshot,
  };

  public publish(next: T): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

/** Stable tags for opaque object/function identities so the transcript is comparable. */
const createIdentityTagger = (): ((value: unknown, prefix: string) => string) => {
  const tags = new Map<unknown, string>();
  let nextId = 0;
  return (value: unknown, prefix: string): string => {
    const existing = tags.get(value);
    if (existing != null) {
      return existing;
    }
    nextId += 1;
    const tag = `${prefix}#${String(nextId)}`;
    tags.set(value, tag);
    return tag;
  };
};

const opaque = (label: string): never => ({ label }) as never;

type RelayHarness = {
  geometry: SourceAuthority<never>;
  motion: SourceAuthority<never>;
  routeSheet: SourceAuthority<never>;
  visibility: SourceAuthority<never>;
  profilerGate: SourceAuthority<never>;
  session: SourceAuthority<never>;
  panelContent: SourceAuthority<never>;
  policy: SourceAuthority<never>;
  interaction: SourceAuthority<never>;
  terminal: {
    subscribe: (listener: Listener) => () => void;
    getSnapshot: () => unknown;
  };
  /** Every publishing hop in the relay, for the F1608 fan-out metric. */
  hops: Array<{ subscribe: (listener: Listener) => () => void }>;
  dispose: () => void;
};

/**
 * The interaction handlers are reached through a STABLE façade on the ControlSelection
 * authority, so their identity in the transcript never changes. Identity is therefore not
 * enough: the façade must also DISPATCH to the freshest source handler. Each source handler
 * records its own name into this log, and the script invokes the façades after swapping the
 * interaction source — that is the only thing that can catch a freshness write going stale
 * (F1607), which is exactly the machinery this collapse rewrote.
 */
const dispatchLog: string[] = [];

const namedToggle =
  (name: string) =>
  (_id: string, _locationId?: string | null): void => {
    dispatchLog.push(`toggle:${name}`);
  };
const namedClose = (name: string) => (): void => {
  dispatchLog.push(`close:${name}`);
};

const NOOP_TOGGLE = namedToggle('initial');
const NOOP_CLOSE = namedClose('initial');

const buildRelay = (): RelayHarness => {
  const geometry = new SourceAuthority<never>(null as never);
  const motion = new SourceAuthority<never>(null as never);
  const routeSheet = new SourceAuthority<never>(null as never);
  const visibility = new SourceAuthority<never>({ shouldRenderSearchOverlay: false } as never);
  const profilerGate = new SourceAuthority<never>({ onProfilerRender: null } as never);
  const session = new SourceAuthority<never>(opaque('session-0'));
  const panelContent = new SourceAuthority<never>({
    restaurantPanelSnapshot: null,
    suggestionProgress: null,
  } as never);
  const policy = new SourceAuthority<never>({
    shouldSuppressRestaurantOverlay: false,
    shouldFreezeRestaurantPanelContent: false,
    shouldEnableRestaurantOverlayInteraction: false,
  } as never);
  const interaction = new SourceAuthority<never>({
    onToggleFavorite: NOOP_TOGGLE,
    closeRestaurantProfile: NOOP_CLOSE,
  } as never);

  // --- RouteFrame lane -------------------------------------------------------------
  const routeVisual = createSearchOverlayLocalRestaurantRouteVisualStateController({
    routeHostOverlayGeometryAuthority: geometry.authority,
    routeHostVisualRuntimeAuthority: motion.authority,
    routeSharedSheetVisualAuthority: routeSheet.authority,
  });

  // --- SheetVisual / Presence lane -------------------------------------------------
  const sheetVisual = createSearchOverlayLocalRestaurantSheetVisualStateController({
    routeOverlayVisibilityAuthority: visibility.authority,
    localRestaurantSheetProfilerGateAuthority: profilerGate.authority,
    localRestaurantRouteVisualAuthority: routeVisual.outputAuthority,
  });

  // --- ControlSelection lane -------------------------------------------------------
  const controlSelection = createSearchOverlayLocalRestaurantSheetControlSelectionStateController({
    overlayLocalRestaurantPanelContentHostAuthority: panelContent.authority,
    overlayLocalRestaurantPolicyHostAuthority: policy.authority,
    overlayLocalRestaurantInteractionHostAuthority: interaction.authority,
  });

  // --- SheetHost (terminal) --------------------------------------------------------
  const sheetHost = createSearchOverlayLocalRestaurantSheetHostController({
    overlayLocalRestaurantSessionHostAuthority: session.authority,
    localRestaurantSheetControlSelectionAuthority: controlSelection.outputAuthority,
    localRestaurantSheetVisualHostAuthority: sheetVisual.outputAuthority,
  });

  const disposables = [
    routeVisual,
    sheetVisual,
    controlSelection,
    sheetHost,
  ];

  return {
    geometry,
    motion,
    routeSheet,
    visibility,
    profilerGate,
    session,
    panelContent,
    policy,
    interaction,
    terminal: sheetHost.outputAuthority,
    hops: disposables.map((controller) => controller.outputAuthority),
    dispose: () => {
      disposables.forEach((controller) => {
        controller.dispose();
      });
    },
  };
};

const projectTerminal = (
  snapshot: ReturnType<RelayHarness['terminal']['getSnapshot']>,
  tag: (value: unknown, prefix: string) => string
): unknown => {
  const typed = snapshot as {
    restaurantSessionSnapshot: unknown;
    restaurantControlSelectionSnapshot: {
      restaurantPanelSnapshot: unknown;
      suggestionProgress: unknown;
      shouldSuppressRestaurantOverlay: boolean;
      shouldFreezeRestaurantPanelContent: boolean;
      shouldEnableRestaurantOverlayInteraction: boolean;
      onToggleFavorite: unknown;
      closeRestaurantProfile: unknown;
    };
    shouldRenderSearchOverlay: boolean;
    routeHostVisualSnapshot: {
      overlayGeometryRuntime: unknown;
      sharedSheetRuntimeOwner: unknown;
      visualRuntime: unknown;
    } | null;
    onProfilerRender: unknown;
  };

  return {
    restaurantSessionSnapshot: tag(typed.restaurantSessionSnapshot, 'session'),
    restaurantControlSelectionSnapshot: {
      restaurantPanelSnapshot:
        typed.restaurantControlSelectionSnapshot.restaurantPanelSnapshot == null
          ? null
          : tag(typed.restaurantControlSelectionSnapshot.restaurantPanelSnapshot, 'panel'),
      suggestionProgress:
        typed.restaurantControlSelectionSnapshot.suggestionProgress == null
          ? null
          : tag(typed.restaurantControlSelectionSnapshot.suggestionProgress, 'progress'),
      shouldSuppressRestaurantOverlay:
        typed.restaurantControlSelectionSnapshot.shouldSuppressRestaurantOverlay,
      shouldFreezeRestaurantPanelContent:
        typed.restaurantControlSelectionSnapshot.shouldFreezeRestaurantPanelContent,
      shouldEnableRestaurantOverlayInteraction:
        typed.restaurantControlSelectionSnapshot.shouldEnableRestaurantOverlayInteraction,
      onToggleFavorite: tag(typed.restaurantControlSelectionSnapshot.onToggleFavorite, 'toggle'),
      closeRestaurantProfile: tag(
        typed.restaurantControlSelectionSnapshot.closeRestaurantProfile,
        'close'
      ),
    },
    shouldRenderSearchOverlay: typed.shouldRenderSearchOverlay,
    routeHostVisualSnapshot:
      typed.routeHostVisualSnapshot == null
        ? null
        : {
            overlayGeometryRuntime: tag(
              typed.routeHostVisualSnapshot.overlayGeometryRuntime,
              'geometry'
            ),
            sharedSheetRuntimeOwner: tag(
              typed.routeHostVisualSnapshot.sharedSheetRuntimeOwner,
              'sheet'
            ),
            visualRuntime: tag(typed.routeHostVisualSnapshot.visualRuntime, 'visual'),
          },
    onProfilerRender:
      typed.onProfilerRender == null ? null : tag(typed.onProfilerRender, 'profiler'),
  };
};

/** The scripted drive. Every step names itself so a diff points at the guilty mutation. */
const runScript = (): Array<unknown> => {
  const relay = buildRelay();
  const tag = createIdentityTagger();
  const transcript: Array<unknown> = [];
  let publications = 0;
  const unsubscribe = relay.terminal.subscribe(() => {
    publications += 1;
  });

  const dispatchThroughFacades = (): string[] => {
    const control = (
      relay.terminal.getSnapshot() as {
        restaurantControlSelectionSnapshot: {
          onToggleFavorite: (id: string) => void;
          closeRestaurantProfile: () => void;
        };
      }
    ).restaurantControlSelectionSnapshot;
    dispatchLog.length = 0;
    control.onToggleFavorite('restaurant-1');
    control.closeRestaurantProfile();
    return [...dispatchLog];
  };

  const record = (step: string): void => {
    transcript.push({
      step,
      publications,
      dispatch: dispatchThroughFacades(),
      snapshot: projectTerminal(relay.terminal.getSnapshot(), tag),
    });
  };

  record('initial');

  const geometryA = opaque('geometry-a');
  const visualA = opaque('visual-a');
  const sheetA = opaque('sheet-a');

  relay.geometry.publish(geometryA);
  record('geometry-a (frame still incomplete)');
  relay.motion.publish(visualA);
  record('motion-a (frame still incomplete)');
  relay.routeSheet.publish(sheetA);
  record('route-sheet-a (route visual completes)');

  // Idempotent republish of the SAME identity — no hop may publish.
  relay.geometry.publish(geometryA);
  record('geometry-a republished (identical identity)');

  // A re-mint of one binding field: the F1608 walk.
  const geometryB = opaque('geometry-b');
  relay.geometry.publish(geometryB);
  record('geometry-b (single binding-field re-mint)');

  relay.visibility.publish({ shouldRenderSearchOverlay: true } as never);
  record('visibility on');
  relay.visibility.publish({ shouldRenderSearchOverlay: true } as never);
  record('visibility re-minted, same value');

  const profilerA = ((): void => undefined) as never;
  relay.profilerGate.publish({ onProfilerRender: profilerA } as never);
  record('profiler attached');

  const sessionB = opaque('session-1');
  relay.session.publish(sessionB);
  record('session changed');

  const panelA = opaque('panel-a');
  const progressA = opaque('progress-a');
  relay.panelContent.publish({
    restaurantPanelSnapshot: panelA,
    suggestionProgress: progressA,
  } as never);
  record('panel content changed');
  relay.panelContent.publish({
    restaurantPanelSnapshot: panelA,
    suggestionProgress: progressA,
  } as never);
  record('panel content re-minted, same fields');

  relay.policy.publish({
    shouldSuppressRestaurantOverlay: true,
    shouldFreezeRestaurantPanelContent: false,
    shouldEnableRestaurantOverlayInteraction: true,
  } as never);
  record('policy changed');

  relay.interaction.publish({
    onToggleFavorite: namedToggle('swapped'),
    closeRestaurantProfile: namedClose('swapped'),
  } as never);
  record('interaction handlers swapped (no re-publish; façade must dispatch to the NEW pair)');

  relay.routeSheet.publish(null as never);
  record('route sheet cleared (route visual collapses to null)');

  relay.visibility.publish({ shouldRenderSearchOverlay: false } as never);
  record('visibility off');

  unsubscribe();
  relay.dispose();
  return transcript;
};

/** The F1608 metric: fan-outs across ALL relay hops for one binding-field re-mint. */
const measureSingleFieldReMintFanOuts = (): number => {
  const relay = buildRelay();
  const geometryA = opaque('geometry-a');
  const visualA = opaque('visual-a');
  const sheetA = opaque('sheet-a');
  relay.geometry.publish(geometryA);
  relay.motion.publish(visualA);
  relay.routeSheet.publish(sheetA);

  let fanOuts = 0;
  const unsubscribers = relay.hops.map((hop) =>
    hop.subscribe(() => {
      fanOuts += 1;
    })
  );

  relay.geometry.publish(opaque('geometry-b'));

  unsubscribers.forEach((unsubscribeHop) => {
    unsubscribeHop();
  });
  relay.dispose();
  return fanOuts;
};

/**
 * The VISIBILITY-lane fan-out, for the guards the geometry walk never touches.
 *
 * A re-mint of the visibility source carrying an UNCHANGED boolean. This is the only
 * instrument that can see the presence-lane dedupe at all: the terminal transcript cannot,
 * because SheetVisual's own three-field comparator absorbs a redundant presence publish
 * before it reaches SheetHost. Disabling the presence guard is therefore invisible in the
 * transcript and visible only here — which is precisely why this metric exists.
 */
const measureUnchangedVisibilityReMintFanOuts = (): number => {
  const relay = buildRelay();
  relay.visibility.publish({ shouldRenderSearchOverlay: true } as never);

  let fanOuts = 0;
  const unsubscribers = relay.hops.map((hop) =>
    hop.subscribe(() => {
      fanOuts += 1;
    })
  );

  relay.visibility.publish({ shouldRenderSearchOverlay: true } as never);

  unsubscribers.forEach((unsubscribeHop) => {
    unsubscribeHop();
  });
  relay.dispose();
  return fanOuts;
};

describe('search overlay local-restaurant relay — composite output', () => {
  it('produces the byte-identical terminal transcript across the F958 collapse', () => {
    expect(runScript()).toEqual(RELAY_COMPOSITE_TRANSCRIPT);
  });

  it('publishes NOTHING when the visibility source re-mints an unchanged boolean', () => {
    expect(measureUnchangedVisibilityReMintFanOuts()).toBe(0);
  });

  it('records the F1608 fan-out cost of one binding-field re-mint', () => {
    // Recorded, not frozen: this number FALLS as hops die. Stage 0 baseline = 5.
    expect(measureSingleFieldReMintFanOuts()).toBe(F1608_FAN_OUTS);
  });
});

const F1608_FAN_OUTS = 3;

const RELAY_COMPOSITE_TRANSCRIPT: Array<unknown> = [
  {
    step: 'initial',
    publications: 0,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: false,
      routeHostVisualSnapshot: null,
      onProfilerRender: null,
    },
  },
  {
    step: 'geometry-a (frame still incomplete)',
    publications: 0,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: false,
      routeHostVisualSnapshot: null,
      onProfilerRender: null,
    },
  },
  {
    step: 'motion-a (frame still incomplete)',
    publications: 0,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: false,
      routeHostVisualSnapshot: null,
      onProfilerRender: null,
    },
  },
  {
    step: 'route-sheet-a (route visual completes)',
    publications: 1,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: false,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#4',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: null,
    },
  },
  {
    step: 'geometry-a republished (identical identity)',
    publications: 1,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: false,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#4',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: null,
    },
  },
  {
    step: 'geometry-b (single binding-field re-mint)',
    publications: 2,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: false,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: null,
    },
  },
  {
    step: 'visibility on',
    publications: 3,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: null,
    },
  },
  {
    step: 'visibility re-minted, same value',
    publications: 3,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: null,
    },
  },
  {
    step: 'profiler attached',
    publications: 4,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#1',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: 'profiler#8',
    },
  },
  {
    step: 'session changed',
    publications: 5,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#9',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: null,
        suggestionProgress: null,
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: 'profiler#8',
    },
  },
  {
    step: 'panel content changed',
    publications: 6,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#9',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: 'panel#10',
        suggestionProgress: 'progress#11',
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: 'profiler#8',
    },
  },
  {
    step: 'panel content re-minted, same fields',
    publications: 6,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#9',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: 'panel#10',
        suggestionProgress: 'progress#11',
        shouldSuppressRestaurantOverlay: false,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: false,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: 'profiler#8',
    },
  },
  {
    step: 'policy changed',
    publications: 7,
    dispatch: ['toggle:initial', 'close:initial'],
    snapshot: {
      restaurantSessionSnapshot: 'session#9',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: 'panel#10',
        suggestionProgress: 'progress#11',
        shouldSuppressRestaurantOverlay: true,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: true,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: 'profiler#8',
    },
  },
  {
    step: 'interaction handlers swapped (no re-publish; fa\u00e7ade must dispatch to the NEW pair)',
    publications: 7,
    dispatch: ['toggle:swapped', 'close:swapped'],
    snapshot: {
      restaurantSessionSnapshot: 'session#9',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: 'panel#10',
        suggestionProgress: 'progress#11',
        shouldSuppressRestaurantOverlay: true,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: true,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: {
        overlayGeometryRuntime: 'geometry#7',
        sharedSheetRuntimeOwner: 'sheet#5',
        visualRuntime: 'visual#6',
      },
      onProfilerRender: 'profiler#8',
    },
  },
  {
    step: 'route sheet cleared (route visual collapses to null)',
    publications: 8,
    dispatch: ['toggle:swapped', 'close:swapped'],
    snapshot: {
      restaurantSessionSnapshot: 'session#9',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: 'panel#10',
        suggestionProgress: 'progress#11',
        shouldSuppressRestaurantOverlay: true,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: true,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: true,
      routeHostVisualSnapshot: null,
      onProfilerRender: 'profiler#8',
    },
  },
  {
    step: 'visibility off',
    publications: 9,
    dispatch: ['toggle:swapped', 'close:swapped'],
    snapshot: {
      restaurantSessionSnapshot: 'session#9',
      restaurantControlSelectionSnapshot: {
        restaurantPanelSnapshot: 'panel#10',
        suggestionProgress: 'progress#11',
        shouldSuppressRestaurantOverlay: true,
        shouldFreezeRestaurantPanelContent: false,
        shouldEnableRestaurantOverlayInteraction: true,
        onToggleFavorite: 'toggle#2',
        closeRestaurantProfile: 'close#3',
      },
      shouldRenderSearchOverlay: false,
      routeHostVisualSnapshot: null,
      onProfilerRender: 'profiler#8',
    },
  },
];
