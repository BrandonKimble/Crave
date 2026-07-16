import React, { useSyncExternalStore } from 'react';
import {
  commitTransitionTxn,
  getLiveTransitionTxn,
  offerTransitionJoinInput,
  sealTransitionTxnJoin,
  settleTransitionTxn,
  stageTransitionTxn,
  subscribeTransitionTxn,
  type TransitionJoinInput,
} from '../../../../navigation/runtime/transition-engine/transition-transaction';
import { reportSearchFlowContractViolation } from '../shared/search-flow-contracts';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { logger } from '../../../../utils';
import type {
  SearchRouteSceneBodyContentSpec,
  SearchRouteSceneBodyTransportSpec,
} from '../../../../overlays/searchOverlayRouteHostContract';
import type { OverlayKey } from '../../../../overlays/types';
import type { ResultsPresentationCoverState } from '../shared/search-surface-results-transaction';
export type SearchSurfaceRedrawReason = 'shortcut' | 'toggle' | 'search_this_area' | 'submit';
export type SearchSurfaceTargetTab = 'dishes' | 'restaurants';

export type SearchSurfaceResultsBodyBundle = {
  sceneBodyContent: Extract<SearchRouteSceneBodyContentSpec, { surfaceKind: 'list' }>;
  sceneBodyTransport: SearchRouteSceneBodyTransportSpec;
};

export type PollPageBundle = {
  kind: 'poll';
  bundleKey: string;
  chromeReady: boolean;
  bodyReady: boolean;
  hostReady: boolean;
  prewarmed: boolean;
};

export type ResultsPageBundle = {
  kind: 'results';
  bundleKey: string;
  transactionId: string | null;
  dataMode: 'transactional';
  coverState: ResultsPresentationCoverState;
  chromeReady: boolean;
  cardsReady: boolean;
  markersReady: boolean;
  bodyBundle: SearchSurfaceResultsBodyBundle | null;
  frozen: boolean;
};

export type SearchSurfacePageBundle = PollPageBundle | ResultsPageBundle;

export type SearchSurfaceRedrawTransaction = {
  id: string;
  reason: SearchSurfaceRedrawReason;
  dataMode: 'transactional';
  query: string | null;
  bounds: unknown | null;
  filters: unknown | null;
  targetTab: SearchSurfaceTargetTab | null;
  coverState: Exclude<ResultsPresentationCoverState, 'hidden'>;
  startedAtMs: number;
  committedAtMs: number | null;
};

export type SearchSurfaceDismissTransaction = {
  id: string;
  frozenResultsBundle: ResultsPageBundle;
  outgoingSheetSceneKey: OverlayKey | null;
  pollHeaderReady: boolean;
  pollBodyReady: boolean;
  pollHostReady: boolean;
  bottomBoundaryReached: boolean;
  bottomNavReturnReady: boolean;
  startedAtMs: number;
  committedAtMs: number | null;
};

export type SearchSurfaceSheetClipMode =
  | 'none'
  | 'dockedPersistentPoll'
  | 'staticPersistent'
  | 'animatedSearchTransition';

export type SearchSurfaceVisualPolicySnapshot = {
  transactionId: string | null;
  phase: 'idle' | 'results_redrawing' | 'results_dismissing';
  outgoingSheetSceneKey: OverlayKey | null;
  pollHeaderReady: boolean;
  pollBodyReady: boolean;
  pollHostReady: boolean;
  dismissBottomBoundaryReached: boolean;
  bottomNavReturnReady: boolean;
  canAdmitResultsBody: boolean;
  shouldHoldResultsHeader: boolean;
  shouldHoldSearchDisplayForPollRestore: boolean;
  canExposePersistentPolls: boolean;
  canDisplayPersistentPollSubstrate: boolean;
  canReleasePersistentPolls: boolean;
  bottomBandOwner: 'persistent_polls' | 'results_header';
  sheetClipMode: SearchSurfaceSheetClipMode;
};

export const EMPTY_SEARCH_SURFACE_VISUAL_POLICY: SearchSurfaceVisualPolicySnapshot = {
  transactionId: null,
  phase: 'idle',
  outgoingSheetSceneKey: null,
  pollHeaderReady: false,
  pollBodyReady: false,
  pollHostReady: false,
  dismissBottomBoundaryReached: false,
  bottomNavReturnReady: false,
  canAdmitResultsBody: true,
  shouldHoldResultsHeader: false,
  shouldHoldSearchDisplayForPollRestore: false,
  canExposePersistentPolls: false,
  canDisplayPersistentPollSubstrate: false,
  canReleasePersistentPolls: false,
  bottomBandOwner: 'persistent_polls',
  sheetClipMode: 'dockedPersistentPoll',
};

export const areSearchSurfaceVisualPoliciesEqual = (
  left: SearchSurfaceVisualPolicySnapshot,
  right: SearchSurfaceVisualPolicySnapshot
): boolean =>
  left.transactionId === right.transactionId &&
  left.phase === right.phase &&
  left.outgoingSheetSceneKey === right.outgoingSheetSceneKey &&
  left.pollHeaderReady === right.pollHeaderReady &&
  left.pollBodyReady === right.pollBodyReady &&
  left.pollHostReady === right.pollHostReady &&
  left.dismissBottomBoundaryReached === right.dismissBottomBoundaryReached &&
  left.bottomNavReturnReady === right.bottomNavReturnReady &&
  left.canAdmitResultsBody === right.canAdmitResultsBody &&
  left.shouldHoldResultsHeader === right.shouldHoldResultsHeader &&
  left.shouldHoldSearchDisplayForPollRestore === right.shouldHoldSearchDisplayForPollRestore &&
  left.canExposePersistentPolls === right.canExposePersistentPolls &&
  left.canDisplayPersistentPollSubstrate === right.canDisplayPersistentPollSubstrate &&
  left.canReleasePersistentPolls === right.canReleasePersistentPolls &&
  left.bottomBandOwner === right.bottomBandOwner &&
  left.sheetClipMode === right.sheetClipMode;

export const selectSearchSurfaceRouteGraphPolicy = (
  snapshot: SearchSurfaceRuntimeSnapshot
): SearchSurfaceVisualPolicySnapshot => selectSearchSurfaceVisualPolicy(snapshot);

export type NavSilhouetteRuntimeProjection = {
  owner: 'poll_page' | 'results_page' | 'held_results_page';
  material: 'frosted';
  bottomBandOwner: 'persistent_polls' | 'results_header';
  sheetClipMode: SearchSurfaceSheetClipMode;
};

export type SearchSurfaceRuntimeSnapshot = {
  version: number;
  activeBundle: SearchSurfacePageBundle;
  pollBundle: PollPageBundle;
  heldBundle: ResultsPageBundle | null;
  redrawTransaction: SearchSurfaceRedrawTransaction | null;
  completedRedrawTransaction: SearchSurfaceRedrawTransaction | null;
  /** THE SHEET-MOTION FENCE (redraw-object shrink): true = the sheet is not physically
   *  moving. SURFACE state, not transaction state — it flips per snap (start→false,
   *  settle→true) and holds heavy work (world commits, list-data fanout) off the slide.
   *  Previously smuggled inside redrawTransaction.readiness.sheetReady. */
  sheetMotionSettled: boolean;
  dismissTransaction: SearchSurfaceDismissTransaction | null;
  navSilhouette: NavSilhouetteRuntimeProjection;
};

