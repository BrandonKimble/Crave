import type { RouteHostFoundationRuntime } from './route-host-foundation-runtime';
import {
  createRouteSheetChromeGeometryStateController,
  type RouteSheetChromeGeometryStateController,
} from './route-sheet-chrome-geometry-state-controller';
import {
  createRouteSheetChromeMotionStateController,
  type RouteSheetChromeMotionStateController,
} from './route-sheet-chrome-motion-state-controller';
import {
  createRouteSheetChromeVisualStateController,
  type RouteSheetChromeVisualStateController,
} from './route-sheet-chrome-visual-state-controller';
import {
  createRouteSheetPresentationStateController,
  type RouteSheetPresentationStateController,
} from './route-sheet-presentation-state-controller';
import {
  createRouteSheetVisualStateController,
  type RouteSheetVisualStateController,
} from './route-sheet-visual-state-controller';

export class RouteSheetVisualAssemblyRuntime {
  private readonly routeSheetPresentationRuntime: RouteSheetPresentationStateController;

  private readonly routeSheetChromeGeometryRuntime: RouteSheetChromeGeometryStateController;

  private readonly routeSheetChromeMotionRuntime: RouteSheetChromeMotionStateController;

  private readonly routeSheetChromeVisualRuntime: RouteSheetChromeVisualStateController;

  private readonly routeSheetVisualRuntime: RouteSheetVisualStateController;

  public readonly routeSheetVisualAuthority: RouteSheetVisualStateController['routeSheetVisualAuthority'];

  constructor({
    routeHostFoundationRuntime,
  }: {
    routeHostFoundationRuntime: RouteHostFoundationRuntime;
  }) {
    this.routeSheetPresentationRuntime = createRouteSheetPresentationStateController({
      routeSharedSheetVisualAuthority:
        routeHostFoundationRuntime.routeSharedSheetVisualAuthority,
    });
    this.routeSheetChromeGeometryRuntime =
      createRouteSheetChromeGeometryStateController({
        routeHostOverlayGeometryAuthority:
          routeHostFoundationRuntime.routeHostOverlayGeometryAuthority,
      });
    this.routeSheetChromeMotionRuntime =
      createRouteSheetChromeMotionStateController({
        routeHostVisualRuntimeAuthority:
          routeHostFoundationRuntime.routeHostVisualRuntimeAuthority,
      });
    this.routeSheetChromeVisualRuntime =
      createRouteSheetChromeVisualStateController({
        routeSheetChromeGeometryAuthority:
          this.routeSheetChromeGeometryRuntime.routeSheetChromeGeometryAuthority,
        routeSheetChromeMotionAuthority:
          this.routeSheetChromeMotionRuntime.routeSheetChromeMotionAuthority,
      });
    this.routeSheetVisualRuntime = createRouteSheetVisualStateController({
      routeSheetPresentationAuthority:
        this.routeSheetPresentationRuntime.routeSheetPresentationAuthority,
      routeSheetChromeVisualAuthority:
        this.routeSheetChromeVisualRuntime.routeSheetChromeVisualAuthority,
    });
    this.routeSheetVisualAuthority =
      this.routeSheetVisualRuntime.routeSheetVisualAuthority;
  }

  public dispose(): void {
    this.routeSheetVisualRuntime.dispose();
    this.routeSheetChromeVisualRuntime.dispose();
    this.routeSheetChromeMotionRuntime.dispose();
    this.routeSheetChromeGeometryRuntime.dispose();
    this.routeSheetPresentationRuntime.dispose();
  }
}

export const createRouteSheetVisualAssemblyRuntime = ({
  routeHostFoundationRuntime,
}: ConstructorParameters<
  typeof RouteSheetVisualAssemblyRuntime
>[0]): RouteSheetVisualAssemblyRuntime =>
  new RouteSheetVisualAssemblyRuntime({
    routeHostFoundationRuntime,
  });
