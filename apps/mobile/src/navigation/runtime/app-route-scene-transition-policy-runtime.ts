import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import type {
  RouteSceneSwitchCameraIntent,
  RouteSceneSwitchChromeVisibilityTarget,
  RouteSceneSwitchDockedPollsRestoreIntent,
  RouteSceneSwitchHeaderActionModeTarget,
  RouteSceneSwitchMotionPlane,
  RouteSceneSwitchPollsParams,
  RouteSceneSwitchRouteAction,
  RouteSceneSwitchRouteParams,
  RouteSceneSwitchSheetContentHandoff,
  RouteSceneSwitchSheetMotionPlan,
  RouteSceneSwitchSheetOpenerSource,
  RouteSceneSwitchSheetSnapPersistence,
  RouteSceneSwitchSheetIntent,
  RouteSceneSwitchSheetTransitionKind,
  RouteSceneSwitchSheetTransitionPlan,
  RouteSceneSwitchSheetVisibilityTarget,
} from './app-overlay-route-transition-contract';
import { PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT } from './app-overlay-route-transition-contract';
import {
  resolveAppRouteSceneHeaderActionModeTarget,
  resolveAppRouteSceneChromeVisibilityTarget,
  resolveAppRouteSceneSheetHostSceneKey,
  resolveAppRouteSceneSheetVisibilityTarget,
} from './app-route-scene-policy-registry';
import { selectOverlayRouteKeysWhere } from './app-overlay-route-types';
import type { SearchFreezeClassification } from '../../screens/Search/runtime/shared/search-freeze-classification-runtime';

export type AppRouteSceneTransitionPolicyInput = {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  settleToken?: number | null;
  snapTarget?: BottomSheetSnap | null;
  sheetIntent?: RouteSceneSwitchSheetIntent | null;
  sheetTransitionKind?: RouteSceneSwitchSheetTransitionKind;
  sheetOpenerSource?: RouteSceneSwitchSheetOpenerSource;
  sheetMotion?: RouteSceneSwitchSheetMotionPlan;
  contentHandoff?: RouteSceneSwitchSheetContentHandoff;
  snapPersistence?: RouteSceneSwitchSheetSnapPersistence;
  cameraIntent?: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget?: RouteSceneSwitchChromeVisibilityTarget;
  pollsParams?: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreSnap?: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null;
  routeAction?: RouteSceneSwitchRouteAction;
  routeParams?: RouteSceneSwitchRouteParams;
  // Phase 2 — see RouteSceneSwitchRequestInput.contentReadinessTransactionId.
  contentReadinessTransactionId?: string | null;
  currentRootRouteKey: OverlayKey;
  resolveCurrentSheetSnapTarget: (sceneKey: OverlayKey) => BottomSheetSnap | null;
};

export type AppRouteSceneTransitionPlan = {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  committedRootRouteKey: OverlayKey;
  committedRouteAction: RouteSceneSwitchRouteAction;
  committedRouteParams: RouteSceneSwitchRouteParams | undefined;
  settleToken: number | null;
  snapTarget: BottomSheetSnap | null;
  sheetHostSceneKey: OverlayKey | null;
  sheetSnapTarget: BottomSheetSnap | null;
  sheetVisibilityTarget: RouteSceneSwitchSheetVisibilityTarget;
  sheetIntent: RouteSceneSwitchSheetIntent | null;
  sheetTransitionPlan: RouteSceneSwitchSheetTransitionPlan;
  cameraIntent: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget: RouteSceneSwitchChromeVisibilityTarget;
  headerActionModeTarget: RouteSceneSwitchHeaderActionModeTarget;
  freezeClassification: SearchFreezeClassification;
  motionPlanes: readonly RouteSceneSwitchMotionPlane[];
  pollsParams: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreSnap: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null;
  // Phase 2 — passed through so the controller's content-plane arm can link the
  // redraw transactionId (gate marks) to the minted settleToken. null for every
  // non-search-family switch.
  contentReadinessTransactionId: string | null;
};

const isPreserveCameraIntent = (cameraIntent: RouteSceneSwitchCameraIntent): boolean =>
  cameraIntent.kind === 'preserve';

const isPreserveChromeTarget = (
  chromeVisibilityTarget: RouteSceneSwitchChromeVisibilityTarget
): boolean => chromeVisibilityTarget.searchChrome === 'preserve';