// S-C.5 item 6a — NAMED bottom-band policy selectors (the nav-visual runtime's session-arm
// formulas, moved beside the policy they read so the "who owns the bottom band" vocabulary
// is testable and shared; world/camera L1-L5 will need the same answers).
export const selectIsPersistentPollHandoffCommitted = (
  policy: SearchSurfaceVisualPolicySnapshot
): boolean =>
  policy.phase === 'results_dismissing' &&
  policy.canReleasePersistentPolls &&
  policy.bottomBandOwner === 'persistent_polls';

export const selectIsTransitionOwnedResultsExit = (
  policy: SearchSurfaceVisualPolicySnapshot
): boolean =>
  policy.phase === 'results_dismissing' && !selectIsPersistentPollHandoffCommitted(policy);

export const selectIsSearchResultsSurfaceOwner = (
  policy: SearchSurfaceVisualPolicySnapshot
): boolean =>
  policy.bottomBandOwner === 'results_header' ||
  policy.sheetClipMode === 'animatedSearchTransition';

// The ONE derived fact for "the dismiss choreography has completed" — release means the
// choreography is done, not "the sheet touched bottom": a bottom-snap dismiss reaches
// the boundary at t0 (zero travel) while the nav is still sliding home; flipping to
// dockedPersistentPoll then pins the effective navTranslateY to 0 and the mask animates
// alone, exposing the map. Both the release policy and the commit stamp consume THIS
// derivation so the two can never drift.
export const isDismissChoreographyComplete = (
  dismissTransaction: Pick<
    SearchSurfaceDismissTransaction,
    'bottomBoundaryReached' | 'bottomNavReturnReady'
  >
): boolean => dismissTransaction.bottomBoundaryReached && dismissTransaction.bottomNavReturnReady;

export const selectSearchSurfaceVisualPolicy = (
  snapshot: SearchSurfaceRuntimeSnapshot
): SearchSurfaceVisualPolicySnapshot => {
  const redrawTransaction = snapshot.redrawTransaction;
  if (redrawTransaction != null) {
    return {
      transactionId: redrawTransaction.id,
      phase: 'results_redrawing',
      outgoingSheetSceneKey: null,
      pollHeaderReady: false,
      pollBodyReady: false,
      pollHostReady: false,
      dismissBottomBoundaryReached: false,
      bottomNavReturnReady: false,
      // Redraw-object shrink: a LIVE redraw = the episode is unjoined (its reveal
      // commits the redraw and clears this slot) — the readiness triple is gone.
      canAdmitResultsBody: false,
      shouldHoldResultsHeader: false,
      shouldHoldSearchDisplayForPollRestore: false,
      canExposePersistentPolls: false,
      canDisplayPersistentPollSubstrate: false,
      canReleasePersistentPolls: false,
      bottomBandOwner: 'results_header',
      sheetClipMode: 'animatedSearchTransition',
    };
  }

  const dismissTransaction = snapshot.dismissTransaction;
  if (dismissTransaction != null) {
    const canDisplayPersistentPollSubstrate =
      dismissTransaction.pollHeaderReady &&
      dismissTransaction.pollBodyReady &&
      dismissTransaction.pollHostReady;
    const canReleasePersistentPolls =
      canDisplayPersistentPollSubstrate && isDismissChoreographyComplete(dismissTransaction);
    return {
      transactionId: dismissTransaction.id,
      phase: 'results_dismissing',
      outgoingSheetSceneKey: dismissTransaction.outgoingSheetSceneKey,
      pollHeaderReady: dismissTransaction.pollHeaderReady,
      pollBodyReady: dismissTransaction.pollBodyReady,
      pollHostReady: dismissTransaction.pollHostReady,
      dismissBottomBoundaryReached: dismissTransaction.bottomBoundaryReached,
      bottomNavReturnReady: dismissTransaction.bottomNavReturnReady,
      canAdmitResultsBody: !canReleasePersistentPolls,
      shouldHoldResultsHeader: !canReleasePersistentPolls,
      shouldHoldSearchDisplayForPollRestore: false,
      canExposePersistentPolls: canReleasePersistentPolls,
      canDisplayPersistentPollSubstrate,
      canReleasePersistentPolls,
      bottomBandOwner: canReleasePersistentPolls ? 'persistent_polls' : 'results_header',
      sheetClipMode: canReleasePersistentPolls
        ? 'dockedPersistentPoll'
        : 'animatedSearchTransition',
    };
  }

  return {
    ...EMPTY_SEARCH_SURFACE_VISUAL_POLICY,
    bottomBandOwner: snapshot.navSilhouette.bottomBandOwner,
    sheetClipMode: snapshot.navSilhouette.sheetClipMode,
  };
};

export type BeginRedrawTransactionInput = {
  reason: SearchSurfaceRedrawReason;
  transactionId?: string | null;
  dataMode?: SearchSurfaceRedrawTransaction['dataMode'];
  query?: string | null;
  bounds?: unknown | null;
  filters?: unknown | null;
  targetTab?: SearchSurfaceTargetTab | null;
  coverState?: Exclude<ResultsPresentationCoverState, 'hidden'>;
};

type Listener = () => void;
type EqualityFn<T> = (left: T, right: T) => boolean;

export type SearchSurfaceMotionPlaneObservationTarget = {
  observeDismiss: (input: { transactionId: string }) => void;
  observeOpen: (input: { transactionId: string; onStarted: () => void }) => void;
};

export type SearchSurfaceDismissMotionArmInput = {
  transactionId?: string | null;
  outgoingSheetSceneKey?: OverlayKey | null;
};

const nowMs = (): number => globalThis.performance?.now?.() ?? Date.now();

// The polls page is ONE persistent scene — its identity never changes across search
// sessions. Per-transaction bundle keys (poll:prewarm:<id> / poll:<id>) leaked dismiss
// bookkeeping into PAGE IDENTITY, forcing a sheet-host runtime reseed (a full
// overlay-chain re-render, measured 40-110ms/commit) at dismiss-arm AND handoff —
// inside the dismiss choreography window (perf attribution 2026-07-12). Transaction
// identity lives on the dismiss transaction, where it belongs.
const POLL_PAGE_BUNDLE_KEY = 'poll:persistent';

const createPollBundle = (bundleKey: string, prewarmed = true): PollPageBundle => ({
  kind: 'poll',
  bundleKey,
  chromeReady: prewarmed,
  bodyReady: prewarmed,
  hostReady: prewarmed,
  prewarmed,
});

