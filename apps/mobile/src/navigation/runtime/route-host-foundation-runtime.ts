import {
  createRouteHostOverlayGeometryStateController,
  type RouteHostOverlayGeometryStateController,
} from './route-host-overlay-geometry-state-controller';
import {
  createRouteHostVisualRuntimeStateController,
  type RouteHostVisualRuntimeStateController,
} from './route-host-visual-runtime-state-controller';
import {
  createRouteSharedSheetVisualStateController,
  type RouteSharedSheetVisualStateController,
} from './route-shared-sheet-visual-state-controller';

export class RouteHostFoundationRuntime {
  private readonly routeHostOverlayGeometryRuntime: RouteHostOverlayGeometryStateController;

  private readonly routeSharedSheetVisualRuntime: RouteSharedSheetVisualStateController;

  private readonly routeHostVisualRuntime: RouteHostVisualRuntimeStateController;

  public readonly routeHostSyncLane: {
    syncRouteHostOverlayGeometryRuntime: RouteHostOverlayGeometryStateController['syncRouteHostOverlayGeometryRuntime'];
    publishRouteSharedSheetVisualBinding: RouteSharedSheetVisualStateController['publishRouteSharedSheetVisualBinding'];
    syncRouteHostVisualRuntime: RouteHostVisualRuntimeStateController['syncRouteHostVisualRuntime'];
  };

  public readonly routeHostOverlayGeometryAuthority: RouteHostOverlayGeometryStateController['routeHostOverlayGeometryAuthority'];

  public readonly routeSharedSheetVisualAuthority: RouteSharedSheetVisualStateController['routeSharedSheetVisualAuthority'];

  public readonly routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeStateController['routeHostVisualRuntimeAuthority'];

  constructor() {
    this.routeHostOverlayGeometryRuntime =
      createRouteHostOverlayGeometryStateController();
    this.routeSharedSheetVisualRuntime =
      createRouteSharedSheetVisualStateController();
    this.routeHostVisualRuntime = createRouteHostVisualRuntimeStateController();
    this.routeHostSyncLane = {
      syncRouteHostOverlayGeometryRuntime: (routeHostOverlayGeometryRuntime) => {
        this.routeHostOverlayGeometryRuntime.syncRouteHostOverlayGeometryRuntime(
          routeHostOverlayGeometryRuntime
        );
      },
      publishRouteSharedSheetVisualBinding: (routeSharedSheetVisualBinding) => {
        this.routeSharedSheetVisualRuntime.publishRouteSharedSheetVisualBinding(
          routeSharedSheetVisualBinding
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
    this.routeSharedSheetVisualAuthority =
      this.routeSharedSheetVisualRuntime.routeSharedSheetVisualAuthority;
    this.routeHostVisualRuntimeAuthority =
      this.routeHostVisualRuntime.routeHostVisualRuntimeAuthority;
  }

  public dispose(): void {
    this.routeHostVisualRuntime.dispose();
    this.routeSharedSheetVisualRuntime.dispose();
    this.routeHostOverlayGeometryRuntime.dispose();
  }
}

export const createRouteHostFoundationRuntime =
  (): RouteHostFoundationRuntime => new RouteHostFoundationRuntime();
