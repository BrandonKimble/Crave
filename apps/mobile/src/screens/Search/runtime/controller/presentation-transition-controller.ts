export type PresentationMutationKind =
  | 'initial_search'
  | 'close_search'
  | 'tab_switch'
  | 'filter_open_now'
  | 'filter_votes'
  | 'filter_price'
  | 'filter_rank'
  | 'search_this_area'
  | 'shortcut_rerun'
  | 'legacy_unspecified';

export type PresentationPhase =
  | 'idle'
  | 'executing'
  | 'awaiting_readiness'
  | 'settled'
  | 'cancelled';

export type PresentationLoadingMode = 'none' | 'initial_cover' | 'interaction_frost';
export type PresentationRevealMode = 'fresh_reveal' | 'in_place_rerun' | 'close';
export type PresentationRevealPhase =
  | 'idle'
  | 'covered'
  | 'awaiting_map_reveal_start'
  | 'revealing'
  | 'live'
  | 'closing';
export type PresentationResultsSurfaceMode = 'none' | 'initial_loading' | 'interaction_loading';
export type PresentationResultsCardVisibility = 'hidden' | 'frozen' | 'live';

export type PresentationRevealBatchRef = {
  requestKey: string;
  batchId: string;
  generationId: string;
};

export type PresentationRevealLaneState = {
  kind: 'reveal';
  requestKey: string;
  batch: PresentationRevealBatchRef | null;
  status: 'pending_mount' | 'mounted_hidden' | 'revealing' | 'live';
  startToken: number | null;
};

export type PresentationDismissLaneState = {
  kind: 'dismiss';
  requestKey: string;
  status: 'requested' | 'dismissing';
  startToken: number | null;
};

export type PresentationLaneState =
  | PresentationRevealLaneState
  | PresentationDismissLaneState
  | null;

export type PresentationMapPhase =
  | 'idle'
  | 'covered'
  | 'reveal_requested'
  | 'revealing'
  | 'live'
  | 'dismiss_preroll'
  | 'dismissing';

export type PresentationTarget = 'default' | 'results';

type PresentationTransitionPublishPatch = {
  presentationTransitionKind: PresentationMutationKind | null;
  presentationTransitionLoadingMode: PresentationLoadingMode;
  presentationResultsCoverVisible: boolean;
  presentationLane: PresentationLaneState;
  mapPresentationPhase: PresentationMapPhase;
  presentationRevealTransactionId: string | null;
  presentationRevealMode: PresentationRevealMode | null;
  presentationRevealPhase: PresentationRevealPhase;
  presentationResultsSurfaceMode: PresentationResultsSurfaceMode;
  presentationResultsCardVisibility: PresentationResultsCardVisibility;
  presentationShouldShowResultsCards: boolean;
};

export type BeginPresentationIntentOptions = {
  kind: PresentationMutationKind;
  loadingMode: Exclude<PresentationLoadingMode, 'none'>;
  intentId?: string;
  requiresCoverage?: boolean;
  revealMode?: PresentationRevealMode;
};

export type RequestPresentationTargetOptions = {
  target: PresentationTarget;
  kind?: PresentationMutationKind;
  loadingMode?: Exclude<PresentationLoadingMode, 'none'>;
  intentId?: string;
  requiresCoverage?: boolean;
  revealMode?: PresentationRevealMode;
};

type PresentationTransitionControllerLog = (label: string, data?: Record<string, unknown>) => void;

type PresentationTransitionControllerOptions = {
  publish: (patch: PresentationTransitionPublishPatch) => void;
  log?: PresentationTransitionControllerLog;
  onIntentComplete?: (intentId: string) => void;
  now?: () => number;
};