const createResultsBundle = ({
  transactionId,
  coverState,
  dataMode = 'transactional',
  cardsReady = coverState === 'hidden',
  markersReady = coverState === 'hidden',
  bodyBundle = null,
  chromeReady = true,
  frozen = false,
}: {
  transactionId: string | null;
  coverState: ResultsPresentationCoverState;
  dataMode?: ResultsPageBundle['dataMode'];
  cardsReady?: boolean;
  markersReady?: boolean;
  bodyBundle?: SearchSurfaceResultsBodyBundle | null;
  chromeReady?: boolean;
  frozen?: boolean;
}): ResultsPageBundle => ({
  kind: 'results',
  bundleKey: transactionId ?? 'results:committed',
  transactionId,
  dataMode,
  coverState,
  chromeReady,
  cardsReady,
  markersReady,
  bodyBundle,
  frozen,
});

const deriveNavSilhouetteProjection = (
  activeBundle: SearchSurfacePageBundle,
  heldBundle: ResultsPageBundle | null,
  dismissTransaction: SearchSurfaceDismissTransaction | null
): NavSilhouetteRuntimeProjection => {
  if (dismissTransaction != null && heldBundle != null) {
    return {
      owner: 'held_results_page',
      material: 'frosted',
      bottomBandOwner: 'results_header',
      sheetClipMode: 'animatedSearchTransition',
    };
  }

  if (activeBundle.kind === 'results') {
    return {
      owner: 'results_page',
      material: 'frosted',
      bottomBandOwner: 'results_header',
      sheetClipMode: 'animatedSearchTransition',
    };
  }

  return {
    owner: 'poll_page',
    material: 'frosted',
    bottomBandOwner: 'persistent_polls',
    sheetClipMode: 'dockedPersistentPoll',
  };
};

const isPollPageReleaseReadinessSource = (
  part: 'header' | 'body' | 'host',
  source: string
): boolean => {
  if (!source.startsWith('sceneStack:')) {
    return false;
  }
  return source.endsWith(`:${part}`);
};

const createInitialSnapshot = (): SearchSurfaceRuntimeSnapshot => {
  const activeBundle = createPollBundle(POLL_PAGE_BUNDLE_KEY);
  return {
    version: 0,
    activeBundle,
    pollBundle: activeBundle,
    heldBundle: null,
    redrawTransaction: null,
    completedRedrawTransaction: null,
    dismissTransaction: null,
    sheetMotionSettled: true,
    navSilhouette: deriveNavSilhouetteProjection(activeBundle, null, null),
  };
};

const areRedrawTransactionsEqual = (
  left: SearchSurfaceRedrawTransaction | null,
  right: SearchSurfaceRedrawTransaction | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.id === right.id &&
    left.reason === right.reason &&
    left.dataMode === right.dataMode &&
    left.query === right.query &&
    left.bounds === right.bounds &&
    left.filters === right.filters &&
    left.targetTab === right.targetTab &&
    left.coverState === right.coverState &&
    left.committedAtMs === right.committedAtMs);

const areResultsBundlesEqual = (
  left: ResultsPageBundle | null,
  right: ResultsPageBundle | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.bundleKey === right.bundleKey &&
    left.transactionId === right.transactionId &&
    left.dataMode === right.dataMode &&
    left.coverState === right.coverState &&
    left.chromeReady === right.chromeReady &&
    left.cardsReady === right.cardsReady &&
    left.markersReady === right.markersReady &&
    left.bodyBundle === right.bodyBundle &&
    left.frozen === right.frozen);

const arePollBundlesEqual = (left: PollPageBundle, right: PollPageBundle): boolean =>
  left.bundleKey === right.bundleKey &&
  left.chromeReady === right.chromeReady &&
  left.bodyReady === right.bodyReady &&
  left.hostReady === right.hostReady &&
  left.prewarmed === right.prewarmed;

const arePageBundlesEqual = (
  left: SearchSurfacePageBundle,
  right: SearchSurfacePageBundle
): boolean =>
  left.kind === right.kind &&
  (left.kind === 'poll' && right.kind === 'poll'
    ? arePollBundlesEqual(left, right)
    : left.kind === 'results' && right.kind === 'results'
      ? areResultsBundlesEqual(left, right)
      : false);

const areDismissTransactionsEqual = (
  left: SearchSurfaceDismissTransaction | null,
  right: SearchSurfaceDismissTransaction | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.id === right.id &&
    areResultsBundlesEqual(left.frozenResultsBundle, right.frozenResultsBundle) &&
    left.outgoingSheetSceneKey === right.outgoingSheetSceneKey &&
    left.pollHeaderReady === right.pollHeaderReady &&
    left.pollBodyReady === right.pollBodyReady &&
    left.pollHostReady === right.pollHostReady &&
    left.bottomBoundaryReached === right.bottomBoundaryReached &&
    left.bottomNavReturnReady === right.bottomNavReturnReady &&
    left.committedAtMs === right.committedAtMs);

const areNavSilhouetteRuntimeProjectionsEqual = (
  left: NavSilhouetteRuntimeProjection,
  right: NavSilhouetteRuntimeProjection
): boolean =>
  left.owner === right.owner &&
  left.material === right.material &&
  left.bottomBandOwner === right.bottomBandOwner &&
  left.sheetClipMode === right.sheetClipMode;

const areSearchSurfaceRuntimeSnapshotsEqual = (
  left: SearchSurfaceRuntimeSnapshot,
  right: SearchSurfaceRuntimeSnapshot
): boolean =>
  arePageBundlesEqual(left.activeBundle, right.activeBundle) &&
  arePollBundlesEqual(left.pollBundle, right.pollBundle) &&
  areResultsBundlesEqual(left.heldBundle, right.heldBundle) &&
  areRedrawTransactionsEqual(left.redrawTransaction, right.redrawTransaction) &&
  areRedrawTransactionsEqual(left.completedRedrawTransaction, right.completedRedrawTransaction) &&
  areDismissTransactionsEqual(left.dismissTransaction, right.dismissTransaction) &&
  left.sheetMotionSettled === right.sheetMotionSettled &&
  areNavSilhouetteRuntimeProjectionsEqual(left.navSilhouette, right.navSilhouette);

export class SearchSurfaceRuntime {
  private snapshot = createInitialSnapshot();

  private readonly listeners = new Set<Listener>();

  private motionPlaneObservationTarget: SearchSurfaceMotionPlaneObservationTarget | null = null;

  private transactionSeq = 0;

  private latestResultsBodyBundle: SearchSurfaceResultsBodyBundle | null = null;

  private pendingDismissMotionArm: {
    id: string;
  } | null = null;

  // Q-2 SHADOW (§Q redo — dissolving the parallel redraw-transaction family into THE
  // TransitionTxn): an IN-PLACE world redraw (toggle / re-slice / re-submit — no route
  // mutation, so no txn exists today) stages a 'revise' transaction whose join inputs
  // ARE the redraw's readiness marks. Shadow phase: trace-only — no consumer reads it;
  // the redraw family stays the driver until the traces prove the joins coincide.
  private q2ShadowTxnId: string | null = null;

