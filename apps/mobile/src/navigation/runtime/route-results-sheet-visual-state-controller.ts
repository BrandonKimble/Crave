import type { AppRouteResultsSheetVisualBinding } from './app-route-results-sheet-runtime-contract';

type Listener = () => void;

export type RouteResultsSheetVisualBinding = Pick<
  AppRouteResultsSheetVisualBinding,
  'snapPoints' | 'sheetTranslateY' | 'resultsScrollOffset' | 'resultsMomentum'
> | null;

export type RouteResultsSheetVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteResultsSheetVisualBinding;
};

const areRouteResultsSheetVisualBindingsEqual = (
  left: RouteResultsSheetVisualBinding,
  right: RouteResultsSheetVisualBinding
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.snapPoints === right.snapPoints &&
    left.sheetTranslateY === right.sheetTranslateY &&
    left.resultsScrollOffset === right.resultsScrollOffset &&
    left.resultsMomentum === right.resultsMomentum);

export class RouteResultsSheetVisualStateController {
  private routeResultsSheetVisualBinding: RouteResultsSheetVisualBinding = null;

  private readonly listeners = new Set<Listener>();

  public readonly routeResultsSheetVisualAuthority: RouteResultsSheetVisualAuthority;

  constructor() {
    this.routeResultsSheetVisualAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.routeResultsSheetVisualBinding,
    };
  }

  public publishRouteResultsSheetVisualBinding(
    routeResultsSheetVisualBinding: RouteResultsSheetVisualBinding
  ): void {
    if (
      areRouteResultsSheetVisualBindingsEqual(
        this.routeResultsSheetVisualBinding,
        routeResultsSheetVisualBinding
      )
    ) {
      return;
    }

    this.routeResultsSheetVisualBinding = routeResultsSheetVisualBinding;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  public dispose(): void {
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const createRouteResultsSheetVisualStateController =
  (): RouteResultsSheetVisualStateController =>
    new RouteResultsSheetVisualStateController();