type InternalState = {
  intentId: string | null;
  phase: PresentationPhase;
  kind: PresentationMutationKind | null;
  loadingMode: PresentationLoadingMode;
  resultsCoverVisible: boolean;
  startedAtMs: number | null;
  dataReady: boolean;
  listFirstPaintReady: boolean;
  presentationLane: PresentationLaneState;
  coverageReady: boolean;
  requiresCoverage: boolean;
  revealTransactionId: string | null;
  revealMode: PresentationRevealMode | null;
  revealPhase: PresentationRevealPhase;
  resultsSurfaceMode: PresentationResultsSurfaceMode;
  resultsCardVisibility: PresentationResultsCardVisibility;
};

const INTENT_PREFIX = 'presentation-intent:';

const NOOP_LOG: PresentationTransitionControllerLog = () => {};

export class PresentationTransitionController {
  private readonly publish: PresentationTransitionControllerOptions['publish'];

  private readonly log: PresentationTransitionControllerLog;

  private readonly onIntentComplete: ((intentId: string) => void) | undefined;

  private readonly now: () => number;

  private intentSeq = 0;

  private state: InternalState = {
    intentId: null,
    phase: 'idle',
    kind: null,
    loadingMode: 'none',
    resultsCoverVisible: false,
    startedAtMs: null,
    dataReady: false,
    listFirstPaintReady: false,
    presentationLane: null,
    coverageReady: true,
    requiresCoverage: false,
    revealTransactionId: null,
    revealMode: null,
    revealPhase: 'idle',
    resultsSurfaceMode: 'none',
    resultsCardVisibility: 'hidden',
  };

  public pendingFeedbackIntentId: string | null = null;

  public constructor(options: PresentationTransitionControllerOptions) {
    this.publish = options.publish;
    this.log = options.log ?? NOOP_LOG;
    this.onIntentComplete = options.onIntentComplete;
    this.now = options.now ?? Date.now;
    this.publishProjection();
  }

  private nextIntentId(): string {
    this.intentSeq += 1;
    return `${INTENT_PREFIX}${this.intentSeq}`;
  }

  private getRevealLane(state: InternalState = this.state): PresentationRevealLaneState | null {
    return state.presentationLane?.kind === 'reveal' ? state.presentationLane : null;
  }

  private getDismissLane(state: InternalState = this.state): PresentationDismissLaneState | null {
    return state.presentationLane?.kind === 'dismiss' ? state.presentationLane : null;
  }

  private deriveMapPresentationPhase(state: InternalState): PresentationMapPhase {
    const lane = state.presentationLane;
    if (lane?.kind === 'dismiss') {
      return lane.status === 'dismissing' ? 'dismissing' : 'dismiss_preroll';
    }
    if (lane?.kind === 'reveal') {
      switch (lane.status) {
        case 'pending_mount':
        case 'mounted_hidden':
          return 'reveal_requested';
        case 'revealing':
          return 'revealing';
        case 'live':
          return 'live';
      }
    }
    if (state.loadingMode === 'initial_cover' && state.resultsCoverVisible) {
      return 'covered';
    }
    return 'idle';
  }

  private publishProjection(): void {
    this.publish({
      presentationTransitionKind:
        this.state.phase === 'idle' || this.state.phase === 'settled' ? null : this.state.kind,
      presentationTransitionLoadingMode: this.state.loadingMode,
      presentationResultsCoverVisible: this.state.resultsCoverVisible,
      presentationLane: this.state.presentationLane,
      mapPresentationPhase: this.deriveMapPresentationPhase(this.state),
      presentationRevealTransactionId: this.state.revealTransactionId,
      presentationRevealMode: this.state.revealMode,
      presentationRevealPhase: this.state.revealPhase,
      presentationResultsSurfaceMode: this.state.resultsSurfaceMode,
      presentationResultsCardVisibility: this.state.resultsCardVisibility,
      presentationShouldShowResultsCards: this.state.resultsCardVisibility === 'live',
    });
  }

  private clearPresentationLane(draft: InternalState): void {
    draft.presentationLane = null;
  }

