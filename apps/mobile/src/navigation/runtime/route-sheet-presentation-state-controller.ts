import type { SearchRouteSceneStackPresentationState } from '../../overlays/searchRouteSceneStackSheetContract';
import type { RouteResultsSheetVisualBinding } from './route-results-sheet-visual-state-controller';

type Listener = () => void;

export type RouteSheetPresentationAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchRouteSceneStackPresentationState | null;
};

const arePresentationStatesEqual = (
  left: SearchRouteSceneStackPresentationState | null,
  right: SearchRouteSceneStackPresentationState | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sheetTranslateY === right.sheetTranslateY &&
    left.resultsScrollOffset === right.resultsScrollOffset &&
    left.resultsMomentum === right.resultsMomentum);

const createPresentationState = (
  routeResultsSheetVisual: RouteResultsSheetVisualBinding
): SearchRouteSceneStackPresentationState | null =>
  routeResultsSheetVisual == null
    ? null
    : {
        sheetTranslateY: routeResultsSheetVisual.sheetTranslateY,
        resultsScrollOffset: routeResultsSheetVisual.resultsScrollOffset,
        resultsMomentum: routeResultsSheetVisual.resultsMomentum,
      };

export class RouteSheetPresentationStateController {
  private routeResultsSheetVisual: RouteResultsSheetVisualBinding;

  private snapshot: SearchRouteSceneStackPresentationState | null = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteResultsSheetVisual: () => void;

  public readonly routeSheetPresentationAuthority: RouteSheetPresentationAuthority;

  constructor({
    routeResultsSheetVisualAuthority,
  }: {
    routeResultsSheetVisualAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteResultsSheetVisualBinding;
    };
  }) {
    this.routeResultsSheetVisual = routeResultsSheetVisualAuthority.getSnapshot();
    this.routeSheetPresentationAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteResultsSheetVisual =
      routeResultsSheetVisualAuthority.subscribe(() => {
        this.setRouteResultsSheetVisual(
          routeResultsSheetVisualAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteResultsSheetVisual();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteResultsSheetVisual(
    routeResultsSheetVisual: RouteResultsSheetVisualBinding
  ): void {
    if (this.routeResultsSheetVisual === routeResultsSheetVisual) {
      return;
    }

    this.routeResultsSheetVisual = routeResultsSheetVisual;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = createPresentationState(this.routeResultsSheetVisual);

    if (arePresentationStatesEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteSheetPresentationStateController = ({
  routeResultsSheetVisualAuthority,
}: ConstructorParameters<typeof RouteSheetPresentationStateController>[0]): RouteSheetPresentationStateController =>
  new RouteSheetPresentationStateController({
    routeResultsSheetVisualAuthority,
  });