  // ── S1 (reveal-pipeline unification design §2/§6): the unified producers maintain
  // RESIDENCY STATE with dirty-marking on divergence (probed live: a CACHED
  // re-present publishes nothing and acks nothing — edge-only evidence stays silent
  // while the pixels are already resident, so evidence must be state, edges notify):
  // - rows: resident iff the mounted store last published with a non-null identity;
  //   the submit reset (shell/identity-null publish) marks it non-resident.
  // - mapFrame: CLEAN when the wire acked the current frame OR an equal frame was
  //   dedupe-suppressed (native already holds it); DIRTY from the moment a differing
  //   frame is submitted until its ack.
  private q2RowsResident = false;
  private q2MapFrameClean = false;
  // S1 route-coupled enters (design §3): the world revise DEFERS until the route txn
  // terminates (engine notifies every live edge).
  private q2DeferredReviseArmId: string | null = null;
  private q2TxnSubscriptionStarted = false;

  /** Producer: the mounted store's rows-residency (identity non-null — full OR
   *  legitimately empty). Total across mouths by construction (§2). */
  public setWorldRowsResidency = (resident: boolean): void => {
    this.q2RowsResident = resident;
    if (resident) {
      this.offerQ2ShadowJoin('paint');
    }
  };

  /** Producer: native holds the episode's frame — the wire ACK, or an equal frame
   *  dedupe-suppressed (cached re-present). Total across lanes (§2). */
  public offerWorldMapFrameEvidence = (): void => {
    this.q2MapFrameClean = true;
    this.offerQ2ShadowJoin('mapFrame');
  };

  /** A differing frame went to the wire — the resident frame no longer proves the
   *  episode; evidence returns with its ack. */
  public markWorldMapFrameDirty = (): void => {
    this.q2MapFrameClean = false;
  };

  private pendingRedrawMotionArm: {
    id: string;
    input: Required<Omit<BeginRedrawTransactionInput, 'transactionId'>> &
      Pick<BeginRedrawTransactionInput, 'transactionId'>;
  } | null = null;

  // Issue-side sheet-motion expectation (markRedrawSheetMotionExpected): consumed by the
  // next arm publish — that transaction is born sheetReady:false. Cleared on every arm.
  private redrawSheetMotionExpectedTransactionId: string | null = null;

  public getSnapshot = (): SearchSurfaceRuntimeSnapshot => this.snapshot;

  public getActiveOrPendingRedrawTransactionId = (): string | null =>
    this.snapshot.redrawTransaction?.id ?? this.pendingRedrawMotionArm?.id ?? null;

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public subscribeSelector = <T>(
    selector: (snapshot: SearchSurfaceRuntimeSnapshot) => T,
    listener: Listener,
    isEqual: EqualityFn<T> = Object.is
  ): (() => void) => {
    let selected = selector(this.snapshot);
    return this.subscribe(() => {
      const nextSelected = selector(this.snapshot);
      if (isEqual(selected, nextSelected)) {
        return;
      }
      selected = nextSelected;
      listener();
    });
  };

  public registerMotionPlaneObservationTarget = (
    target: SearchSurfaceMotionPlaneObservationTarget
  ): (() => void) => {
    this.motionPlaneObservationTarget = target;
    if (
      this.snapshot.dismissTransaction != null &&
      !this.snapshot.dismissTransaction.bottomBoundaryReached
    ) {
      target.observeDismiss({
        transactionId: this.snapshot.dismissTransaction.id,
      });
    } else if (this.snapshot.redrawTransaction != null) {
      target.observeOpen({
        transactionId: this.snapshot.redrawTransaction.id,
        onStarted: () => {},
      });
    }
    return () => {
      if (this.motionPlaneObservationTarget === target) {
        this.motionPlaneObservationTarget = null;
      }
    };
  };

  public beginRedrawTransaction = ({
    reason,
    transactionId,
    query = null,
    bounds = null,
    filters = null,
    targetTab = null,
    coverState = reason === 'submit' ? 'initial_loading' : 'interaction_loading',
    dataMode = 'transactional',
  }: BeginRedrawTransactionInput): string => {
    if (__DEV__) console.log(`[T1DBG] beginRedrawTxn t=${performance.now().toFixed(1)}`);
    const id = transactionId ?? `search-surface-redraw:${++this.transactionSeq}`;
    this.pendingRedrawMotionArm = {
      id,
      input: {
        reason,
        transactionId: id,
        query,
        bounds,
        filters,
        targetTab,
        coverState,
        dataMode,
      },
    };
    this.logMotionPlaneArmContract('open', id);
    this.publishArmedRedrawTransaction(id);
    this.motionPlaneObservationTarget?.observeOpen({
      transactionId: id,
      onStarted: () => {},
    });
    return id;
  };

  private publishArmedRedrawTransaction(id: string): void {
    const pendingRedrawMotionArm = this.pendingRedrawMotionArm;
    if (pendingRedrawMotionArm == null || pendingRedrawMotionArm.id !== id) {
      return;
    }
    this.pendingRedrawMotionArm = null;
    const { reason, query, bounds, filters, targetTab, coverState, dataMode } =
      pendingRedrawMotionArm.input;
    this.publish({
      ...this.snapshot,
      activeBundle: createResultsBundle({
        transactionId: id,
        dataMode,
        coverState,
        cardsReady: false,
        markersReady: false,
        bodyBundle: this.latestResultsBodyBundle,
      }),
      heldBundle: null,
      redrawTransaction: {
        id,
        reason,
        dataMode,
        query,
        bounds,
        filters,
        targetTab,
        coverState,
        startedAtMs: nowMs(),
        committedAtMs: null,
      },
      completedRedrawTransaction: null,
      dismissTransaction: null,
      // THE FENCE, born-value (redraw-object shrink): true = no slide will run for a
      // stationary redraw (toggle / search-this-area / variant rerun); an enter that
      // ISSUES a reveal snap marks the slide EXPECTED (markRedrawSheetMotionExpected,
      // eye-verified 2026-07-13: snap START's runOnJS roundtrip lands ~10-30ms after
      // the command and heavy applies froze the slide's first frames through the gap).
      // Every snap-command path restores at settle (recordSharedSheetSnap).
      sheetMotionSettled: this.redrawSheetMotionExpectedTransactionId !== id,
    });
    this.redrawSheetMotionExpectedTransactionId = null;
    this.q2RedrawCommitPendingFenceRestore = false;
    this.stageQ2ShadowTransitionTxn(id);
  }