const resolveRouteSceneSwitchSnapTarget = ({
  snapTarget,
}: Pick<AppRouteSceneTransitionPolicyInput, 'snapTarget'>): BottomSheetSnap | null => {
  if (snapTarget !== undefined) {
    return snapTarget;
  }
  return null;
};

const SHARED_SHEET_HOST_SCENE_KEY: OverlayKey = 'searchRoute';

const TOP_LEVEL_SHARED_SHEET_SCENES = new Set<OverlayKey>([
  'search',
  'polls',
  'bookmarks',
  'profile',
]);

// Derived from the central metadata (role 'child' on the shared physical sheet)
// — adding such a scene needs only its metadata entry, with no hand-edit here.
// Today: { restaurant, saveList, pollCreation, pollDetail }.
const CHILD_SHARED_SHEET_SCENES = new Set<OverlayKey>(
  selectOverlayRouteKeysWhere(
    (metadata) => metadata.role === 'child' && metadata.sheetPolicy === 'sharedPhysicalSheet'
  )
);

const MODAL_SCENES = new Set<OverlayKey>(['price', 'scoreInfo']);

// SEEDED forward-open scenes (the descriptor table's `seeded` axis). A seeded scene can
// paint its OWN shell immediately from route params (e.g. pollDetail's seeded header +
// comment skeleton, profile's transition shell, the form shells of pollCreation/saveList),
// so a forward open into it should NOT hold the outgoing surface visible — it swaps to the
// incoming seed in the same frame (no stale-feed window). This central set replaces the
// per-call-site swapImmediately opt-outs. Covers the openChild targets (saveList/
// pollCreation/pollDetail/restaurant) and the profile topLevelSwitch target — see
// resolveContentHandoff's seeded branch.
//
// Hard-swap + skeleton (canonical-transition-finish-plan): `restaurant` is now SEEDED. A
// restaurant reveal hard-swaps to its frame-1 render — the RestaurantPanel paints a
// dish-skeleton seed shell at once (warm-seeded header NAME + dish-list skeleton) while
// the committed single-restaurant search (`runRestaurantEntitySearch` + pending-selection
// warm-profile auto-open) resolves and fills the content in. The header name is real at
// frame 1 because the launch-intent runtime calls openRestaurantProfilePreview(id, name)
// SYNCHRONOUSLY (seedRestaurantProfile) before the committed search — same warm-seed the
// recently-viewed-restaurant tap uses. Holding the outgoing surface visible during that load
// would only show a stale feed, so it swaps immediately like the other seeded scenes. Sheet
// motion is unaffected — the natural openChild `{promoteAtLeast,middle}` snap
// (resolveDefaultSheetMotionPlan) still applies; only the CONTENT handoff flips from
// held-outgoing crossfade to skeleton-first swapImmediately.
//
// Return-to-origin foundation (cover-orphan blank fix): `bookmarks` is now SEEDED. A
// topLevelSwitch into bookmarks — a plain bookmarks forward-open OR a favorites-as-search
// dismiss that re-roots to the captured bookmarks origin — has NO usable content-readiness
// gate: bookmarks is absent from SCENE_READINESS_CONTRACT_BY_TARGET (→ EMPTY contract,
// requiredContentGates:[]), so the arm site mints contentReadinessTransactionId=null and
// NEVER links the 'content' plane to any readiness signal. Left on the default
// `preserveOutgoingUntilSettle`, such a switch armed a content plane that could only complete
// via the 600ms SCENE_READINESS_LIVENESS_MS watchdog — and resolveTransitionSheetPresentation-
// SceneKey kept presenting the HELD outgoing handoff (the dismissing search surface) for that
// whole window, so the incoming bookmarks body got no render gate → BLANK. Like the other
// seeded scenes, BookmarksPanel paints its OWN shell on frame 1 (SceneLoadingSurface
// rowType="tile" while `!sceneReady || isListsLoading`), so it must hard-swap to that skeleton:
// swapImmediately → no held outgoing → no 'content' plane → skeleton-first, fills when data
// lands. Mirrors `profile` (also a seeded topLevelSwitch target with an empty content
// contract). SEARCH/POLLS are intentionally NOT here — they keep their reveal join and the
// degenerate {polls,search}@collapsed home seam stays byte-identical.
const SEEDED_FORWARD_OPEN_SCENES = new Set<OverlayKey>([
  'pollDetail',
  'pollCreation',
  'saveList',
  'profile',
  'restaurant',
  'bookmarks',
]);

