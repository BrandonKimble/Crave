import type { SearchRoutePanelInteractionRef } from '../../overlays/searchOverlayRouteHostContract';
import type {
  AppRouteSheetHostRuntimeConfigAuthority,
  AppRouteSheetHostMotionRuntimeAuthority,
  AppRouteSheetHostSurfaceBodyAuthority,
  AppRouteSheetHostSurfaceFrameAuthority,
  AppRouteSheetHostSurfaceAuthority,
} from './app-route-sheet-host-surface-runtime-contract';
import type { AppRouteSceneDisplayTargetRegistry } from './app-route-scene-display-target-registry';
import type { AppRouteSceneStackSurfaceAuthority } from './app-route-scene-stack-surface-contract';
import type { RouteHostVisualRuntimeAuthority } from './route-host-visual-runtime-state-controller';

export type AppRouteSheetHostRuntimeBase = {
  searchInteractionRef: SearchRoutePanelInteractionRef;
  routeSheetSurfaceAuthority: AppRouteSheetHostSurfaceAuthority;
  routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;
  routeSheetMotionRuntimeAuthority: AppRouteSheetHostMotionRuntimeAuthority;
  routeSheetSurfaceFrameAuthority: AppRouteSheetHostSurfaceFrameAuthority;
  routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeAuthority;
  // Render-side co-completer for the overlap 'content' settle plane: the scene-stack
  // crossfade ramp (BottomSheetSceneStackHost) calls this with the contentTransitionToken
  // (= the transition's settleToken) at ramp-end so the 'content' plane settles when the
  // incoming page is actually revealed. Phase 2: the readiness collector is the other
  // co-completer and the controller SCENE_READINESS_LIVENESS_MS timer is a never-hit watchdog.
  // Token-guarded in the controller, so a stale/duplicate call is safe.
  onContentSettleComplete: (token: number) => void;
};

export type AppRouteSheetHostRuntime = AppRouteSheetHostRuntimeBase;

// ─── THE FIELD-COMPARATOR HAS ONE HOME (F975(e)) ─────────────────────────────────────
//
// This eight-field comparison was hand-written TWICE — once in AppOverlayRouteHost, once in
// SearchOverlayRouteSheetSurfaceHost — and the twins HAD ALREADY DIVERGED: the Search copy
// diff-marked `routeSheetMotionRuntimeAuthority` and `onContentSettleComplete`; the other
// marked neither. Nothing could have caught that, because two hand-written lists agreeing is
// not a fact anything checks. It is a fact now: both call this.
//
// WHY FIELD-COMPARE AT ALL (bail-out, perf attribution 2026-07-12): the runtime is a MERGE
// object whose wrapper identity churns even when every member is stable, so a wrapper-identity
// memo would cascade the 12-level host chain on every churn. Comparing by field bails instead.
//
// EXHAUSTIVE BY CONSTRUCTION: the comparator is driven by a key ARRAY typed against the
// runtime, so a new field on AppRouteSheetHostRuntimeBase is a BUILD ERROR here until it is
// classified — either compared, or explicitly excluded with a reason. That is the property the
// two hand-written copies never had. `routeSceneDisplayTargetRegistry` is EXCLUDED: after
// F974(b) no host's memoised subtree dereferences it, so comparing it can only cost an extra
// re-render (AppOverlayRouteHost, which feeds NavSilhouetteHost, compares it separately and
// deliberately).
const APP_ROUTE_SHEET_HOST_RUNTIME_COMPARED_KEYS = [
  'searchInteractionRef',
  'routeSheetSurfaceAuthority',
  'routeSheetSurfaceBodyAuthority',
  'routeSheetMotionRuntimeAuthority',
  'routeSheetSurfaceFrameAuthority',
  'routeSheetRuntimeConfigAuthority',
  'sceneStackSurfaceAuthority',
  'routeHostVisualRuntimeAuthority',
  'onContentSettleComplete',
] as const satisfies readonly (keyof AppRouteSheetHostRuntimeBase)[];

type AppRouteSheetHostRuntimeComparedKey =
  (typeof APP_ROUTE_SHEET_HOST_RUNTIME_COMPARED_KEYS)[number];

type AppRouteSheetHostRuntimeExcludedKey = 'routeSceneDisplayTargetRegistry';

// The build error that keeps the list honest: every field is either compared or excluded.
type AppRouteSheetHostRuntimeUnclassifiedKey = Exclude<
  keyof AppRouteSheetHostRuntimeBase,
  AppRouteSheetHostRuntimeComparedKey | AppRouteSheetHostRuntimeExcludedKey
>;
const _assertEveryRuntimeFieldIsClassified: AppRouteSheetHostRuntimeUnclassifiedKey extends never
  ? true
  : never = true;
void _assertEveryRuntimeFieldIsClassified;

export const APP_ROUTE_SHEET_HOST_RUNTIME_DIFF_KEYS: readonly AppRouteSheetHostRuntimeComparedKey[] =
  APP_ROUTE_SHEET_HOST_RUNTIME_COMPARED_KEYS;

export const areAppRouteSheetHostRuntimesFieldEqual = (
  left: AppRouteSheetHostRuntime,
  right: AppRouteSheetHostRuntime
): boolean =>
  left === right ||
  APP_ROUTE_SHEET_HOST_RUNTIME_COMPARED_KEYS.every((key) => left[key] === right[key]);

export type AppRouteSheetHostRuntimeOwner = Omit<
  AppRouteSheetHostRuntimeBase,
  'searchInteractionRef'
>;
