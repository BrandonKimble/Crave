import {
  createRouteHostFoundationRuntime,
  type RouteHostFoundationRuntime,
} from './route-host-foundation-runtime';
import {
  createRouteSceneLayoutAssemblyRuntime,
  type RouteSceneLayoutAssemblyRuntime,
} from './route-scene-layout-assembly-runtime';
import {
  createRouteSheetVisualAssemblyRuntime,
  type RouteSheetVisualAssemblyRuntime,
} from './route-sheet-visual-assembly-runtime';
import type {
  RouteShellOverlayVisibilityAuthority,
} from './app-route-scene-foundation-runtime';

export class RouteVisualRuntime {
  private readonly routeHostFoundationRuntime: RouteHostFoundationRuntime;

  private readonly routeSceneLayoutAssemblyRuntime: RouteSceneLayoutAssemblyRuntime;

  private readonly routeSheetVisualAssemblyRuntime: RouteSheetVisualAssemblyRuntime;

  public readonly routeOverlayVisibilityAuthority: RouteShellOverlayVisibilityAuthority;

  public readonly routeSceneLayoutAuthority: RouteSceneLayoutAssemblyRuntime['routeSceneLayoutAuthority'];

  public readonly routeHostOverlayGeometryAuthority: RouteHostFoundationRuntime['routeHostOverlayGeometryAuthority'];

  public readonly routeResultsSheetVisualAuthority: RouteHostFoundationRuntime['routeResultsSheetVisualAuthority'];

  public readonly routeHostVisualRuntimeAuthority: RouteHostFoundationRuntime['routeHostVisualRuntimeAuthority'];

  public readonly routeSheetVisualAuthority: RouteSheetVisualAssemblyRuntime['routeSheetVisualAuthority'];

  public readonly syncRouteHostOverlayGeometryRuntime: RouteHostFoundationRuntime['routeHostSyncLane']['syncRouteHostOverlayGeometryRuntime'];

  public readonly publishRouteResultsSheetVisualBinding: RouteHostFoundationRuntime['routeHostSyncLane']['publishRouteResultsSheetVisualBinding'];

  public readonly syncRouteHostVisualRuntime: RouteHostFoundationRuntime['routeHostSyncLane']['syncRouteHostVisualRuntime'];

  constructor({
    routeOverlayVisibilityAuthority,
  }: {
    routeOverlayVisibilityAuthority: RouteShellOverlayVisibilityAuthority;
  }) {
    this.routeHostFoundationRuntime = createRouteHostFoundationRuntime();
    this.routeSceneLayoutAssemblyRuntime =
      createRouteSceneLayoutAssemblyRuntime({
        routeHostFoundationRuntime: this.routeHostFoundationRuntime,
      });
    this.routeSheetVisualAssemblyRuntime =
      createRouteSheetVisualAssemblyRuntime({
        routeHostFoundationRuntime: this.routeHostFoundationRuntime,
      });
    this.routeOverlayVisibilityAuthority = routeOverlayVisibilityAuthority;
    this.routeSceneLayoutAuthority =
      this.routeSceneLayoutAssemblyRuntime.routeSceneLayoutAuthority;
    this.routeHostOverlayGeometryAuthority =
      this.routeHostFoundationRuntime.routeHostOverlayGeometryAuthority;
    this.routeResultsSheetVisualAuthority =
      this.routeHostFoundationRuntime.routeResultsSheetVisualAuthority;
    this.routeHostVisualRuntimeAuthority =
      this.routeHostFoundationRuntime.routeHostVisualRuntimeAuthority;
    this.routeSheetVisualAuthority =
      this.routeSheetVisualAssemblyRuntime.routeSheetVisualAuthority;
    this.syncRouteHostOverlayGeometryRuntime =
      this.routeHostFoundationRuntime.routeHostSyncLane
        .syncRouteHostOverlayGeometryRuntime;
    this.publishRouteResultsSheetVisualBinding =
      this.routeHostFoundationRuntime.routeHostSyncLane
        .publishRouteResultsSheetVisualBinding;
    this.syncRouteHostVisualRuntime =
      this.routeHostFoundationRuntime.routeHostSyncLane.syncRouteHostVisualRuntime;
  }

  public dispose(): void {
    this.routeSheetVisualAssemblyRuntime.dispose();
    this.routeSceneLayoutAssemblyRuntime.dispose();
    this.routeHostFoundationRuntime.dispose();
  }
}

export const createRouteVisualRuntime = ({
  routeOverlayVisibilityAuthority,
}: ConstructorParameters<typeof RouteVisualRuntime>[0]): RouteVisualRuntime =>
  new RouteVisualRuntime({
    routeOverlayVisibilityAuthority,
  });
