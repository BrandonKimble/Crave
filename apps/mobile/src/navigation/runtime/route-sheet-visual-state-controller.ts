import type { SearchRouteSheetVisualSelectionSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-visual-selection-snapshot-contract';
import {
  EMPTY_SEARCH_ROUTE_SHEET_VISUAL_SELECTION_SNAPSHOT,
} from '../../screens/Search/runtime/shared/search-route-sheet-visual-selection-snapshot-contract';
import type { RouteSheetChromeVisualAuthority } from './route-sheet-chrome-visual-state-controller';
import type { RouteSheetPresentationAuthority } from './route-sheet-presentation-state-controller';

type Listener = () => void;

const areRouteSheetVisualSnapshotsEqual = (
  left: SearchRouteSheetVisualSelectionSnapshot,
  right: SearchRouteSheetVisualSelectionSnapshot
): boolean =>
  left.presentationState === right.presentationState &&
  left.chromeVisualState === right.chromeVisualState;

const createRouteSheetVisualSelectionSnapshot = (
  routeSheetPresentationState: ReturnType<RouteSheetPresentationAuthority['getSnapshot']>,
  routeSheetChromeVisualState: ReturnType<RouteSheetChromeVisualAuthority['getSnapshot']>
): SearchRouteSheetVisualSelectionSnapshot => ({
  presentationState: routeSheetPresentationState,
  chromeVisualState: routeSheetChromeVisualState,
});

export type RouteSheetVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchRouteSheetVisualSelectionSnapshot;
};

export class RouteSheetVisualStateController {
  private routeSheetPresentationState: ReturnType<
    RouteSheetPresentationAuthority['getSnapshot']
  >;

  private routeSheetChromeVisualState: ReturnType<
    RouteSheetChromeVisualAuthority['getSnapshot']
  >;

  private snapshot: SearchRouteSheetVisualSelectionSnapshot =
    EMPTY_SEARCH_ROUTE_SHEET_VISUAL_SELECTION_SNAPSHOT;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSheetPresentation: () => void;

  private readonly unsubscribeRouteSheetChromeVisual: () => void;

  public readonly routeSheetVisualAuthority: RouteSheetVisualAuthority;

  constructor({
    routeSheetPresentationAuthority,
    routeSheetChromeVisualAuthority,
  }: {
    routeSheetPresentationAuthority: RouteSheetPresentationAuthority;
    routeSheetChromeVisualAuthority: RouteSheetChromeVisualAuthority;
  }) {
    this.routeSheetPresentationState = routeSheetPresentationAuthority.getSnapshot();
    this.routeSheetChromeVisualState = routeSheetChromeVisualAuthority.getSnapshot();
    this.routeSheetVisualAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSheetPresentation =
      routeSheetPresentationAuthority.subscribe(() => {
        this.setRouteSheetPresentationState(
          routeSheetPresentationAuthority.getSnapshot()
        );
      });
    this.unsubscribeRouteSheetChromeVisual =
      routeSheetChromeVisualAuthority.subscribe(() => {
        this.setRouteSheetChromeVisualState(
          routeSheetChromeVisualAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSheetChromeVisual();
    this.unsubscribeRouteSheetPresentation();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteSheetPresentationState(
    routeSheetPresentationState: ReturnType<
      RouteSheetPresentationAuthority['getSnapshot']
    >
  ): void {
    if (this.routeSheetPresentationState === routeSheetPresentationState) {
      return;
    }

    this.routeSheetPresentationState = routeSheetPresentationState;
    this.recompute(true);
  }

  private setRouteSheetChromeVisualState(
    routeSheetChromeVisualState: ReturnType<
      RouteSheetChromeVisualAuthority['getSnapshot']
    >
  ): void {
    if (this.routeSheetChromeVisualState === routeSheetChromeVisualState) {
      return;
    }

    this.routeSheetChromeVisualState = routeSheetChromeVisualState;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = createRouteSheetVisualSelectionSnapshot(
      this.routeSheetPresentationState,
      this.routeSheetChromeVisualState
    );

    if (areRouteSheetVisualSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;

    if (!notify) {
      return;
    }

    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createRouteSheetVisualStateController = ({
  routeSheetPresentationAuthority,
  routeSheetChromeVisualAuthority,
}: ConstructorParameters<typeof RouteSheetVisualStateController>[0]): RouteSheetVisualStateController =>
  new RouteSheetVisualStateController({
    routeSheetPresentationAuthority,
    routeSheetChromeVisualAuthority,
  });