const isSharedSheetChildScene = (sceneKey: OverlayKey): boolean =>
  CHILD_SHARED_SHEET_SCENES.has(sceneKey);

const resolveInferredSheetTransitionKind = ({
  sourceSceneKey,
  targetSceneKey,
  routeAction,
  snapTarget,
}: Pick<
  AppRouteSceneTransitionPolicyInput,
  'sourceSceneKey' | 'targetSceneKey' | 'routeAction' | 'snapTarget'
>): RouteSceneSwitchSheetTransitionKind => {
  if (MODAL_SCENES.has(targetSceneKey)) {
    return 'modalOpen';
  }
  if (snapTarget === 'hidden') {
    return 'terminalDismiss';
  }
  if (routeAction === 'closeActive' || routeAction === 'popToRoot') {
    return isSharedSheetChildScene(sourceSceneKey) ? 'closeChild' : 'topLevelSwitch';
  }
  if (routeAction === 'push' || routeAction === 'updateActive') {
    return isSharedSheetChildScene(targetSceneKey) ? 'openChild' : 'topLevelSwitch';
  }
  if (sourceSceneKey === targetSceneKey) {
    return 'gesture';
  }
  if (TOP_LEVEL_SHARED_SHEET_SCENES.has(targetSceneKey)) {
    return 'topLevelSwitch';
  }
  return isSharedSheetChildScene(targetSceneKey) ? 'openChild' : 'bootstrap';
};

const resolveCurrentSharedSheetSnap = (
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget']
): BottomSheetSnap | null =>
  resolveCurrentSheetSnapTarget(SHARED_SHEET_HOST_SCENE_KEY) ??
  resolveCurrentSheetSnapTarget('search') ??
  null;

const resolvePromotedSnapTarget = ({
  promoteAtLeastSnap,
  resolveCurrentSheetSnapTarget,
}: {
  promoteAtLeastSnap: Exclude<BottomSheetSnap, 'hidden'>;
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget'];
}): BottomSheetSnap | null => {
  const currentSnap = resolveCurrentSharedSheetSnap(resolveCurrentSheetSnapTarget);
  if (currentSnap === 'expanded') {
    return null;
  }
  if (promoteAtLeastSnap === 'middle' && currentSnap === 'middle') {
    return null;
  }
  return promoteAtLeastSnap;
};

const resolveDefaultSheetMotionPlan = ({
  targetSceneKey,
  transitionKind,
  explicitSnapTarget,
  resolveCurrentSheetSnapTarget,
}: {
  targetSceneKey: OverlayKey;
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  explicitSnapTarget: BottomSheetSnap | null;
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget'];
}): RouteSceneSwitchSheetMotionPlan => {
  if (MODAL_SCENES.has(targetSceneKey)) {
    return { kind: 'none' };
  }
  if (explicitSnapTarget != null) {
    return explicitSnapTarget === 'hidden'
      ? { kind: 'hide' }
      : { kind: 'snapTo', snap: explicitSnapTarget };
  }
  switch (transitionKind) {
    case 'terminalDismiss':
      return { kind: 'hide' };
    case 'openChild':
      // Per-scene open snap (curated, not metadata-derived: the values are
      // distinct motion plans — snapTo vs promoteAtLeast vs the preserveLiveY
      // fall-through — so they don't reduce to one field). Forgetting a new child
      // here degrades gracefully to preserveLiveY rather than breaking. Full-page
      // children (saveList / pollCreation / pollDetail) open expanded:
      if (
        targetSceneKey === 'saveList' ||
        targetSceneKey === 'pollCreation' ||
        targetSceneKey === 'pollDetail'
      ) {
        return { kind: 'snapTo', snap: 'expanded' };
      }
      if (targetSceneKey === 'restaurant') {
        return { kind: 'promoteAtLeast', snap: 'middle' };
      }
      return { kind: 'preserveLiveY' };
    case 'closeChild':
      return { kind: 'preserveLiveY' };
    case 'topLevelSwitch':
      if (targetSceneKey === 'search' || targetSceneKey === 'polls') {
        return { kind: 'snapTo', snap: 'collapsed' };
      }
      if (targetSceneKey === 'bookmarks' || targetSceneKey === 'profile') {
        const currentSnap = resolveCurrentSharedSheetSnap(resolveCurrentSheetSnapTarget);
        return currentSnap != null && currentSnap !== 'hidden' && currentSnap !== 'collapsed'
          ? { kind: 'preserveLiveY' }
          : { kind: 'snapTo', snap: 'expanded' };
      }
      return { kind: 'preserveLiveY' };
    case 'gesture':
    case 'modalClose':
    case 'bootstrap':
    default:
      return { kind: 'preserveLiveY' };
  }
};

