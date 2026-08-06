/**
 * F1013 WIRING CONTRACT for the local-restaurant sheet-host composition (D45/F958 Cluster A).
 *
 * The overlay relay is being collapsed from fifteen hops into four authorities. Each hop
 * removes controller-owning hooks from THIS composition tree, and in this runtime the
 * wiring IS the hook call order — nothing in the type system enforces it.
 *
 * Two assertions:
 *   1. the hook SEQUENCE is stable across re-renders (the harness throws on drift);
 *   2. the hook COUNT is RECORDED. Like the F1608 fan-out metric it is expected to FALL as
 *      hops die — but never to change by accident. A hop that changes this number without
 *      the author saying so is a hop that touched hook composition unknowingly.
 *
 * The composite behavioural proof lives next to the controllers, in
 * `controller/search-overlay-local-restaurant-overlay-relay-composite.spec.ts`.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';
import { useSearchRootOverlayLocalRestaurantRouteHostRuntime } from './use-search-root-overlay-local-restaurant-route-host-runtime';
import { useSearchRootOverlayLocalRestaurantSheetHostRuntime } from './use-search-root-overlay-local-restaurant-sheet-host-runtime';

jest.mock('react', () => createReactHookHarnessModuleMock());

/** Hook count of the composition at the current stage of the F958 collapse. */
const SHEET_HOST_COMPOSITION_HOOK_COUNT = 13;

const authority = <T>(snapshot: T): { subscribe: () => () => void; getSnapshot: () => T } => ({
  subscribe: () => () => undefined,
  getSnapshot: () => snapshot,
});

const createParams = () =>
  ({
    routeOverlayVisibilityAuthority: authority({ shouldRenderSearchOverlay: false }),
    routeLocalRestaurantOverlaySessionAuthority: authority({ session: 'session' }),
    routeLocalRestaurantOverlayPanelContentAuthority: authority({
      restaurantPanelSnapshot: null,
      suggestionProgress: null,
    }),
    routeLocalRestaurantOverlayPolicyAuthority: authority({
      shouldSuppressRestaurantOverlay: false,
      shouldFreezeRestaurantPanelContent: false,
      shouldEnableRestaurantOverlayInteraction: false,
    }),
    routeLocalRestaurantOverlayInteractionAuthority: authority({
      onToggleFavorite: () => undefined,
      closeRestaurantProfile: () => undefined,
    }),
    overlayGateSnapshot: { onProfilerRender: null },
    localRestaurantRouteVisualAuthority: authority(null),
  }) as unknown as Parameters<typeof useSearchRootOverlayLocalRestaurantSheetHostRuntime>[0];

describe('useSearchRootOverlayLocalRestaurantSheetHostRuntime — F1013 wiring contract', () => {
  it('calls a stable hook sequence across renders', () => {
    const params = createParams();
    const harness = mountHook(() => useSearchRootOverlayLocalRestaurantSheetHostRuntime(params));

    const first = harness.hookSequence();
    harness.render();
    harness.render();

    // NON-EMPTY FIRST (F2072 family): `toEqual(first)` compares the recorder
    // against itself, so a composition that called NO hooks — or a harness that
    // recorded none — used to satisfy this contract with two empty arrays.
    expect(first.length).toBeGreaterThan(0);
    expect(harness.hookSequence()).toEqual(first);
    harness.unmount();
  });

  it('records the composition hook count (falls as F958 hops die)', () => {
    const harness = mountHook(() =>
      useSearchRootOverlayLocalRestaurantSheetHostRuntime(createParams())
    );

    expect(harness.hookCount()).toBe(SHEET_HOST_COMPOSITION_HOOK_COUNT);
    harness.unmount();
  });

  it('publishes a terminal sheet-host authority whose snapshot carries every slot', () => {
    const harness = mountHook(() =>
      useSearchRootOverlayLocalRestaurantSheetHostRuntime(createParams())
    );

    const snapshot = harness.latest().overlayLocalRestaurantSheetHostAuthority.getSnapshot();

    expect(Object.keys(snapshot).sort()).toEqual([
      'onProfilerRender',
      'restaurantControlSelectionSnapshot',
      'restaurantSessionSnapshot',
      'routeHostVisualSnapshot',
      'shouldRenderSearchOverlay',
    ]);
    harness.unmount();
  });
});

describe('useSearchRootOverlayLocalRestaurantRouteHostRuntime — F1013 wiring contract', () => {
  const createRouteParams = () =>
    ({
      routeHostOverlayGeometryAuthority: authority(null),
      routeSharedSheetVisualAuthority: authority(null),
      routeHostVisualRuntimeAuthority: authority(null),
    }) as unknown as Parameters<typeof useSearchRootOverlayLocalRestaurantRouteHostRuntime>[0];

  it('calls a stable hook sequence across renders', () => {
    const params = createRouteParams();
    const harness = mountHook(() => useSearchRootOverlayLocalRestaurantRouteHostRuntime(params));

    const first = harness.hookSequence();
    harness.render();

    // NON-EMPTY FIRST (F2072 family): two empty arrays are equal.
    expect(first.length).toBeGreaterThan(0);
    expect(harness.hookSequence()).toEqual(first);
    harness.unmount();
  });

  it('records the RouteFrame composition hook count (falls as F958 hops die)', () => {
    const harness = mountHook(() =>
      useSearchRootOverlayLocalRestaurantRouteHostRuntime(createRouteParams())
    );

    // Was 5 (four hand-rolled controller refs + one disposal effect) before the three
    // F1604 null-wrappers collapsed into the RouteFrame authority.
    expect(harness.hookCount()).toBe(2);
    harness.unmount();
  });
});
