import { logPerfScenarioStackAttribution } from '../../perf/perf-scenario-attribution';

import type { SearchRoutePanelInteractionRef } from '../../overlays/searchOverlayRouteHostContract';
import type {
  AppRouteSheetHostRuntimeConfigAuthority,
  AppRouteSheetHostMotionRuntimeAuthority,
  AppRouteSheetHostSurfaceBodyAuthority,
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

/**
 * THE DIFF MARKER IS THE SAME LIST AS THE COMPARATOR (F6600).
 *
 * F975(e) gave the field COMPARISON one home driven by the key array above.
 * The per-field DIFF MARKER each memo also runs for perf attribution was left
 * as twins, and they re-diverged in both directions: AppOverlayRouteHost marked
 * 8 fields, SearchOverlayRouteSheetSurfaceHost marked 9, and the difference was
 * not a subset — so two attribution probes disagreed about which fields exist,
 * exactly as the two comparators had, and nothing could catch it.
 *
 * This module exported `APP_ROUTE_SHEET_HOST_RUNTIME_DIFF_KEYS` for this job and
 * nothing ever imported it. A second exported alias of the same array would only
 * make divergence writable again, so it is deleted: the marker below iterates
 * the comparator's own array. The marker and the comparison cannot disagree
 * because there is nothing for them to disagree about.
 *
 * `routeSceneDisplayTargetRegistry` therefore stops being marked, and that is a
 * consequence rather than a separate decision — it is EXCLUDED above because it
 * is a process-lifetime singleton, so its mark was a probe that could only ever
 * report green (F1486's non-guard, one level down).
 *
 * The wrapper identity IS marked, and is the one mark not derived from a field:
 * a fresh merge object with identical members is precisely the churn the
 * field-comparator exists to bail out of, and knowing it happened is real
 * attribution.
 */
export const markAppRouteSheetHostRuntimeDiffs = (
  owner: string,
  left: AppRouteSheetHostRuntime,
  right: AppRouteSheetHostRuntime
): void => {
  const mark = (field: string, leftValue: unknown, rightValue: unknown): void => {
    if (Object.is(leftValue, rightValue)) {
      return;
    }
    logPerfScenarioStackAttribution({ owner, path: `field:${field}` });
  };
  mark('routeSheetHostRuntimeRef', left, right);
  for (const key of APP_ROUTE_SHEET_HOST_RUNTIME_COMPARED_KEYS) {
    mark(`routeSheetHostRuntime.${key}`, left[key], right[key]);
  }
};

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
