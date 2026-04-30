import {
  createRouteSceneLayoutFrameStateController,
  type RouteSceneLayoutFrameStateController,
} from './route-scene-layout-frame-state-controller';
import {
  createRouteSceneLayoutNavFrameStateController,
  type RouteSceneLayoutNavFrameStateController,
} from './route-scene-layout-nav-frame-state-controller';
import {
  createRouteSceneLayoutSearchBarFrameStateController,
  type RouteSceneLayoutSearchBarFrameStateController,
} from './route-scene-layout-search-bar-frame-state-controller';
import {
  createRouteSceneLayoutShellStateController,
  type RouteSceneLayoutShellStateController,
} from './route-scene-layout-shell-state-controller';
import {
  createRouteSceneLayoutSheetStateController,
  type RouteSceneLayoutSheetStateController,
} from './route-scene-layout-sheet-state-controller';
import {
  createRouteSceneLayoutSnapPointsStateController,
  type RouteSceneLayoutSnapPointsStateController,
} from './route-scene-layout-snap-points-state-controller';
import {
  createRouteSceneLayoutStateController,
  type RouteSceneLayoutStateController,
} from './route-scene-layout-state-controller';
import type { RouteHostFoundationRuntime } from './route-host-foundation-runtime';

export class RouteSceneLayoutAssemblyRuntime {
  private readonly routeSceneLayoutNavFrameRuntime: RouteSceneLayoutNavFrameStateController;

  private readonly routeSceneLayoutSearchBarFrameRuntime: RouteSceneLayoutSearchBarFrameStateController;

  private readonly routeSceneLayoutFrameRuntime: RouteSceneLayoutFrameStateController;

  private readonly routeSceneLayoutShellRuntime: RouteSceneLayoutShellStateController;

  private readonly routeSceneLayoutSnapPointsRuntime: RouteSceneLayoutSnapPointsStateController;

  private readonly routeSceneLayoutSheetRuntime: RouteSceneLayoutSheetStateController;

  private readonly routeSceneLayoutRuntime: RouteSceneLayoutStateController;

  public readonly routeSceneLayoutAuthority: RouteSceneLayoutStateController['routeSceneLayoutAuthority'];

  constructor({
    routeHostFoundationRuntime,
  }: {
    routeHostFoundationRuntime: RouteHostFoundationRuntime;
  }) {
    this.routeSceneLayoutNavFrameRuntime =
      createRouteSceneLayoutNavFrameStateController({
        routeHostVisualRuntimeAuthority:
          routeHostFoundationRuntime.routeHostVisualRuntimeAuthority,
      });
    this.routeSceneLayoutSearchBarFrameRuntime =
      createRouteSceneLayoutSearchBarFrameStateController({
        routeHostOverlayGeometryAuthority:
          routeHostFoundationRuntime.routeHostOverlayGeometryAuthority,
      });
    this.routeSceneLayoutFrameRuntime =
      createRouteSceneLayoutFrameStateController({
        routeSceneLayoutNavFrameAuthority:
          this.routeSceneLayoutNavFrameRuntime.routeSceneLayoutNavFrameAuthority,
        routeSceneLayoutSearchBarFrameAuthority:
          this.routeSceneLayoutSearchBarFrameRuntime.routeSceneLayoutSearchBarFrameAuthority,
      });
    this.routeSceneLayoutShellRuntime = createRouteSceneLayoutShellStateController({
      routeSceneLayoutFrameAuthority:
        this.routeSceneLayoutFrameRuntime.routeSceneLayoutFrameAuthority,
    });
    this.routeSceneLayoutSnapPointsRuntime =
      createRouteSceneLayoutSnapPointsStateController({
        routeResultsSheetVisualAuthority:
          routeHostFoundationRuntime.routeResultsSheetVisualAuthority,
      });
    this.routeSceneLayoutSheetRuntime = createRouteSceneLayoutSheetStateController({
      routeSceneLayoutSnapPointsAuthority:
        this.routeSceneLayoutSnapPointsRuntime.routeSceneLayoutSnapPointsAuthority,
    });
    this.routeSceneLayoutRuntime = createRouteSceneLayoutStateController({
      routeSceneLayoutShellAuthority:
        this.routeSceneLayoutShellRuntime.routeSceneLayoutShellAuthority,
      routeSceneLayoutSheetAuthority:
        this.routeSceneLayoutSheetRuntime.routeSceneLayoutSheetAuthority,
    });
    this.routeSceneLayoutAuthority =
      this.routeSceneLayoutRuntime.routeSceneLayoutAuthority;
  }

  public dispose(): void {
    this.routeSceneLayoutRuntime.dispose();
    this.routeSceneLayoutSheetRuntime.dispose();
    this.routeSceneLayoutSnapPointsRuntime.dispose();
    this.routeSceneLayoutShellRuntime.dispose();
    this.routeSceneLayoutFrameRuntime.dispose();
    this.routeSceneLayoutSearchBarFrameRuntime.dispose();
    this.routeSceneLayoutNavFrameRuntime.dispose();
  }
}

export const createRouteSceneLayoutAssemblyRuntime = ({
  routeHostFoundationRuntime,
}: ConstructorParameters<
  typeof RouteSceneLayoutAssemblyRuntime
>[0]): RouteSceneLayoutAssemblyRuntime =>
  new RouteSceneLayoutAssemblyRuntime({
    routeHostFoundationRuntime,
  });