const resolveSnapTargetFromSheetMotion = ({
  motion,
  resolveCurrentSheetSnapTarget,
}: {
  motion: RouteSceneSwitchSheetMotionPlan;
  resolveCurrentSheetSnapTarget: AppRouteSceneTransitionPolicyInput['resolveCurrentSheetSnapTarget'];
}): BottomSheetSnap | null => {
  switch (motion.kind) {
    case 'snapTo':
      return motion.snap;
    case 'hide':
      return 'hidden';
    case 'promoteAtLeast':
      return resolvePromotedSnapTarget({
        promoteAtLeastSnap: motion.snap,
        resolveCurrentSheetSnapTarget,
      });
    case 'none':
    case 'preserveLiveY':
    default:
      return null;
  }
};

const resolveContentHandoff = ({
  transitionKind,
  targetSceneKey,
  contentHandoff,
}: {
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  targetSceneKey: OverlayKey;
  contentHandoff?: RouteSceneSwitchSheetContentHandoff;
}): RouteSceneSwitchSheetContentHandoff => {
  if (contentHandoff != null) {
    return contentHandoff;
  }
  // DISMISS byte-identity, DECLARED (not emergent from "preserveLiveY emits no motion planes"):
  // closeChild / modalClose are back-nav dismisses with no sheet slide — keep them on the instant
  // swap so a future dismiss that happens to carry a `snapTo` can never silently arm the leaf
  // crossfade. (terminalDismiss DOES preserve — for its sheet SLIDE; its leaf crossfade is
  // separately gated out via isForwardOpenCrossfade's `!== 'terminalDismiss'` check.)
  if (transitionKind === 'closeChild' || transitionKind === 'modalClose') {
    return 'swapImmediately';
  }
  if (transitionKind === 'terminalDismiss') {
    return 'preserveOutgoingUntilSettle';
  }
  // SEEDED forward open (descriptor `seeded` axis): the incoming scene paints its OWN shell
  // immediately from route params (seeded header + skeleton), so HOLDING the outgoing surface
  // visible only shows a stale feed while the incoming's data loads. Swap to the seed at once.
  if (
    (transitionKind === 'openChild' || transitionKind === 'topLevelSwitch') &&
    SEEDED_FORWARD_OPEN_SCENES.has(targetSceneKey)
  ) {
    return 'swapImmediately';
  }
  // Overlap engine: hold the outgoing in-flight so the leaf content crossfades. The sheet
  // shell/snap is decoupled to follow the TARGET (navPush), so the sheet rises to the
  // incoming's snap instead of descending to the held search surface's collapsed snap.
  return 'preserveOutgoingUntilSettle';
};

const resolveSnapPersistence = ({
  transitionKind,
  snapPersistence,
}: {
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  snapPersistence?: RouteSceneSwitchSheetSnapPersistence;
}): RouteSceneSwitchSheetSnapPersistence => {
  if (snapPersistence != null) {
    return snapPersistence;
  }
  if (transitionKind === 'gesture') {
    return 'writeSceneMemory';
  }
  if (transitionKind === 'topLevelSwitch') {
    return 'readSceneMemory';
  }
  return 'sharedOnly';
};

