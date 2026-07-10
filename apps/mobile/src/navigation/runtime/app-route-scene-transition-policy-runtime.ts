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
import {
  lookupDefaultSheetMotionDescriptorRow,
  lookupMandateSheetMotionDescriptorRow,
  materializeSheetMotionDescriptorRule,
} from './app-route-sheet-motion-descriptor-table';
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
  cameraIntent?: RouteSceneSwitchCameraIntent;
  chromeVisibilityTarget?: RouteSceneSwitchChromeVisibilityTarget;
  pollsParams?: RouteSceneSwitchPollsParams | null;
  dockedPollsRestoreSnap?: RouteSceneSwitchDockedPollsRestoreIntent['snap'] | null;
  routeAction?: RouteSceneSwitchRouteAction;
  routeEntryId?: string;
  routeParams?: RouteSceneSwitchRouteParams;
  // Phase 2 — see RouteSceneSwitchRequestInput.contentReadinessTransactionId.
  contentReadinessTransactionId?: string | null;
  currentRootRouteKey: OverlayKey;
  resolveCurrentSheetSnapTarget: (sceneKey: OverlayKey) => BottomSheetSnap | null;
  /**
   * The per-scene remembered detent (the snap-session's sceneSheetSnaps ledger) — feeds the
   * descriptor table's 'rememberedDetent' rule (TRUE per-page memory, owner decision 2026-07-02).
   */
  resolveSceneRememberedSnap: (sceneKey: OverlayKey) => BottomSheetSnap | null;
};

