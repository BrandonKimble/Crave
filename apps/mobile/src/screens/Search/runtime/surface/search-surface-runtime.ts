import React, { useSyncExternalStore } from 'react';

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
  readiness: {
    cardsReady: boolean;
    sheetReady: boolean;
    nativeMarkerFrameReady: boolean;
    nativeMarkerFrameBatch: {
      frameGenerationId: string | null;
      executionBatchId: string | null;
    } | null;
  };
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
  dismissTransaction: SearchSurfaceDismissTransaction | null;
  navSilhouette: NavSilhouetteRuntimeProjection;
};

export const selectSearchSurfaceVisualPolicy = (
  snapshot: SearchSurfaceRuntimeSnapshot
): SearchSurfaceVisualPolicySnapshot => {
  const redrawTransaction = snapshot.redrawTransaction;
  if (redrawTransaction != null) {
    const readiness = redrawTransaction.readiness;
    const canCommitReveal =
      readiness.cardsReady &&
      readiness.nativeMarkerFrameReady &&
      readiness.sheetReady;
    return {
      transactionId: redrawTransaction.id,
      phase: 'results_redrawing',
      outgoingSheetSceneKey: null,
      pollHeaderReady: false,
      pollBodyReady: false,
      pollHostReady: false,
      dismissBottomBoundaryReached: false,
      bottomNavReturnReady: false,
      canAdmitResultsBody: canCommitReveal,
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
      canDisplayPersistentPollSubstrate &&
      dismissTransaction.bottomBoundaryReached &&
      dismissTransaction.bottomNavReturnReady;
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
  const activeBundle = createPollBundle('poll:initial');
  return {
    version: 0,
    activeBundle,
    pollBundle: activeBundle,
    heldBundle: null,
    redrawTransaction: null,
    completedRedrawTransaction: null,
    dismissTransaction: null,
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
    left.readiness.cardsReady === right.readiness.cardsReady &&
    left.readiness.sheetReady === right.readiness.sheetReady &&
    left.readiness.nativeMarkerFrameReady === right.readiness.nativeMarkerFrameReady &&
    left.readiness.nativeMarkerFrameBatch?.frameGenerationId ===
      right.readiness.nativeMarkerFrameBatch?.frameGenerationId &&
    left.readiness.nativeMarkerFrameBatch?.executionBatchId ===
      right.readiness.nativeMarkerFrameBatch?.executionBatchId &&
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
  left.version === right.version &&
  arePageBundlesEqual(left.activeBundle, right.activeBundle) &&
  arePollBundlesEqual(left.pollBundle, right.pollBundle) &&
  areResultsBundlesEqual(left.heldBundle, right.heldBundle) &&
  areRedrawTransactionsEqual(left.redrawTransaction, right.redrawTransaction) &&
  areRedrawTransactionsEqual(
    left.completedRedrawTransaction,
    right.completedRedrawTransaction
  ) &&
  areDismissTransactionsEqual(left.dismissTransaction, right.dismissTransaction) &&
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

  private pendingRedrawMotionArm: {
    id: string;
    input: Required<Omit<BeginRedrawTransactionInput, 'transactionId'>> &
      Pick<BeginRedrawTransactionInput, 'transactionId'>;
  } | null = null;

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
        readiness: {
          cardsReady: false,
          sheetReady: false,
          nativeMarkerFrameReady: false,
          nativeMarkerFrameBatch: null,
        },
        startedAtMs: nowMs(),
        committedAtMs: null,
      },
      completedRedrawTransaction: null,
      dismissTransaction: null,
    });
  }

  public markRedrawCardsReady = (transactionId: string | null | undefined): void => {
    this.patchActiveRedrawTransaction(transactionId, { cardsReady: true });
  };

  public markRedrawNativeMarkerFrameReady = (
    transactionId: string | null | undefined,
    nativeMarkerFrameBatch: SearchSurfaceRedrawTransaction['readiness']['nativeMarkerFrameBatch'] =
      null
  ): void => {
    this.patchActiveRedrawTransaction(transactionId, {
      nativeMarkerFrameReady: true,
      nativeMarkerFrameBatch,
    });
  };

  public markRedrawSheetReady = (transactionId: string | null | undefined): void => {
    this.patchActiveRedrawTransaction(transactionId, { sheetReady: true });
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
    const pollBundle = createPollBundle(`poll:prewarm:${id}`, true);
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
        pollHeaderReady: pollBundle.chromeReady,
        pollBodyReady: pollBundle.bodyReady,
        pollHostReady: pollBundle.hostReady,
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
    if (activeDismissTransaction != null && this.matchesTransaction(activeDismissTransaction.id, id)) {
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

  public markBottomBoundaryReached = (transactionId?: string | null): void => {
    const dismissTransaction = this.snapshot.dismissTransaction;
    if (
      dismissTransaction == null ||
      !this.matchesTransaction(dismissTransaction.id, transactionId)
    ) {
      return;
    }
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
      return;
    }
    this.publishDismissTransaction({
      ...dismissTransaction,
      bottomNavReturnReady: true,
    });
  };

  public resetToPollPage = (): void => {
    const activeBundle = createPollBundle(`poll:reset:${++this.transactionSeq}`);
    this.publish({
      ...this.snapshot,
      activeBundle,
      pollBundle: activeBundle,
      heldBundle: null,
      redrawTransaction: null,
      completedRedrawTransaction: null,
      dismissTransaction: null,
    });
  };

  private patchActiveRedrawTransaction(
    transactionId: string | null | undefined,
    patch: Partial<SearchSurfaceRedrawTransaction['readiness']>
  ): void {
    const readyPart =
      patch.cardsReady === true
        ? 'cards'
        : patch.nativeMarkerFrameReady === true
        ? 'native_marker_frame'
        : patch.sheetReady === true
        ? 'sheet'
        : null;
    const redrawTransaction = this.snapshot.redrawTransaction;
    if (
      redrawTransaction == null ||
      !this.matchesTransaction(redrawTransaction.id, transactionId)
    ) {
      logger.warn('[PRESENTATION-WATCHDOG] surface redraw readiness ignored', {
        readyPart,
        requestedTransactionId: transactionId ?? null,
        activeRedrawTransactionId: redrawTransaction?.id ?? null,
        activeBundleKind: this.snapshot.activeBundle.kind,
        activeResultsTransactionId:
          this.snapshot.activeBundle.kind === 'results'
            ? this.snapshot.activeBundle.transactionId
            : null,
        activeResultsCoverState:
          this.snapshot.activeBundle.kind === 'results'
            ? this.snapshot.activeBundle.coverState
            : null,
        heldResultsTransactionId: this.snapshot.heldBundle?.transactionId ?? null,
        dismissTransactionId: this.snapshot.dismissTransaction?.id ?? null,
      });
      return;
    }
    const nextRedrawTransaction = {
      ...redrawTransaction,
      readiness: {
        ...redrawTransaction.readiness,
        ...patch,
      },
    };
    const structuralRevealJoinProof =
      nextRedrawTransaction.readiness.cardsReady &&
      nextRedrawTransaction.readiness.nativeMarkerFrameReady &&
      nextRedrawTransaction.readiness.sheetReady
        ? {
            coverState: 'hidden' as const,
            cardsReady: true,
            nativeMarkerFrameReady: true,
          }
        : null;
    void structuralRevealJoinProof;
    logger.debug('[PRESENTATION-DIAG] surface redraw readiness patched', {
      transactionId: redrawTransaction.id,
      readyPart,
      cardsReady: nextRedrawTransaction.readiness.cardsReady,
      nativeMarkerFrameReady: nextRedrawTransaction.readiness.nativeMarkerFrameReady,
      nativeMarkerFrameBatch: nextRedrawTransaction.readiness.nativeMarkerFrameBatch,
      sheetReady: nextRedrawTransaction.readiness.sheetReady,
      willCommitReveal: structuralRevealJoinProof != null,
      activeBundleKind: this.snapshot.activeBundle.kind,
      activeResultsCoverState:
        this.snapshot.activeBundle.kind === 'results'
          ? this.snapshot.activeBundle.coverState
          : null,
    });
    if (
      nextRedrawTransaction.readiness.cardsReady &&
      nextRedrawTransaction.readiness.nativeMarkerFrameReady &&
      nextRedrawTransaction.readiness.sheetReady
    ) {
      const revealContractSnapshot = {
        coverState: 'hidden' as const,
        cardsReady: true,
        nativeMarkerFrameReady: true,
      };
      void revealContractSnapshot;
      this.commitActiveRedrawTransactionWithoutRouteFanout({
        ...nextRedrawTransaction,
        readiness: {
          ...nextRedrawTransaction.readiness,
          cardsReady: true,
          nativeMarkerFrameReady: true,
          sheetReady: true,
        },
        committedAtMs: nextRedrawTransaction.committedAtMs ?? nowMs(),
      });
      return;
    }
    this.publish({
      ...this.snapshot,
      redrawTransaction: nextRedrawTransaction,
    });
  }

  private commitActiveRedrawTransactionWithoutRouteFanout(
    redrawTransaction: SearchSurfaceRedrawTransaction
  ): void {
    const activeBundle = this.snapshot.activeBundle;
    logger.debug('[PRESENTATION-DIAG] surface redraw committed', {
      transactionId: redrawTransaction.id,
      cardsReady: redrawTransaction.readiness.cardsReady,
      nativeMarkerFrameReady: redrawTransaction.readiness.nativeMarkerFrameReady,
      nativeMarkerFrameBatch: redrawTransaction.readiness.nativeMarkerFrameBatch,
      sheetReady: redrawTransaction.readiness.sheetReady,
      activeBundleKind: activeBundle.kind,
      activeResultsTransactionId:
        activeBundle.kind === 'results' ? activeBundle.transactionId : null,
      activeResultsCoverState:
        activeBundle.kind === 'results' ? activeBundle.coverState : null,
    });
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
      cardsReady: redrawTransaction.readiness.cardsReady,
      nativeMarkerFrameReady: redrawTransaction.readiness.nativeMarkerFrameReady,
      nativeMarkerFrameBatch: redrawTransaction.readiness.nativeMarkerFrameBatch,
      sheetReady: redrawTransaction.readiness.sheetReady,
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
    if (
      nextDismissTransaction.pollHeaderReady &&
      nextDismissTransaction.pollBodyReady &&
      nextDismissTransaction.pollHostReady &&
      nextDismissTransaction.bottomBoundaryReached
    ) {
      const activeBundle = createPollBundle(`poll:${nextDismissTransaction.id}`, true);
      this.publish({
        ...this.snapshot,
        activeBundle,
        pollBundle: activeBundle,
        heldBundle: null,
        redrawTransaction: null,
        dismissTransaction: null,
      });
      return;
    }
    this.publish({
      ...this.snapshot,
      pollBundle,
      dismissTransaction: nextDismissTransaction,
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