  private resetPresentationState(
    draft: InternalState,
    options?: {
      clearCover?: boolean;
      loadingMode?: PresentationLoadingMode;
    }
  ): void {
    this.clearPresentationLane(draft);
    draft.dataReady = false;
    draft.listFirstPaintReady = false;
    draft.coverageReady = true;
    draft.requiresCoverage = false;
    draft.startedAtMs = null;
    draft.phase = 'idle';
    draft.kind = null;
    draft.intentId = null;
    draft.loadingMode = options?.loadingMode ?? 'none';
    draft.resultsCoverVisible = options?.clearCover ?? false;
    draft.revealTransactionId = null;
    draft.revealMode = null;
    draft.revealPhase = 'idle';
    draft.resultsSurfaceMode = 'none';
    draft.resultsCardVisibility = 'hidden';
  }

  private mutate(mutator: (draft: InternalState) => boolean): void {
    const nextState: InternalState = { ...this.state };
    const didChange = mutator(nextState);
    if (!didChange) {
      return;
    }
    this.state = nextState;
    this.publishProjection();
  }

  private isActiveIntent(intentId: string | null): boolean {
    return Boolean(intentId && this.state.intentId && this.state.intentId === intentId);
  }

  public getActiveIntentId(): string | null {
    return this.state.intentId;
  }

  public enterTransitionMode(loadingMode: Exclude<PresentationLoadingMode, 'none'>): void {
    this.pendingFeedbackIntentId = null;
    const prevLoadingMode = this.state.loadingMode;
    const hadActiveIntent = this.state.intentId != null;
    this.log('enterTransitionMode', { loadingMode, prevLoadingMode, hadActiveIntent });
    this.mutate((draft) => {
      if (draft.intentId != null) {
        this.resetPresentationState(draft, {
          clearCover: false,
          loadingMode,
        });
      }
      draft.loadingMode = loadingMode;
      draft.resultsCoverVisible = true;
      draft.resultsSurfaceMode =
        loadingMode === 'initial_cover' ? 'initial_loading' : 'interaction_loading';
      draft.resultsCardVisibility = 'frozen';
      return true;
    });
  }

  public startFeedback(loadingMode: Exclude<PresentationLoadingMode, 'none'>): void {
    const prevLoadingMode = this.state.loadingMode;
    const hadActiveIntent = this.state.intentId != null;
    this.log('startFeedback', { loadingMode, prevLoadingMode, hadActiveIntent });
    this.mutate((draft) => {
      if (draft.intentId != null) {
        this.resetPresentationState(draft, {
          clearCover: false,
          loadingMode,
        });
      }
      draft.loadingMode = loadingMode;
      draft.resultsCoverVisible = true;
      draft.resultsSurfaceMode =
        loadingMode === 'initial_cover' ? 'initial_loading' : 'interaction_loading';
      draft.resultsCardVisibility = 'frozen';
      return true;
    });
  }

  public armDismiss(intentId: string): boolean {
    if (intentId !== this.pendingFeedbackIntentId) {
      this.log('armDismiss:skip', {
        intentId,
        pendingFeedbackIntentId: this.pendingFeedbackIntentId,
      });
      return false;
    }
    this.pendingFeedbackIntentId = null;
    this.log('armDismiss', { intentId });
    return true;
  }

  public clearPendingDismissIntent(intentId?: string): void {
    if (
      intentId != null &&
      this.pendingFeedbackIntentId != null &&
      this.pendingFeedbackIntentId !== intentId
    ) {
      return;
    }
    this.pendingFeedbackIntentId = null;
  }

  public exitTransitionMode(): void {
    this.clearPendingDismissIntent();
    if (this.state.loadingMode === 'none') {
      return;
    }
    this.log('exitTransitionMode', { prevLoadingMode: this.state.loadingMode });
    this.mutate((draft) => {
      draft.loadingMode = 'none';
      draft.resultsCoverVisible = false;
      draft.resultsSurfaceMode = 'none';
      draft.resultsCardVisibility = draft.revealMode === 'close' ? 'hidden' : 'live';
      return true;
    });
  }