  // S1 episode stager (reveal-pipeline unification §2/§3): stationary in-place
  // revises stage immediately; a route-txn window or a motion-expected arm (a
  // route-coupled reveal ENTER) DEFERS the world episode until the route txn
  // terminates — with the S1 unified producers the deferred join is total (Q-2c's
  // falsification was the per-lane marks, not the two-txn shape).
  private stageQ2ShadowTransitionTxn(id: string): void {
    const liveTxn = getLiveTransitionTxn();
    if (
      liveTxn != null &&
      liveTxn.phase !== 'settled' &&
      liveTxn.phase !== 'superseded' &&
      liveTxn.phase !== 'revealed'
    ) {
      // A RE-ARM of the same interaction while OUR shadow is joining (attributed live:
      // toggles arm twice) keeps the shadow — nulling here orphaned it and every offer
      // bounced. A ROUTE txn's window defers the episode instead (design §3).
      if (liveTxn.txnId !== this.q2ShadowTxnId) {
        this.q2ShadowTxnId = null;
        this.q2DeferredReviseArmId = id;
        this.ensureQ2TxnSubscription();
      }
      return;
    }
    const bornSheetReady = this.snapshot.sheetMotionSettled !== false;
    if (!bornSheetReady) {
      // Motion-expected arm = a route-coupled reveal ENTER (design §3): the push txn
      // reveals the skeleton; the world episode defers until it terminates.
      this.q2ShadowTxnId = null;
      this.q2DeferredReviseArmId = id;
      this.ensureQ2TxnSubscription();
      return;
    }
    // Plans differ by REASON (semantics measured on the trace, 2026-07-15):
    // - toggle: a canonical swap — the cards swap IS the reveal ({paint}); the marker
    //   crossfade completes on its own native clock (2-5s dev-lane) and lands as the
    //   SETTLE, not a reveal input (declaring mapFrame parked reveal on a settle fact).
    // - world revise (new data): the T4 joint — cards land as the pins begin their
    //   fade, so reveal joins {paint, mapFrame} (measured 100-315ms).
    const isToggle = this.snapshot.redrawTransaction?.reason === 'toggle';
    const txn = stageTransitionTxn(
      { kind: 'revise', targetSceneKey: 'search', sourceSceneKey: 'search', entryId: null },
      {
        content: { kind: 'skeleton' },
        joinInputs: isToggle ? ['paint'] : ['paint', 'mapFrame'],
        movesSheet: false,
        // World revises are network+native-paced (~780ms dev-lane measured on the list
        // enter); the redraw family's own tier-1/tier-2 watchdog ladder (800ms/+800ms)
        // is the real never-stuck guarantee — the engine backstop sits just outside it.
        joinLivenessMs: isToggle ? undefined : 10000,
      }
    );
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    this.q2ShadowTxnId = txn.txnId;
    this.ensureQ2TxnSubscription();
    if (this.q2RowsResident) {
      this.offerQ2ShadowJoin('paint');
      if (this.q2MapFrameClean) {
        this.offerQ2ShadowJoin('mapFrame');
      }
    }
    this.seedQ2ShadowOffersFromCurrentReadiness();
  }

  // Readiness that landed BEFORE the shadow staged (marks arriving inside a prior route
  // txn's window — attributed live on the list-open enter) seeds as offers, so staging
  // order can never park the join.
  private seedQ2ShadowOffersFromCurrentReadiness(): void {
    // Redraw-object shrink: paint/mapFrame seed from the runtime's residency state
    // (already offered by the callers above); the fence seeds 'sheet'.
    if (this.snapshot.sheetMotionSettled) {
      this.offerQ2ShadowJoin('sheet');
    }
  }

  private ensureQ2TxnSubscription(): void {
    if (this.q2TxnSubscriptionStarted) {
      return;
    }
    this.q2TxnSubscriptionStarted = true;
    subscribeTransitionTxn(() => {
      this.maybeStageQ2DeferredRevise();
      this.completeRedrawAtEpisodeReveal();
    });
  }

  // S2 INVERSION (design §4): the episode's 'revealed' edge DRIVES the redraw commit —
  // canAdmitResultsBody is txn-derived underneath its unchanged selector.
  private completeRedrawAtEpisodeReveal(): void {
    const liveTxn = getLiveTransitionTxn();
    if (
      this.q2ShadowTxnId == null ||
      liveTxn?.txnId !== this.q2ShadowTxnId ||
      liveTxn.phase !== 'revealed'
    ) {
      return;
    }
    this.commitRevealedRedrawRespectingFence();
  }

  // THE MID-SLIDE LAW (preserved from the 3-gate era): the commit's publish is a
  // fan-out trigger and must never land while the sheet is physically moving — even
  // for an episode whose plan didn't declare 'sheet' (a user drag mid-toggle). The
  // deferral is LATCHED (the episode may settle — and the shadow null — before the
  // fence restores); markRedrawSheetReady retries.
  private q2RedrawCommitPendingFenceRestore = false;

  private commitRevealedRedrawRespectingFence(): void {
    const redraw = this.snapshot.redrawTransaction;
    if (redraw == null || redraw.committedAtMs != null) {
      this.q2RedrawCommitPendingFenceRestore = false;
      return;
    }
    if (!this.snapshot.sheetMotionSettled) {
      this.q2RedrawCommitPendingFenceRestore = true;
      return;
    }
    this.q2RedrawCommitPendingFenceRestore = false;
    this.commitActiveRedrawTransactionWithoutRouteFanout({
      ...redraw,
      committedAtMs: nowMs(),
    });
  }

  private maybeStageQ2DeferredRevise(): void {
    const id = this.q2DeferredReviseArmId;
    if (id == null) {
      return;
    }
    const active = this.snapshot.redrawTransaction;
    const completed = this.snapshot.completedRedrawTransaction;
    const redraw = active?.id === id ? active : completed?.id === id ? completed : null;
    if (redraw == null) {
      // Superseded — the newer interaction owns its own episode.
      this.q2DeferredReviseArmId = null;
      return;
    }
    const live = getLiveTransitionTxn();
    if (live != null && live.phase !== 'settled' && live.phase !== 'superseded') {
      // The route txn still owns the window. 'revealed' is NOT terminal here — staging
      // at the push's reveal (+300ms) opened the episode ~1-2s before its world could
      // exist and the watchdog degraded it before evidence arrived (probed live).
      return;
    }
    this.q2DeferredReviseArmId = null;
    const txn = stageTransitionTxn(
      { kind: 'revise', targetSceneKey: 'search', sourceSceneKey: 'search', entryId: null },
      {
        content: { kind: 'skeleton' },
        joinInputs: ['paint', 'mapFrame', 'sheet'],
        movesSheet: true,
        // STUCK-threshold, not choreography: world enters are network-paced (openNow
        // measured >2.5s on the dev rig) — the degrade must never bark on a slow
        // network, only on a broken producer.
        joinLivenessMs: 10000,
      }
    );
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    this.q2ShadowTxnId = txn.txnId;
    // Seed from RESIDENCY STATE (design §2): only a CACHED re-present seeds — its rows
    // are resident (a fresh world always publishes the shell reset at submit, so rows
    // residency discriminates cached from fresh) and mapFrame seeds only under that
    // discriminator (a stale clean frame — e.g. a dismissal's empty-frame ack — can
    // never bless a fresh episode; fresh worlds get their guaranteed ack edge).
    if (this.q2RowsResident) {
      this.offerQ2ShadowJoin('paint');
      if (this.q2MapFrameClean) {
        this.offerQ2ShadowJoin('mapFrame');
      }
    }
    if (this.snapshot.sheetMotionSettled) {
      this.offerQ2ShadowJoin('sheet');
    }
  }

