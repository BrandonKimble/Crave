import {
  createRouteHostOverlayGeometryStateController,
  type RouteHostOverlayGeometryStateController,
} from './route-host-overlay-geometry-state-controller';
import {
  createRouteHostVisualRuntimeStateController,
  type RouteHostVisualRuntimeStateController,
} from './route-host-visual-runtime-state-controller';
import {
  createRouteResultsSheetVisualStateController,
  type RouteResultsSheetVisualStateController,
} from './route-results-sheet-visual-state-controller';

export class RouteHostFoundationRuntime {
  private readonly routeHostOverlayGeometryRuntime: RouteHostOverlayGeometryStateController;

  private readonly routeResultsSheetVisualRuntime: RouteResultsSheetVisualStateController;

  private readonly routeHostVisualRuntime: RouteHostVisualRuntimeStateController;

  public readonly routeHostSyncLane: {
    syncRouteHostOverlayGeometryRuntime: RouteHostOverlayGeometryStateController['syncRouteHostOverlayGeometryRuntime'];
    publishRouteResultsSheetVisualBinding: RouteResultsSheetVisualStateController['publishRouteResultsSheetVisualBinding'];
    syncRouteHostVisualRuntime: RouteHostVisualRuntimeStateController['syncRouteHostVisualRuntime'];
  };

  public readonly routeHostOverlayGeometryAuthority: RouteHostOverlayGeometryStateController['routeHostOverlayGeometryAuthority'];

  public readonly routeResultsSheetVisualAuthority: RouteResultsSheetVisualStateController['routeResultsSheetVisualAuthority'];

  public readonly routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeStateController['routeHostVisualRuntimeAuthority'];

  constructor() {
    this.routeHostOverlayGeometryRuntime =
      createRouteHostOverlayGeometryStateController();
    this.routeResultsSheetVisualRuntime =
      createRouteResultsSheetVisualStateController();
    this.routeHostVisualRuntime = createRouteHostVisualRuntimeStateController();
    this.routeHostSyncLane = {
      syncRouteHostOverlayGeometryRuntime: (routeHostOverlayGeometryRuntime) => {
        this.routeHostOverlayGeometryRuntime.syncRouteHostOverlayGeometryRuntime(
          routeHostOverlayGeometryRuntime
        );
      },
      publishRouteResultsSheetVisualBinding: (routeResultsSheetVisualBinding) => {
        this.routeResultsSheetVisualRuntime.publishRouteResultsSheetVisualBinding(
          routeResultsSheetVisualBinding
        );
      },
      syncRouteHostVisualRuntime: (routeHostVisualRuntime) => {
        this.routeHostVisualRuntime.syncRouteHostVisualRuntime(
          routeHostVisualRuntime
        );
      },
    };
    this.routeHostOverlayGeometryAuthority =
      this.routeHostOverlayGeometryRuntime.routeHostOverlayGeometryAuthority;
    this.routeResultsSheetVisualAuthority =
      this.routeResultsSheetVisualRuntime.routeResultsSheetVisualAuthority;
    this.routeHostVisualRuntimeAuthority =
      this.routeHostVisualRuntime.routeHostVisualRuntimeAuthority;
  }

  public dispose(): void {
    this.routeHostVisualRuntime.dispose();
    this.routeResultsSheetVisualRuntime.dispose();
    this.routeHostOverlayGeometryRuntime.dispose();
  }
}

export const createRouteHostFoundationRuntime =
  (): RouteHostFoundationRuntime => new RouteHostFoundationRuntime();