  public beginIntent(options: BeginPresentationIntentOptions): string {
    const {
      kind,
      loadingMode,
      intentId = this.nextIntentId(),
      requiresCoverage = false,
      revealMode = loadingMode === 'initial_cover' ? 'fresh_reveal' : 'in_place_rerun',
    } = options;
    const nowMs = this.now();
    this.log('beginIntent', { intentId, kind, loadingMode, requiresCoverage, revealMode });
    this.mutate((draft) => {
      draft.intentId = intentId;
      draft.phase = 'executing';
      draft.kind = kind;
      draft.loadingMode = loadingMode;
      draft.resultsCoverVisible = true;
      draft.startedAtMs = nowMs;
      draft.dataReady = false;
      draft.listFirstPaintReady = false;
      this.clearPresentationLane(draft);
      draft.coverageReady = !requiresCoverage;
      draft.requiresCoverage = requiresCoverage;
      draft.revealTransactionId = intentId;
      draft.revealMode = revealMode;
      draft.revealPhase = 'covered';
      draft.resultsSurfaceMode =
        revealMode === 'fresh_reveal'
          ? 'initial_loading'
          : revealMode === 'in_place_rerun'
          ? 'interaction_loading'
          : 'none';
      draft.resultsCardVisibility =
        revealMode === 'fresh_reveal'
          ? 'frozen'
          : revealMode === 'in_place_rerun'
          ? 'frozen'
          : 'hidden';
      return true;
    });
    return intentId;
  }

  public cancelIntent(intentId: string): void {
    if (!this.isActiveIntent(intentId)) {
      this.log('cancelIntent:skip', { intentId, activeIntentId: this.state.intentId });
      return;
    }
    this.clearPendingDismissIntent();
    this.log('cancelIntent', { intentId });
    this.mutate((draft) => {
      draft.phase = 'cancelled';
      this.resetPresentationState(draft, {
        clearCover: false,
        loadingMode: 'none',
      });
      return true;
    });
  }

  public markDataReady(intentId: string): void {
    if (!this.isActiveIntent(intentId)) {
      this.log('markDataReady:skip', { intentId, activeIntentId: this.state.intentId });
      return;
    }
    this.log('markDataReady', { intentId, phase: this.state.phase });
    this.mutate((draft) => {
      if (draft.dataReady) {
        return false;
      }
      draft.dataReady = true;
      if (draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      this.maybeRequestRevealMount(draft);
      this.tryStartReveal(draft);
      return true;
    });
  }

  public markListFirstPaintReady(intentId: string, ready: boolean): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.log('markListFirstPaintReady', { intentId, ready, phase: this.state.phase });
    this.mutate((draft) => {
      if (draft.listFirstPaintReady === ready) {
        return false;
      }
      draft.listFirstPaintReady = ready;
      if (ready && draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      this.maybeRequestRevealMount(draft);
      this.tryStartReveal(draft);
      return true;
    });
  }

  public markCoverageReady(intentId: string, ready: boolean): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.log('markCoverageReady', { intentId, ready });
    this.mutate((draft) => {
      if (draft.coverageReady === ready) {
        return false;
      }
      draft.coverageReady = ready;
      if (ready && draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      this.maybeRequestRevealMount(draft);
      this.tryStartReveal(draft);
      return true;
    });
  }

  public markRevealBatchMountedHidden(
    intentId: string,
    revealBatch: PresentationRevealBatchRef
  ): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.log('markRevealBatchMountedHidden', {
      intentId,
      revealBatchId: revealBatch.batchId,
      generationId: revealBatch.generationId,
      phase: this.state.phase,
      revealBatchStatus: this.getRevealLane()?.status ?? null,
    });
    this.mutate((draft) => {
      const revealLane = this.getRevealLane(draft);
      if (revealLane == null || revealLane.requestKey !== revealBatch.requestKey) {
        return false;
      }
      if (revealLane.status !== 'pending_mount') {
        return false;
      }
      draft.presentationLane = {
        ...revealLane,
        batch: revealBatch,
        status: 'mounted_hidden',
      };
      draft.revealPhase = 'awaiting_map_reveal_start';
      this.tryStartReveal(draft);
      return true;
    });
  }