  // Q-2 shadow offer: readiness marks OFFER their input iff the live txn is OUR shadow
  // (never a route txn — a route push's 'paint' means the LEG painted, not cards-data).
  private offerQ2ShadowJoin(input: TransitionJoinInput): void {
    const liveTxn = getLiveTransitionTxn();
    if (this.q2ShadowTxnId == null || liveTxn?.txnId !== this.q2ShadowTxnId) {
      return;
    }
    offerTransitionJoinInput(input);
    if (liveTxn.phase === 'revealed') {
      settleTransitionTxn(liveTxn);
      this.q2ShadowTxnId = null;
    }
  }

  // S3 (reveal-pipeline unification §4/§6): the tier-1/tier-2 cover watchdogs are
  // DELETED. Never-stuck is now guaranteed END-TO-END by the engine: the episode txn's
  // join-liveness watchdog force-reveals a stuck join (LOUD [TXN-CONTRACT]), and the
  // reveal — forced or genuine — commits the redraw (completeRedrawAtEpisodeReveal).
  // One net, one owner, RED-provable by suppressing any producer.

  // ── The mark family (redraw-object shrink): PURE EPISODE PRODUCERS + THE FENCE ──
  // The readiness triple is gone; marks either OFFER a join input to the live episode
  // (latest-wins via the active-redraw id match — a superseded interaction's late mark
  // is a warned no-op) or write the surface-level sheet-motion fence.

  private offerForActiveRedraw(
    transactionId: string | null | undefined,
    input: TransitionJoinInput,
    readyPart: string
  ): void {
    const redrawTransaction = this.snapshot.redrawTransaction;
    if (
      redrawTransaction == null ||
      !this.matchesTransaction(redrawTransaction.id, transactionId)
    ) {
      logger.warn('[PRESENTATION-WATCHDOG] surface redraw readiness ignored', {
        readyPart,
        requestedTransactionId: transactionId ?? null,
        activeRedrawTransactionId: redrawTransaction?.id ?? null,
      });
      return;
    }
    this.offerQ2ShadowJoin(input);
  }

  public markRedrawCardsReady = (transactionId: string | null | undefined): void => {
    this.offerForActiveRedraw(transactionId, 'paint', 'cards');
  };

  public markRedrawNativeMarkerFrameReady = (transactionId: string | null | undefined): void => {
    this.offerForActiveRedraw(transactionId, 'mapFrame', 'native_marker_frame');
  };

  public markRedrawSheetReady = (transactionId: string | null | undefined): void => {
    void transactionId;
    if (!this.snapshot.sheetMotionSettled) {
      this.publish({ ...this.snapshot, sheetMotionSettled: true });
    }
    this.offerQ2ShadowJoin('sheet');
    // Fence restore retries the mid-slide-deferred commit (latched — the episode may
    // have settled while fenced).
    if (this.q2RedrawCommitPendingFenceRestore) {
      this.commitRevealedRedrawRespectingFence();
    }
  };

  // THE FENCE: "the sheet is not physically moving". The sheet HOST flips this at snap
  // START and restores it at snap SETTLE (app-route-sheet-host-authority-controller) —
  // motion-keyed on both sides, so a deferred/no-op snap can never strand the bit.
  // World commits + list-data fanout are held behind it (never land mid-slide).
  public markRedrawSheetMotionPending = (transactionId: string | null | undefined): void => {
    void transactionId;
    if (this.snapshot.sheetMotionSettled) {
      this.publish({ ...this.snapshot, sheetMotionSettled: false });
    }
  };

  // THE FENCE, ISSUE-side producer: called the JS-synchronous instant a reveal snap
  // command is issued, BEFORE the redraw arms (the snap-START producer above is a
  // UI-thread→runOnJS roundtrip landing ~10-30ms later; heavy applies froze the slide's
  // first frames through that gap — eye-verified 2026-07-13). If the redraw is already
  // active, close the fence directly; otherwise record the expectation so the arm
  // publishes born sheetMotionSettled:false.
  public markRedrawSheetMotionExpected = (transactionId: string | null | undefined): void => {
    if (transactionId == null) {
      return;
    }
    if (this.snapshot.redrawTransaction?.id === transactionId) {
      if (this.snapshot.sheetMotionSettled) {
        this.publish({ ...this.snapshot, sheetMotionSettled: false });
      }
      return;
    }
    this.redrawSheetMotionExpectedTransactionId = transactionId;
  };

  // UNIFIED-FADE TOGGLE: the deterministic resolver driven by the native
  // `presentation_toggle_settled` event (fade-IN ramp completion, keyed to the LATEST
  // request — latest-wins by construction). `degraded` (roster failed) still offers —
  // never hang on a roster failure; we only log it.
  public markRedrawSettled = (
    transactionId: string | null | undefined,
    degraded: boolean = false
  ): void => {
    if (degraded) {
      logger.warn(
        '[PRESENTATION-WATCHDOG] toggle settled DEGRADED (roster failed) — cover lifts anyway',
        {
          requestedTransactionId: transactionId ?? null,
          activeRedrawTransactionId: this.snapshot.redrawTransaction?.id ?? null,
        }
      );
    }
    this.offerForActiveRedraw(transactionId, 'mapFrame', 'native_marker_frame');
  };

  public syncResultsPageBodyBundle = (bodyBundle: SearchSurfaceResultsBodyBundle | null): void => {
    this.latestResultsBodyBundle = bodyBundle;
    if (this.snapshot.activeBundle.kind !== 'results') {
      return;
    }
    if (this.snapshot.activeBundle.bodyBundle === bodyBundle) {
      return;
    }
    this.publish({
      ...this.snapshot,
      activeBundle: {
        ...this.snapshot.activeBundle,
        bodyBundle,
      },
    });
  };

  // S-C.2 / favorites-regression root fix: a session can exit WITHOUT a surface dismissal —
  // the pop dismiss (and the old single-switch rich seam) never arm a dismiss transaction, so
  // the RESULTS bundle stayed active forever: bottomBandOwner 'results_header' + the
  // animatedSearchTransition clip lingered, resurfacing as a zombie Results sheet on later tab
  // switches. This verb returns the surface to its poll (home) bundle — a no-op whenever a
  // real dismissal owns the exit (dismissTransaction armed) or the surface is already home.
  public finalizeSessionExitWithoutDismissMotion = (): void => {
    if (this.snapshot.dismissTransaction != null) {
      return;
    }
    if (
      this.snapshot.activeBundle.kind !== 'results' &&
      this.snapshot.heldBundle == null &&
      this.snapshot.redrawTransaction == null
    ) {
      return;
    }
    const pollBundle = this.snapshot.pollBundle;
    this.publish({
      ...this.snapshot,
      activeBundle: pollBundle,
      heldBundle: null,
      redrawTransaction: null,
      completedRedrawTransaction: null,
    });
  };