export type AppRouteSceneTransitionPlan = {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  committedRootRouteKey: OverlayKey;
  committedRouteAction: RouteSceneSwitchRouteAction;
  committedRouteEntryId: string | null;
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

const SHARED_SHEET_HOST_SCENE_KEY: OverlayKey = 'sheetHost';

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
// contract).
//
// P4 instant switch (page-switch-master-plan.md §6-P4): `polls` is now SEEDED for nav-switch
// targets. The polls leg is ALWAYS-MOUNTED with a live body from boot (the docked-polls home),
// so a topLevelSwitch into it (nav-tab press from bookmarks/profile/search) has nothing to
// crossfade toward — holding the outgoing feed only delays the press-up→content flip; the
// skeleton fallback covers any cold gap. swapImmediately → the switch hard-swaps in the same
// frame, exactly like the other nav pages. This branch only ever sees polls via
// openChild/topLevelSwitch, so every dismiss stays byte-identical: closeChild/modalClose/
// terminalDismiss are resolved ABOVE this branch, and the results→home dismiss
// (dismissAppSearchRouteResultsToHome) passes an EXPLICIT
// contentHandoff:'preserveOutgoingUntilSettle' which short-circuits before any set lookup.
// The degenerate polls@collapsed home seam is same-scene ('gesture'), never this branch.
//
// P5 (page-switch-master-plan.md §6-P5 / owner req 2e): `search` is now SEEDED. The search leg
// is NEVER-NULL (SearchResultsPageBundleHost renders a real results-skeleton page when the
// bundle hasn't published), so a forward open into search hard-swaps to that skeleton in the
// same frame — no held-outgoing crossfade, no 'content' plane, and therefore NO
// SCENE_READINESS_LIVENESS watchdog lane for scene:'search' (the old ~615ms anomaly). The
// reveal JOIN is untouched: the {cards, nativeMarkerFrame, sheet} readiness collector still
// fires at the same time — it now completes the skeleton→results swap inside the leg and
// commits the search switch's PresentationFrame paint-ack (controller
// evaluateContentReadinessForTransaction) instead of releasing a self-frost cover. The
// results→home dismiss is untouched by this set: dismissAppSearchRouteResultsToHome (the
// ONE-SWITCH home dismissal, target 'search') passes an EXPLICIT
// contentHandoff:'preserveOutgoingUntilSettle' that short-circuits before this set is
// consulted.
const SEEDED_FORWARD_OPEN_SCENES = new Set<OverlayKey>([
  'pollDetail',
  'pollCreation',
  'saveList',
  'profile',
  'restaurant',
  'bookmarks',
  'polls',
  'search',
  // Stub-pass child scenes (plans/page-registry.md §1): static mounted placeholder bodies paint
  // their own shell on frame 1 (same as saveList) → hard-swap, no held-outgoing crossfade.
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
  'shareConfig',
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
  if (
    routeAction === 'closeActive' ||
    routeAction === 'popToRoot' ||
    routeAction === 'popToEntry'
  ) {
    // S-C.3-B item 5: the kind derives from the STACK OPERATION — a pop is a CLOSE, whatever
    // scene is popping (child, search session, future orphan pages). The old per-scene-set
    // membership test ('is the source a shared-sheet child?') predates entries-as-values;
    // every live pop verb also passes its kind explicitly, so this inference is the
    // fallback rule, and the rule is: pops close.
    return 'closeChild';
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

// P6 step 1 (page-switch-master-plan.md §6-P6, owner req 2d): the default snap DECISION lives in
// the sheet-motion descriptor table (app-route-sheet-motion-descriptor-table.ts) — one declarative
// row per (fromScene, toScene, transitionKind), most-specific wins. This resolver only sequences
// the documented precedence: mandate rows → call-site explicit snapTarget → default rows. The
// KEPT snap spring still executes whatever plan the row materializes to; behavior is
// byte-identical to the old inline switch (pinned by app-route-sheet-motion-descriptor-table.spec.ts).
export const resolveDefaultSheetMotionPlan = ({
  sourceSceneKey,
  targetSceneKey,
  transitionKind,
  explicitSnapTarget,
  resolveSceneRememberedSnap,
}: {
  sourceSceneKey: OverlayKey;
  targetSceneKey: OverlayKey;
  transitionKind: RouteSceneSwitchSheetTransitionKind;
  explicitSnapTarget: BottomSheetSnap | null;
  resolveSceneRememberedSnap: AppRouteSceneTransitionPolicyInput['resolveSceneRememberedSnap'];
}): RouteSceneSwitchSheetMotionPlan => {
  const descriptorQuery = {
    fromSceneKey: sourceSceneKey,
    toSceneKey: targetSceneKey,
    transitionKind,
  };
  const mandateRow = lookupMandateSheetMotionDescriptorRow(descriptorQuery);
  if (mandateRow != null) {
    return materializeSheetMotionDescriptorRule({
      rule: mandateRow.motion,
      toSceneKey: targetSceneKey,
      resolveSceneRememberedSnap,
    });
  }
  if (explicitSnapTarget != null) {
    return explicitSnapTarget === 'hidden'
      ? { kind: 'hide' }
      : { kind: 'snapTo', snap: explicitSnapTarget };
  }
  return materializeSheetMotionDescriptorRule({
    rule: lookupDefaultSheetMotionDescriptorRow(descriptorQuery).motion,
    toSceneKey: targetSceneKey,
    resolveSceneRememberedSnap,
  });
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
  // modalOpen renders ABOVE the sheet (no leg swap) — pin it off the held-outgoing default so a
  // content plane can never arm for a non-leg scene (today it's only unreachable EMERGENTLY, via
  // snapTarget:null → sheetVisibilityTarget:'preserve'); protects the "the 600ms
  // SCENE_READINESS_LIVENESS watchdog never fires" claim if modal snap resolution ever changes.
  if (transitionKind === 'modalOpen') {
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
  cameraIntent = PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
  chromeVisibilityTarget,
  pollsParams,
  dockedPollsRestoreSnap,
  routeAction = 'setRoot',
  routeEntryId,
  routeParams,
  contentReadinessTransactionId,
  currentRootRouteKey,
  resolveCurrentSheetSnapTarget,
  resolveSceneRememberedSnap,
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
      sourceSceneKey,
      targetSceneKey,
      transitionKind: resolvedTransitionKind,
      explicitSnapTarget: resolvedSnapTarget,
      resolveSceneRememberedSnap,
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
    committedRouteEntryId: routeEntryId ?? null,
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