  private maybeRequestRevealMount(draft: InternalState): void {
    if (!draft.intentId || draft.presentationLane != null) {
      return;
    }
    if (!draft.dataReady || !draft.listFirstPaintReady || !draft.coverageReady) {
      this.log('requestRevealMount:blocked', {
        intentId: draft.intentId,
        dataReady: draft.dataReady,
        listFirstPaintReady: draft.listFirstPaintReady,
        coverageReady: draft.coverageReady,
        phase: draft.phase,
        loadingMode: draft.loadingMode,
      });
      return;
    }
    this.log('requestRevealMount', { intentId: draft.intentId });
    draft.presentationLane = {
      kind: 'reveal',
      requestKey: draft.intentId,
      batch: null,
      status: 'pending_mount',
      startToken: null,
    };
    if (draft.phase === 'executing') {
      draft.phase = 'awaiting_readiness';
    }
  }

  private tryStartReveal(draft: InternalState): void {
    const revealLane = this.getRevealLane(draft);
    if (!draft.intentId || revealLane?.startToken != null) {
      return;
    }
    if (
      !draft.dataReady ||
      !draft.listFirstPaintReady ||
      !draft.coverageReady ||
      revealLane == null ||
      revealLane.batch == null ||
      revealLane.status !== 'mounted_hidden'
    ) {
      this.log('tryStartReveal:blocked', {
        intentId: draft.intentId,
        dataReady: draft.dataReady,
        listFirstPaintReady: draft.listFirstPaintReady,
        coverageReady: draft.coverageReady,
        activeRevealRequestKey: revealLane?.requestKey ?? null,
        activeRevealBatchId: revealLane?.batch?.batchId ?? null,
        activeRevealGenerationId: revealLane?.batch?.generationId ?? null,
        revealBatchStatus: revealLane?.status ?? null,
        phase: draft.phase,
        loadingMode: draft.loadingMode,
      });
      return;
    }
    const revealBatch = revealLane.batch;
    draft.presentationLane = {
      ...revealLane,
      status: 'revealing',
      startToken: this.now(),
    };
    if (draft.phase === 'executing') {
      draft.phase = 'awaiting_readiness';
    }
    draft.revealPhase = 'revealing';
    draft.resultsCoverVisible = false;
    draft.resultsSurfaceMode = 'none';
    draft.resultsCardVisibility = 'live';
    this.log('startReveal', {
      intentId: draft.intentId,
      revealBatchId: revealBatch.batchId,
      generationId: revealBatch.generationId,
      revealStartToken: (draft.presentationLane as PresentationRevealLaneState).startToken,
    });
  }

  public markRevealStarted(intentId: string, revealBatch: PresentationRevealBatchRef | null): void {
    if (!this.isActiveIntent(intentId)) {
      this.log('markRevealStarted:skip_not_active', {
        intentId,
        activeIntentId: this.state.intentId,
      });
      return;
    }
    const revealLane = this.getRevealLane();
    if (revealLane == null || revealLane.requestKey !== intentId) {
      return;
    }
    if (revealBatch != null && revealBatch.requestKey !== intentId) {
      this.log('markRevealStarted:skip_request_mismatch', {
        intentId,
        revealRequestKey: revealBatch.requestKey,
      });
      return;
    }
    this.log('markRevealStarted', {
      intentId,
      revealBatchId: revealBatch?.batchId ?? revealLane.batch?.batchId ?? null,
      generationId: revealBatch?.generationId ?? revealLane.batch?.generationId ?? null,
      revealMode: this.state.revealMode,
    });
    this.mutate((draft) => {
      const activeRevealLane = this.getRevealLane(draft);
      if (activeRevealLane == null || activeRevealLane.requestKey !== intentId) {
        return false;
      }
      draft.presentationLane = {
        ...activeRevealLane,
        batch: revealBatch ?? activeRevealLane.batch,
      };
      return true;
    });
  }