const resolveMotionPlanes = ({
  sheetIntent,
  cameraIntent,
  chromeVisibilityTarget,
  sourceSceneKey,
  targetSceneKey,
  sheetVisibilityTarget,
  transitionKind,
  contentHandoff,
}: Pick<
  AppRouteSceneTransitionPlan,
  'sheetIntent' | 'cameraIntent' | 'chromeVisibilityTarget' | 'sheetVisibilityTarget'
> & {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  contentHandoff: RouteSceneSwitchSheetContentHandoff;
}): readonly RouteSceneSwitchMotionPlane[] => {
  const motionPlanes: RouteSceneSwitchMotionPlane[] = [];
  if (sheetIntent != null) {
    motionPlanes.push('sheet');
  }
  if (!isPreserveCameraIntent(cameraIntent)) {
    motionPlanes.push('camera');
  }
  if (!isPreserveChromeTarget(chromeVisibilityTarget)) {
    motionPlanes.push('chrome');
  }
  // The 'content' plane holds the transition in-flight for the overlap crossfade window.
  // Open it ONLY for a genuine FORWARD OPEN — a real scene change (same-scene re-entry opens
  // none) that RISES to a visible snap and is NOT a dismiss. This is the same predicate the
  // sheet-host controller arms the leaf crossfade on (isForwardOpenCrossfade). Gating it here
  // keeps every DISMISS byte-identical: a `closeChild`/preserveLiveY dismiss has no sheet/
  // camera/chrome plane and now no 'content' plane → motionPlanes is [] → it commits to idle
  // SYNCHRONOUSLY (its onSettle callbacks fire immediately, not gated behind the
  // SCENE_READINESS_LIVENESS_MS=600ms content watchdog); a collapse-snap `terminalDismiss`
  // keeps only its 'sheet' plane.
  //
  // Invariant 5 (canonical-sheet-transition-master-plan §6): the content plane arms IFF a
  // crossfade will actually run — i.e. iff the resolved handoff held the outgoing leg in flight
  // (`preserveOutgoingUntilSettle`). SEEDED forward opens resolve to `swapImmediately` (they paint
  // their own seed in one frame, no outgoing leg held, no crossfade), so they must arm NO content
  // plane — otherwise they mint a settleToken nothing closes and fall to the
  // SCENE_READINESS_LIVENESS_MS=600ms watchdog. Gating
  // on the handoff (the canonical signal both resolvers share) makes the two resolvers agree by
  // construction.
  const isForwardOpenCandidate =
    sourceSceneKey !== targetSceneKey &&
    sheetVisibilityTarget === 'visible' &&
    transitionKind !== 'terminalDismiss';
  if (isForwardOpenCandidate && contentHandoff === 'preserveOutgoingUntilSettle') {
    motionPlanes.push('content');
  }
  return motionPlanes;
};

const resolveCommittedRootRoute = ({
  currentRootRouteKey,
  routeAction,
  targetSceneKey,
}: {
  currentRootRouteKey: OverlayKey;
  routeAction: RouteSceneSwitchRouteAction;
  targetSceneKey: OverlayKey;
}): OverlayKey => {
  if (routeAction === 'preserve') {
    return currentRootRouteKey;
  }
  return targetSceneKey === 'polls' ? 'search' : targetSceneKey;
};

const resolveDockedPollsRestoreSnap = ({
  targetSceneKey,
  snapTarget,
  dockedPollsRestoreSnap,
}: {
  targetSceneKey: OverlayKey;
  snapTarget: BottomSheetSnap | null;
  dockedPollsRestoreSnap: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null | undefined;
}): RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null => {
  if (dockedPollsRestoreSnap !== undefined) {
    return dockedPollsRestoreSnap;
  }
  if (targetSceneKey !== 'polls') {
    return null;
  }
  if (snapTarget != null && snapTarget !== 'hidden') {
    return snapTarget;
  }
  return 'collapsed';
};

