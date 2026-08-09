import type { AppRouteSharedSheetVisualBinding } from './app-route-shared-sheet-runtime-contract';

type Listener = () => void;

export type RouteSharedSheetVisualBinding = Pick<
  AppRouteSharedSheetVisualBinding,
  'snapPoints' | 'sheetMomentum' | 'getCurrentSheetSnap'
> | null;

export type RouteSharedSheetVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSharedSheetVisualBinding;
};

// F1376: `snapPoints` is an identity-stable mutable box (see the field doc on
// AppRouteSharedSheetRuntimeOwner) — this `===` deliberately detects a REMOUNT (a new
// runtime instance), not a geometry change. Its fields mutate in place on every
// geometry recompute without ever changing this comparison's result; consumers read
// `snapPoints.<field>` at animation time, not from this equality's pass/fail.
const areRouteSharedSheetVisualBindingsEqual = (
  left: RouteSharedSheetVisualBinding,
  right: RouteSharedSheetVisualBinding
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.snapPoints === right.snapPoints &&
    left.sheetMomentum === right.sheetMomentum &&
    left.getCurrentSheetSnap === right.getCurrentSheetSnap);

export class RouteSharedSheetVisualStateController {
  private routeSharedSheetVisualBinding: RouteSharedSheetVisualBinding = null;

  private readonly listeners = new Set<Listener>();

  public readonly routeSharedSheetVisualAuthority: RouteSharedSheetVisualAuthority;

  constructor() {
    this.routeSharedSheetVisualAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.routeSharedSheetVisualBinding,
    };
  }

  public publishRouteSharedSheetVisualBinding(
    routeSharedSheetVisualBinding: RouteSharedSheetVisualBinding
  ): void {
    if (
      areRouteSharedSheetVisualBindingsEqual(
        this.routeSharedSheetVisualBinding,
        routeSharedSheetVisualBinding
      )
    ) {
      return;
    }

    this.routeSharedSheetVisualBinding = routeSharedSheetVisualBinding;
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

export const createRouteSharedSheetVisualStateController =
  (): RouteSharedSheetVisualStateController => new RouteSharedSheetVisualStateController();
