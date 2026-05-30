import type { SearchRouteSceneStackPresentationState } from '../../overlays/searchRouteSceneStackSheetContract';
import type { RouteSharedSheetVisualBinding } from './route-shared-sheet-visual-state-controller';

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
    left.sheetScrollOffset === right.sheetScrollOffset &&
    left.sheetMomentum === right.sheetMomentum);

const createPresentationState = (
  routeSharedSheetVisual: RouteSharedSheetVisualBinding
): SearchRouteSceneStackPresentationState | null =>
  routeSharedSheetVisual == null
    ? null
    : {
        sheetTranslateY: routeSharedSheetVisual.sheetTranslateY,
        sheetScrollOffset: routeSharedSheetVisual.sheetScrollOffset,
        sheetMomentum: routeSharedSheetVisual.sheetMomentum,
      };

export class RouteSheetPresentationStateController {
  private routeSharedSheetVisual: RouteSharedSheetVisualBinding;

  private snapshot: SearchRouteSceneStackPresentationState | null = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSharedSheetVisual: () => void;

  public readonly routeSheetPresentationAuthority: RouteSheetPresentationAuthority;

  constructor({
    routeSharedSheetVisualAuthority,
  }: {
    routeSharedSheetVisualAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteSharedSheetVisualBinding;
    };
  }) {
    this.routeSharedSheetVisual = routeSharedSheetVisualAuthority.getSnapshot();
    this.routeSheetPresentationAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSharedSheetVisual =
      routeSharedSheetVisualAuthority.subscribe(() => {
        this.setRouteSharedSheetVisual(
          routeSharedSheetVisualAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSharedSheetVisual();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteSharedSheetVisual(
    routeSharedSheetVisual: RouteSharedSheetVisualBinding
  ): void {
    if (this.routeSharedSheetVisual === routeSharedSheetVisual) {
      return;
    }

    this.routeSharedSheetVisual = routeSharedSheetVisual;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = createPresentationState(this.routeSharedSheetVisual);

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
  routeSharedSheetVisualAuthority,
}: ConstructorParameters<typeof RouteSheetPresentationStateController>[0]): RouteSheetPresentationStateController =>
  new RouteSheetPresentationStateController({
    routeSharedSheetVisualAuthority,
  });