export const resolveAppRouteSceneTransitionPlan = ({
  sourceSceneKey,
  targetSceneKey,
  settleToken,
  snapTarget,
  sheetIntent,
  sheetTransitionKind,
  sheetOpenerSource,
  sheetMotion,
  contentHandoff,
  snapPersistence,
  cameraIntent = PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
  chromeVisibilityTarget,
  pollsParams,
  dockedPollsRestoreSnap,
  routeAction = 'setRoot',
  routeParams,
  contentReadinessTransactionId,
  currentRootRouteKey,
  resolveCurrentSheetSnapTarget,
}: AppRouteSceneTransitionPolicyInput): AppRouteSceneTransitionPlan => {
  const resolvedSnapTarget = resolveRouteSceneSwitchSnapTarget({
    snapTarget,
  });
  const resolvedTransitionKind =
    sheetTransitionKind ??
    resolveInferredSheetTransitionKind({
      sourceSceneKey,
      targetSceneKey,
      routeAction,
      snapTarget,
    });
  const resolvedSheetMotion =
    sheetMotion ??
    resolveDefaultSheetMotionPlan({
      targetSceneKey,
      transitionKind: resolvedTransitionKind,
      explicitSnapTarget: resolvedSnapTarget,
      resolveCurrentSheetSnapTarget,
    });
  const resolvedSheetSnapTarget = resolveSnapTargetFromSheetMotion({
    motion: resolvedSheetMotion,
    resolveCurrentSheetSnapTarget,
  });
  const resolvedSheetIntent =
    sheetIntent !== undefined
      ? sheetIntent
      : resolvedSheetSnapTarget == null
        ? null
        : {
            sceneKey: resolveAppRouteSceneSheetHostSceneKey(targetSceneKey) ?? targetSceneKey,
            snapTarget: resolvedSheetSnapTarget,
            role: 'incoming' as const,
          };
  const resolvedChromeVisibilityTarget =
    chromeVisibilityTarget ??
    resolveAppRouteSceneChromeVisibilityTarget({
      targetSceneKey,
      snapTarget: resolvedSheetSnapTarget,
    });
  const sheetHostSceneKey =
    resolvedSheetIntent?.sceneKey ?? resolveAppRouteSceneSheetHostSceneKey(targetSceneKey);
  const sheetSnapTarget = resolvedSheetIntent?.snapTarget ?? resolvedSheetSnapTarget;
  // Resolve the content handoff ONCE so the transition plan and resolveMotionPlanes share the
  // exact same canonical signal — Invariant 5's content-plane gate keys on this value, so the
  // two resolvers can never disagree about whether a crossfade will run.
  const resolvedContentHandoff = resolveContentHandoff({
    transitionKind: resolvedTransitionKind,
    targetSceneKey,
    contentHandoff,
  });
  const resolvedSheetTransitionPlan: RouteSceneSwitchSheetTransitionPlan = {
    transitionKind: resolvedTransitionKind,
    sourceSceneKey,
    targetSceneKey,
    openerSceneKey: sourceSceneKey,
    openerSource: sheetOpenerSource ?? 'unknown',
    motion: resolvedSheetMotion,
    contentHandoff: resolvedContentHandoff,
    snapPersistence: resolveSnapPersistence({
      transitionKind: resolvedTransitionKind,
      snapPersistence,
    }),
  };

  return {
    sourceSceneKey,
    targetSceneKey,
    settleToken: settleToken ?? null,
    committedRootRouteKey: resolveCommittedRootRoute({
      currentRootRouteKey,
      routeAction,
      targetSceneKey,
    }),
    committedRouteAction: routeAction,
    committedRouteParams: routeParams,
    snapTarget: resolvedSheetSnapTarget,
    sheetHostSceneKey,
    sheetSnapTarget,
    sheetVisibilityTarget: resolveAppRouteSceneSheetVisibilityTarget({
      snapTarget: sheetSnapTarget,
    }),
    sheetIntent: resolvedSheetIntent,
    sheetTransitionPlan: resolvedSheetTransitionPlan,
    cameraIntent,
    chromeVisibilityTarget: resolvedChromeVisibilityTarget,
    headerActionModeTarget: resolveAppRouteSceneHeaderActionModeTarget(targetSceneKey),
    freezeClassification: 'none',
    motionPlanes: resolveMotionPlanes({
      sheetIntent: resolvedSheetIntent,
      cameraIntent,
      chromeVisibilityTarget: resolvedChromeVisibilityTarget,
      sourceSceneKey,
      targetSceneKey,
      sheetVisibilityTarget: resolveAppRouteSceneSheetVisibilityTarget({
        snapTarget: sheetSnapTarget,
      }),
      transitionKind: resolvedTransitionKind,
      contentHandoff: resolvedContentHandoff,
    }),
    pollsParams: targetSceneKey === 'polls' ? (pollsParams ?? null) : null,
    dockedPollsRestoreSnap: resolveDockedPollsRestoreSnap({
      targetSceneKey,
      snapTarget: resolvedSheetSnapTarget,
      dockedPollsRestoreSnap,
    }),
    contentReadinessTransactionId: contentReadinessTransactionId ?? null,
  };
};