  public markRevealFirstVisibleFrame(
    intentId: string,
    revealBatch: PresentationRevealBatchRef | null
  ): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    const revealLane = this.getRevealLane();
    if (revealLane == null || revealLane.requestKey !== intentId) {
      return;
    }
    if (revealBatch != null && revealBatch.requestKey !== intentId) {
      return;
    }
    this.log('markRevealFirstVisibleFrame', {
      intentId,
      revealBatchId: revealBatch?.batchId ?? revealLane.batch?.batchId ?? null,
      generationId: revealBatch?.generationId ?? revealLane.batch?.generationId ?? null,
      revealMode: this.state.revealMode,
    });
    this.mutate((draft) => {
      const activeRevealLane = this.getRevealLane(draft);
      if (activeRevealLane == null || activeRevealLane.requestKey !== intentId) {
        return false;
      }
      draft.presentationLane = {
        ...activeRevealLane,
        batch: revealBatch ?? activeRevealLane.batch,
      };
      return true;
    });
  }

  public markRevealBatchSettled(
    intentId: string,
    revealBatch: PresentationRevealBatchRef | null
  ): void {
    if (!this.isActiveIntent(intentId)) {
      this.log('markRevealBatchSettled:skip_not_active', {
        intentId,
        activeIntentId: this.state.intentId,
        phase: this.state.phase,
        loadingMode: this.state.loadingMode,
      });
      return;
    }
    const revealLane = this.getRevealLane();
    if (revealLane == null || revealLane.requestKey !== intentId) {
      return;
    }
    if (revealBatch != null && revealBatch.requestKey !== intentId) {
      this.log('markRevealBatchSettled:skip_request_mismatch', {
        intentId,
        settledRequestKey: revealBatch.requestKey,
      });
      return;
    }
    this.log('markRevealBatchSettled', {
      intentId,
      phase: this.state.phase,
      revealBatchId: revealBatch?.batchId ?? revealLane.batch?.batchId ?? null,
      generationId: revealBatch?.generationId ?? revealLane.batch?.generationId ?? null,
    });
    const completingIntentId = this.state.intentId;
    this.mutate((draft) => {
      const activeRevealLane = this.getRevealLane(draft);
      if (activeRevealLane == null || activeRevealLane.requestKey !== intentId) {
        return false;
      }
      draft.phase = 'settled';
      draft.presentationLane = {
        kind: 'reveal',
        requestKey: intentId,
        batch: revealBatch ?? activeRevealLane.batch,
        status: 'live',
        startToken: activeRevealLane.startToken,
      };
      draft.loadingMode = 'none';
      draft.revealPhase = 'live';
      draft.resultsSurfaceMode = 'none';
      draft.resultsCardVisibility = 'live';
      draft.intentId = null;
      draft.kind = null;
      draft.startedAtMs = null;
      draft.dataReady = false;
      draft.listFirstPaintReady = false;
      draft.resultsCoverVisible = false;
      draft.coverageReady = true;
      draft.requiresCoverage = false;
      return true;
    });
    if (completingIntentId) {
      this.onIntentComplete?.(completingIntentId);
    }
  }

  public startClosePresentation(options?: { intentId?: string }): string {
    const intentId = options?.intentId ?? this.nextIntentId();
    const nowMs = this.now();
    this.clearPendingDismissIntent();
    this.log('startClosePresentation', { intentId });
    this.mutate((draft) => {
      draft.intentId = intentId;
      draft.phase = 'executing';
      draft.kind = 'close_search';
      draft.loadingMode = 'interaction_frost';
      draft.resultsCoverVisible = true;
      draft.startedAtMs = nowMs;
      draft.dataReady = false;
      draft.listFirstPaintReady = false;
      draft.presentationLane = {
        kind: 'dismiss',
        requestKey: intentId,
        status: 'requested',
        startToken: null,
      };
      draft.coverageReady = true;
      draft.requiresCoverage = false;
      draft.revealTransactionId = intentId;
      draft.revealMode = 'close';
      draft.revealPhase = 'closing';
      draft.resultsSurfaceMode = 'none';
      draft.resultsCardVisibility = 'live';
      return true;
    });
    return intentId;
  }

  public requestMapPresentationTarget(options: RequestPresentationTargetOptions): string {
    if (options.target === 'default') {
      const activeIntentId = this.getActiveIntentId();
      if (activeIntentId != null) {
        this.cancelIntent(activeIntentId);
      }
      return this.startClosePresentation({ intentId: options.intentId });
    }

    const dismissRequestKey = this.getDismissLane()?.requestKey ?? null;
    if (dismissRequestKey != null) {
      this.cancelClosePresentation(dismissRequestKey);
    }
    const activeIntentId = this.getActiveIntentId();
    if (activeIntentId != null) {
      this.cancelIntent(activeIntentId);
    }
    return this.beginIntent({
      intentId: options.intentId,
      kind: options.kind ?? 'initial_search',
      loadingMode: options.loadingMode ?? 'interaction_frost',
      requiresCoverage: options.requiresCoverage,
      revealMode: options.revealMode,
    });
  }

  public markMapDismissStarted(payload: { requestKey: string; startedAtMs: number }): void {
    const dismissLane = this.getDismissLane();
    if (dismissLane == null || dismissLane.requestKey !== payload.requestKey) {
      this.log('markMapDismissStarted:skip', {
        requestKey: payload.requestKey,
        activeDismissRequestKey: dismissLane?.requestKey ?? null,
      });
      return;
    }
    this.log('markMapDismissStarted', payload);
    this.mutate((draft) => {
      const activeDismissLane = this.getDismissLane(draft);
      if (activeDismissLane == null || activeDismissLane.requestKey !== payload.requestKey) {
        return false;
      }
      draft.presentationLane = {
        ...activeDismissLane,
        status: 'dismissing',
        startToken: payload.startedAtMs,
      };
      return true;
    });
  }

  public markMapDismissSettled(payload: { requestKey: string; settledAtMs: number }): void {
    const dismissLane = this.getDismissLane();
    if (dismissLane == null || dismissLane.requestKey !== payload.requestKey) {
      this.log('markMapDismissSettled:skip', {
        requestKey: payload.requestKey,
        activeDismissRequestKey: dismissLane?.requestKey ?? null,
      });
      return;
    }
    this.log('markMapDismissSettled', payload);
    this.mutate((draft) => {
      const activeDismissLane = this.getDismissLane(draft);
      if (activeDismissLane == null || activeDismissLane.requestKey !== payload.requestKey) {
        return false;
      }
      draft.phase = 'settled';
      draft.loadingMode = 'none';
      draft.resultsCoverVisible = false;
      draft.startedAtMs = null;
      draft.intentId = null;
      draft.kind = null;
      draft.dataReady = false;
      draft.listFirstPaintReady = false;
      draft.coverageReady = true;
      draft.requiresCoverage = false;
      draft.presentationLane = null;
      draft.revealTransactionId = null;
      draft.revealMode = null;
      draft.revealPhase = 'idle';
      draft.resultsSurfaceMode = 'none';
      draft.resultsCardVisibility = 'hidden';
      return true;
    });
  }

  public cancelClosePresentation(intentId?: string): void {
    if (intentId != null && this.getDismissLane()?.requestKey !== intentId) {
      return;
    }
    if (this.getDismissLane() == null) {
      return;
    }
    this.clearPendingDismissIntent();
    this.log('cancelClosePresentation', {
      intentId,
      activeDismissRequestKey: this.getDismissLane()?.requestKey ?? null,
    });
    this.mutate((draft) => {
      this.resetPresentationState(draft, {
        clearCover: false,
        loadingMode: 'none',
      });
      return true;
    });
  }
}

export const createPresentationTransitionController = (
  options: PresentationTransitionControllerOptions
): PresentationTransitionController => new PresentationTransitionController(options);