  public armDismissMotion = ({
    transactionId,
    outgoingSheetSceneKey = null,
  }: SearchSurfaceDismissMotionArmInput = {}): string => {
    const id = transactionId ?? `search-surface-dismiss:${++this.transactionSeq}`;
    const currentResultsBundle =
      this.snapshot.activeBundle.kind === 'results'
        ? this.snapshot.activeBundle
        : this.snapshot.heldBundle;
    const frozenResultsBundle: ResultsPageBundle = {
      ...(currentResultsBundle ??
        createResultsBundle({
          transactionId: id,
          coverState: 'hidden',
          bodyBundle: this.latestResultsBodyBundle,
        })),
      transactionId: currentResultsBundle?.transactionId ?? id,
      bodyBundle: currentResultsBundle?.bodyBundle ?? this.latestResultsBodyBundle,
      coverState: 'hidden',
      cardsReady: true,
      markersReady: true,
      frozen: true,
    };
    const pollBundle = createPollBundle(POLL_PAGE_BUNDLE_KEY, true);
    this.pendingDismissMotionArm = { id };
    this.publish({
      ...this.snapshot,
      activeBundle: frozenResultsBundle,
      pollBundle,
      heldBundle: frozenResultsBundle,
      redrawTransaction: null,
      completedRedrawTransaction: null,
      dismissTransaction: {
        id,
        frozenResultsBundle,
        outgoingSheetSceneKey,
        // Prewarm prepares the poll bundle; release readiness must come from scene-stack evidence.
        pollHeaderReady: false,
        pollBodyReady: false,
        pollHostReady: false,
        bottomBoundaryReached: false,
        bottomNavReturnReady: false,
        startedAtMs: nowMs(),
        committedAtMs: null,
      },
    });
    this.logPollPageReadyContract({
      activeTransactionId: id,
      source: 'armDismissMotion:prewarmedPollBundle',
      transactionId: id,
    });
    this.logRetainedDismissPrewarmContract({
      activeTransactionId: id,
      transactionId: id,
    });
    this.logMotionPlaneArmContract('dismiss', id);
    this.motionPlaneObservationTarget?.observeDismiss({
      transactionId: id,
    });
    return id;
  };

  public commitDismissBoundary = (transactionId?: string | null): string => {
    const activeDismissTransaction = this.snapshot.dismissTransaction;
    const id =
      transactionId ??
      activeDismissTransaction?.id ??
      this.pendingDismissMotionArm?.id ??
      `search-surface-dismiss:${++this.transactionSeq}`;
    this.pendingDismissMotionArm = null;
    if (
      activeDismissTransaction != null &&
      this.matchesTransaction(activeDismissTransaction.id, id)
    ) {
      // §Q redo T1d: same boundary fact, inline commit branch — offer it here too
      // (this branch bypasses markBottomBoundaryReached).
      offerTransitionJoinInput('boundary');
      this.publishDismissTransaction({
        ...activeDismissTransaction,
        bottomBoundaryReached: true,
      });
      return id;
    }
    this.armDismissMotion({ transactionId: id });
    this.markBottomBoundaryReached(id);
    return id;
  };

  public markPollPagePartReady = (
    part: 'header' | 'body' | 'host',
    transactionId?: string | null,
    source = 'unknown'
  ): void => {
    const dismissTransaction = this.snapshot.dismissTransaction;
    const hasValidReadinessSource = isPollPageReleaseReadinessSource(part, source);
    const accepted =
      dismissTransaction != null &&
      this.matchesTransaction(dismissTransaction.id, transactionId) &&
      hasValidReadinessSource;
    if (
      dismissTransaction == null ||
      !this.matchesTransaction(dismissTransaction.id, transactionId) ||
      !hasValidReadinessSource
    ) {
      this.logPollPagePartReadyContract({
        accepted,
        activeTransactionId: dismissTransaction?.id ?? null,
        part,
        source,
        transactionId: transactionId ?? null,
      });
      return;
    }
    if (
      (part === 'header' && dismissTransaction.pollHeaderReady) ||
      (part === 'body' && dismissTransaction.pollBodyReady) ||
      (part === 'host' && dismissTransaction.pollHostReady)
    ) {
      return;
    }
    const patch =
      part === 'header'
        ? { pollHeaderReady: true }
        : part === 'body'
          ? { pollBodyReady: true }
          : { pollHostReady: true };
    this.logPollPagePartReadyContract({
      accepted,
      activeTransactionId: dismissTransaction.id,
      part,
      source,
      transactionId: transactionId ?? null,
    });
    this.publishDismissTransaction({
      ...dismissTransaction,
      ...patch,
    });
  };

  // R0 loud-contracts (§D6): a dismiss-lifecycle marker arriving with a non-null id that
  // MISMATCHES a LIVE dismiss transaction means two lifecycles disagree about which dismiss
  // is running — the suspicious case the audit found silently swallowed. (No live
  // transaction, or an intentionally-null id, remains a legitimate no-op.)
  private reportDismissMarkerMismatch(
    marker: string,
    liveId: string,
    transactionId?: string | null
  ): void {
    if (transactionId != null && liveId !== transactionId) {
      reportSearchFlowContractViolation('dismiss_marker_transaction_mismatch', {
        marker,
        liveId,
        transactionId,
      });
    }
  }

  public markBottomBoundaryReached = (transactionId?: string | null): void => {
    const dismissTransaction = this.snapshot.dismissTransaction;
    if (
      dismissTransaction == null ||
      !this.matchesTransaction(dismissTransaction.id, transactionId)
    ) {
      if (dismissTransaction != null) {
        this.reportDismissMarkerMismatch(
          'bottomBoundaryReached',
          dismissTransaction.id,
          transactionId
        );
      }
      return;
    }
    // §Q redo T1d: the boundary is a TRANSACTION join input — the one edge every
    // content owner (header host, leg lanes, this bundle) gates on for freeze-mode
    // dismissals. Offered here (the single JS commit point for the boundary fact).
    offerTransitionJoinInput('boundary');
    this.publishDismissTransaction({
      ...dismissTransaction,
      bottomBoundaryReached: true,
    });
  };

  public markBottomNavReturnReady = (transactionId?: string | null): void => {
    const dismissTransaction = this.snapshot.dismissTransaction;
    if (
      dismissTransaction == null ||
      !this.matchesTransaction(dismissTransaction.id, transactionId) ||
      dismissTransaction.bottomNavReturnReady
    ) {
      if (dismissTransaction != null && !dismissTransaction.bottomNavReturnReady) {
        this.reportDismissMarkerMismatch(
          'bottomNavReturnReady',
          dismissTransaction.id,
          transactionId
        );
      }
      return;
    }
    this.publishDismissTransaction({
      ...dismissTransaction,
      bottomNavReturnReady: true,
    });
  };

  public completeDismissHandoff = (transactionId?: string | null): void => {
    const dismissTransaction = this.snapshot.dismissTransaction;
    if (
      dismissTransaction == null ||
      !this.matchesTransaction(dismissTransaction.id, transactionId)
    ) {
      if (dismissTransaction != null) {
        this.reportDismissMarkerMismatch(
          'completeDismissHandoff',
          dismissTransaction.id,
          transactionId
        );
      }
      return;
    }
    const canCompleteDismissHandoff =
      dismissTransaction.pollHeaderReady &&
      dismissTransaction.pollBodyReady &&
      dismissTransaction.pollHostReady &&
      dismissTransaction.bottomBoundaryReached &&
      dismissTransaction.committedAtMs != null;
    if (!canCompleteDismissHandoff) {
      return;
    }
    const activeBundle = createPollBundle(POLL_PAGE_BUNDLE_KEY, true);
    this.publish({
      ...this.snapshot,
      activeBundle,
      pollBundle: activeBundle,
      heldBundle: null,
      redrawTransaction: null,
      dismissTransaction: null,
    });
  };

