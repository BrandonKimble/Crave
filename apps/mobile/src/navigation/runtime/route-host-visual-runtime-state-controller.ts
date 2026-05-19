import type { AppRouteHostVisualRuntime } from './app-route-host-visual-runtime-contract';

type Listener = () => void;
type SelectorEquality<TSelected> = (currentSelected: TSelected, nextSelected: TSelected) => boolean;
type SelectorListenerRecord = {
  isEqual: SelectorEquality<unknown>;
  selected: unknown;
  selector: (snapshot: RouteHostVisualRuntime) => unknown;
};

export type RouteHostVisualRuntime = AppRouteHostVisualRuntime | null;

export type RouteHostVisualRuntimeAuthority = {
  subscribe: (listener: Listener) => () => void;
  subscribeSelector: <TSelected>(
    selector: (snapshot: RouteHostVisualRuntime) => TSelected,
    listener: Listener,
    isEqual?: SelectorEquality<TSelected>
  ) => () => void;
  getSnapshot: () => RouteHostVisualRuntime;
};

const areRouteHostVisualRuntimesEqual = (
  left: RouteHostVisualRuntime,
  right: RouteHostVisualRuntime
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.navBarHeight === right.navBarHeight &&
    left.navBarTop === right.navBarTop &&
    left.bottomNavHiddenTranslateY === right.bottomNavHiddenTranslateY &&
    left.overlayHeaderActionProgress === right.overlayHeaderActionProgress &&
    left.searchSurfacePageBundleProgress === right.searchSurfacePageBundleProgress &&
    left.navBarCutoutProgress === right.navBarCutoutProgress &&
    left.navBarCutoutHidingProgress === right.navBarCutoutHidingProgress &&
    left.navBarCutoutIsHiding === right.navBarCutoutIsHiding &&
    left.navTranslateY === right.navTranslateY &&
    left.navSilhouetteSheetBodyExclusionHeight ===
      right.navSilhouetteSheetBodyExclusionHeight &&
    left.navSilhouetteSheetMaskHeight === right.navSilhouetteSheetMaskHeight &&
    left.navSilhouetteSheetExclusionModeValue === right.navSilhouetteSheetExclusionModeValue);

export class RouteHostVisualRuntimeStateController {
  private routeHostVisualRuntime: RouteHostVisualRuntime = null;

  private readonly listeners = new Set<Listener>();

  private readonly selectorListeners = new Map<Listener, SelectorListenerRecord>();

  public readonly routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeAuthority;

  constructor() {
    this.routeHostVisualRuntimeAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      subscribeSelector: (selector, listener, isEqual = Object.is) =>
        this.subscribeSelector(selector, listener, isEqual),
      getSnapshot: () => this.routeHostVisualRuntime,
    };
  }

  public syncRouteHostVisualRuntime(
    routeHostVisualRuntime: RouteHostVisualRuntime
  ): void {
    if (
      areRouteHostVisualRuntimesEqual(
        this.routeHostVisualRuntime,
        routeHostVisualRuntime
      )
    ) {
      return;
    }

    this.routeHostVisualRuntime = routeHostVisualRuntime;
    this.listeners.forEach((listener) => {
      listener();
    });
    this.notifySelectorListeners();
  }

  public dispose(): void {
    this.listeners.clear();
    this.selectorListeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private subscribeSelector<TSelected>(
    selector: (snapshot: RouteHostVisualRuntime) => TSelected,
    listener: Listener,
    isEqual: SelectorEquality<TSelected>
  ): () => void {
    this.selectorListeners.set(listener, {
      isEqual: isEqual as SelectorEquality<unknown>,
      selected: selector(this.routeHostVisualRuntime),
      selector,
    });
    return () => {
      this.selectorListeners.delete(listener);
    };
  }

  private notifySelectorListeners(): void {
    this.selectorListeners.forEach((record, listener) => {
      const nextSelected = record.selector(this.routeHostVisualRuntime);
      if (record.isEqual(record.selected, nextSelected)) {
        return;
      }
      record.selected = nextSelected;
      listener();
    });
  }
}

export const createRouteHostVisualRuntimeStateController =
  (): RouteHostVisualRuntimeStateController =>
    new RouteHostVisualRuntimeStateController();