  private commitActiveRedrawTransactionWithoutRouteFanout(
    redrawTransaction: SearchSurfaceRedrawTransaction
  ): void {
    const activeBundle = this.snapshot.activeBundle;
    this.publish({
      ...this.snapshot,
      activeBundle:
        activeBundle.kind === 'results'
          ? {
              ...activeBundle,
              transactionId: null,
              coverState: 'hidden',
              cardsReady: true,
              markersReady: true,
              frozen: false,
            }
          : activeBundle,
      redrawTransaction: null,
      completedRedrawTransaction: redrawTransaction,
    });
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'search_surface_redraw_commit_contract',
      transactionId: redrawTransaction.id,
      committedAtMs: redrawTransaction.committedAtMs,
      activeBundleKind: activeBundle.kind,
      activeResultsCoverState: activeBundle.kind === 'results' ? activeBundle.coverState : null,
      activeResultsNextCoverState: 'hidden',
      redrawTransactionCleared: true,
      routeSheetStructuralListenersNotified: true,
    });
  }

  private publishDismissTransaction(
    nextDismissTransaction: SearchSurfaceDismissTransaction,
    pollBundle = this.snapshot.pollBundle
  ): void {
    const isReadyToReleasePersistentPolls =
      nextDismissTransaction.pollHeaderReady &&
      nextDismissTransaction.pollBodyReady &&
      nextDismissTransaction.pollHostReady &&
      isDismissChoreographyComplete(nextDismissTransaction);
    const publishedDismissTransaction =
      isReadyToReleasePersistentPolls && nextDismissTransaction.committedAtMs == null
        ? {
            ...nextDismissTransaction,
            committedAtMs: nowMs(),
          }
        : nextDismissTransaction;
    this.publish({
      ...this.snapshot,
      pollBundle,
      dismissTransaction: publishedDismissTransaction,
    });
  }

  private matchesTransaction(currentId: string, transactionId: string | null | undefined): boolean {
    return transactionId == null || currentId === transactionId;
  }

  private logPollPagePartReadyContract({
    accepted,
    activeTransactionId,
    part,
    source,
    transactionId,
  }: {
    accepted: boolean;
    activeTransactionId: string | null;
    part: 'header' | 'body' | 'host';
    source: string;
    transactionId: string | null;
  }): void {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    const dismissTransaction = this.snapshot.dismissTransaction;
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'search_surface_poll_page_part_ready_contract',
      accepted,
      activeTransactionId,
      part,
      pollBodyReady: dismissTransaction?.pollBodyReady ?? false,
      pollHeaderReady: dismissTransaction?.pollHeaderReady ?? false,
      pollHostReady: dismissTransaction?.pollHostReady ?? false,
      source,
      transactionId,
    });
  }

  private logPollPageReadyContract({
    activeTransactionId,
    source,
    transactionId,
  }: {
    activeTransactionId: string;
    source: string;
    transactionId: string;
  }): void {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    const dismissTransaction = this.snapshot.dismissTransaction;
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'search_surface_poll_page_ready_contract',
      accepted: dismissTransaction != null && dismissTransaction.id === activeTransactionId,
      activeTransactionId,
      pollBodyReady: dismissTransaction?.pollBodyReady ?? false,
      pollHeaderReady: dismissTransaction?.pollHeaderReady ?? false,
      pollHostReady: dismissTransaction?.pollHostReady ?? false,
      source,
      transactionId,
    });
  }

  private logRetainedDismissPrewarmContract({
    activeTransactionId,
    transactionId,
  }: {
    activeTransactionId: string;
    transactionId: string;
  }): void {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    const dismissTransaction = this.snapshot.dismissTransaction;
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'retained_dismiss_prewarm_contract',
      accepted: dismissTransaction != null && dismissTransaction.id === activeTransactionId,
      activeTransactionId,
      bottomBandOwner: 'results_header',
      canAdmitResultsBody: true,
      canReleasePersistentPolls: false,
      outgoingResultsBodyAdmitted: true,
      outgoingResultsChromeHeld: true,
      outgoingResultsHeld: true,
      pollBodyReady: dismissTransaction?.pollBodyReady ?? false,
      pollHeaderReady: dismissTransaction?.pollHeaderReady ?? false,
      pollHostReady: dismissTransaction?.pollHostReady ?? false,
      pollPageReadyBeforeMotion: true,
      searchSheetContentLaneKind: 'results_closing',
      searchSurfacePhase: 'results_dismissing',
      sheetClipMode: 'animatedSearchTransition',
      shouldHoldResultsHeader: true,
      shouldHoldSearchDisplayForPollRestore: false,
      transactionId,
    });
  }

  private logMotionPlaneArmContract(phase: 'dismiss' | 'open', transactionId: string): void {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'search_surface_motion_plane_arm_contract',
      authority: 'SearchSurfaceRuntime',
      listenerFanoutDeferredUntilMotionStarted: true,
      motionArmBeforeSnapshotPublish: true,
      phase,
      transactionId,
    });
  }

  private publish(
    nextSnapshot: Omit<SearchSurfaceRuntimeSnapshot, 'version' | 'navSilhouette'>,
    beforeNotify?: () => void
  ): boolean {
    const version = this.snapshot.version + 1;
    const snapshot: SearchSurfaceRuntimeSnapshot = {
      ...nextSnapshot,
      version,
      navSilhouette: deriveNavSilhouetteProjection(
        nextSnapshot.activeBundle,
        nextSnapshot.heldBundle,
        nextSnapshot.dismissTransaction
      ),
    };
    if (areSearchSurfaceRuntimeSnapshotsEqual(this.snapshot, snapshot)) {
      return false;
    }
    this.snapshot = snapshot;
    beforeNotify?.();
    this.listeners.forEach((listener) => listener());
    return true;
  }
}

const SHARED_SEARCH_SURFACE_RUNTIME = new SearchSurfaceRuntime();

export const getSearchSurfaceRuntime = (): SearchSurfaceRuntime => SHARED_SEARCH_SURFACE_RUNTIME;

export const useSearchSurfaceRuntimeSelector = <T>(
  selector: (snapshot: SearchSurfaceRuntimeSnapshot) => T,
  isEqual: EqualityFn<T> = Object.is
): T => {
  const cacheRef = React.useRef<T>(selector(SHARED_SEARCH_SURFACE_RUNTIME.getSnapshot()));
  return useSyncExternalStore(
    SHARED_SEARCH_SURFACE_RUNTIME.subscribe,
    () => {
      const selected = selector(SHARED_SEARCH_SURFACE_RUNTIME.getSnapshot());
      if (!isEqual(cacheRef.current, selected)) {
        cacheRef.current = selected;
      }
      return cacheRef.current;
    },
    () => selector(SHARED_SEARCH_SURFACE_RUNTIME.getSnapshot())
  );
};
