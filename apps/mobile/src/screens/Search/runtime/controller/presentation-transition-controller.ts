export type PresentationMutationKind =
  | 'initial_search'
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

type PresentationTransitionPublishPatch = {
  presentationTransitionKind: PresentationMutationKind | null;
  presentationTransitionLoadingMode: PresentationLoadingMode;
  presentationMapRevealRequestKey: string | null;
  presentationDismissEpoch: number;
};

export type BeginPresentationIntentOptions = {
  kind: PresentationMutationKind;
  loadingMode: Exclude<PresentationLoadingMode, 'none'>;
  intentId?: string;
  requiresCoverage?: boolean;
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
  startedAtMs: number | null;
  dataReady: boolean;
  listReady: boolean;
  mapReady: boolean;
  coverageReady: boolean;
  revealEpoch: number;
  dismissEpoch: number;
  mapRevealRequested: boolean;
  mapRevealRequestKey: string | null;
  requiresCoverage: boolean;
};

const INTENT_PREFIX = 'presentation-intent:';

const NOOP_LOG: PresentationTransitionControllerLog = () => {};

export class PresentationTransitionController {
  private readonly publish: PresentationTransitionControllerOptions['publish'];

  private readonly log: PresentationTransitionControllerLog;

  private readonly onIntentComplete: ((intentId: string) => void) | undefined;

  private readonly now: () => number;

  private intentSeq = 0;

  private pendingFeedbackShouldBumpDismiss = false;

  private state: InternalState = {
    intentId: null,
    phase: 'idle',
    kind: null,
    loadingMode: 'none',
    startedAtMs: null,
    dataReady: false,
    listReady: false,
    mapReady: false,
    coverageReady: true,
    revealEpoch: 0,
    dismissEpoch: 0,
    mapRevealRequested: false,
    mapRevealRequestKey: null,
    requiresCoverage: false,
  };

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

  private publishProjection(): void {
    this.publish({
      presentationTransitionKind:
        this.state.phase === 'idle' || this.state.phase === 'settled' ? null : this.state.kind,
      presentationTransitionLoadingMode: this.state.loadingMode,
      presentationMapRevealRequestKey: this.state.mapRevealRequestKey,
      presentationDismissEpoch: this.state.dismissEpoch,
    });
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
    this.pendingFeedbackShouldBumpDismiss = false;
    const prevLoadingMode = this.state.loadingMode;
    const hadActiveIntent = this.state.intentId != null;
    this.log('enterTransitionMode', { loadingMode, prevLoadingMode, hadActiveIntent });
    this.mutate((draft) => {
      // If an intent is mid-flight (e.g. reveal already started), cancel it.
      // The new toggle supersedes whatever was in progress — pins must stay
      // dismissed until the new intent settles and completes its own reveal.
      if (draft.intentId != null) {
        draft.phase = 'cancelled';
        draft.intentId = null;
        draft.kind = null;
        draft.startedAtMs = null;
        draft.dataReady = false;
        draft.listReady = false;
        draft.mapReady = false;
        draft.coverageReady = true;
        draft.mapRevealRequested = false;
        draft.mapRevealRequestKey = null;
        draft.requiresCoverage = false;
      }
      draft.loadingMode = loadingMode;
      // Increment dismiss epoch when entering frost from idle, OR when
      // cancelling an active intent whose reveal may have already started.
      // In both cases visible pins need a coordinated fade-out.  During
      // rapid toggles where no intent completed (frost → frost, no intent),
      // the existing dismiss continues uninterrupted.
      if (loadingMode === 'interaction_frost' && (prevLoadingMode === 'none' || hadActiveIntent)) {
        draft.dismissEpoch += 1;
      }
      return true;
    });
  }

  /**
   * Feedback-only lane: sets loading mode without bumping dismiss epoch.
   * Used by toggles so chip/frost commit is not blocked by map dismiss reconciliation.
   */
  public startFeedback(loadingMode: Exclude<PresentationLoadingMode, 'none'>): void {
    const prevLoadingMode = this.state.loadingMode;
    const hadActiveIntent = this.state.intentId != null;
    this.pendingFeedbackShouldBumpDismiss =
      loadingMode === 'interaction_frost' && (prevLoadingMode === 'none' || hadActiveIntent);
    this.log('startFeedback', { loadingMode, prevLoadingMode, hadActiveIntent });
    this.mutate((draft) => {
      if (draft.intentId != null) {
        draft.phase = 'cancelled';
        draft.intentId = null;
        draft.kind = null;
        draft.startedAtMs = null;
        draft.dataReady = false;
        draft.listReady = false;
        draft.mapReady = false;
        draft.coverageReady = true;
        draft.mapRevealRequested = false;
        draft.mapRevealRequestKey = null;
        draft.requiresCoverage = false;
      }
      draft.loadingMode = loadingMode;
      return true;
    });
  }

  /**
   * Dismiss lane: bump dismiss epoch only for the active pending feedback intent.
   */
  public armDismiss(intentId: string): boolean {
    if (intentId !== this.pendingFeedbackIntentId) {
      this.log('armDismiss:skip', { intentId, pendingFeedbackIntentId: this.pendingFeedbackIntentId });
      return false;
    }
    this.pendingFeedbackIntentId = null;
    const shouldBumpDismiss = this.pendingFeedbackShouldBumpDismiss;
    this.pendingFeedbackShouldBumpDismiss = false;
    if (!shouldBumpDismiss) {
      this.log('armDismiss:skipNoBump', { intentId });
      return true;
    }
    this.log('armDismiss', { intentId });
    this.mutate((draft) => {
      draft.dismissEpoch += 1;
      return true;
    });
    return true;
  }

  public clearPendingDismissIntent(intentId?: string): void {
    if (intentId != null && this.pendingFeedbackIntentId != null && this.pendingFeedbackIntentId !== intentId) {
      return;
    }
    this.pendingFeedbackIntentId = null;
    this.pendingFeedbackShouldBumpDismiss = false;
  }

  /**
   * Pending dismiss token for fast-path feedback->dismiss sequencing.
   */
  public pendingFeedbackIntentId: string | null = null;

  public exitTransitionMode(): void {
    this.clearPendingDismissIntent();
    if (this.state.loadingMode === 'none') {
      return;
    }
    this.log('exitTransitionMode', { prevLoadingMode: this.state.loadingMode });
    this.mutate((draft) => {
      draft.loadingMode = 'none';
      return true;
    });
  }

  public beginIntent(options: BeginPresentationIntentOptions): string {
    const {
      kind,
      loadingMode,
      intentId = this.nextIntentId(),
      requiresCoverage = false,
    } = options;
    const nowMs = this.now();
    this.log('beginIntent', { intentId, kind, loadingMode, requiresCoverage });
    this.mutate((draft) => {
      draft.intentId = intentId;
      draft.phase = 'executing';
      draft.kind = kind;
      draft.loadingMode = loadingMode;
      draft.startedAtMs = nowMs;
      draft.dataReady = false;
      draft.listReady = false;
      draft.mapReady = false;
      draft.coverageReady = !requiresCoverage;
      draft.mapRevealRequested = false;
      draft.mapRevealRequestKey = null;
      draft.requiresCoverage = requiresCoverage;
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
      draft.intentId = null;
      draft.kind = null;
      draft.loadingMode = 'none';
      draft.startedAtMs = null;
      draft.dataReady = false;
      draft.listReady = false;
      draft.mapReady = false;
      draft.coverageReady = true;
      draft.mapRevealRequested = false;
      draft.mapRevealRequestKey = null;
      draft.requiresCoverage = false;
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
      draft.listReady = false; // invalidate stale list readiness
      if (draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      this.tryReveal(draft);
      return true;
    });
  }

  public markListReady(intentId: string, ready: boolean): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.log('markListReady', { intentId, ready, phase: this.state.phase });
    this.mutate((draft) => {
      if (draft.listReady === ready) {
        return false;
      }
      draft.listReady = ready;
      if (ready && draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      this.tryReveal(draft);
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
      this.tryReveal(draft);
      return true;
    });
  }

  private tryReveal(draft: InternalState): void {
    if (draft.mapRevealRequested) return;
    if (!draft.intentId) return;
    if (!draft.dataReady || !draft.listReady || !draft.coverageReady) return;
    this.log('tryReveal', { intentId: draft.intentId });
    draft.mapRevealRequested = true;
    draft.mapRevealRequestKey = draft.intentId;
    if (draft.phase === 'executing') {
      draft.phase = 'awaiting_readiness';
    }
  }

  public markMapRevealStarted(intentId: string): void {
    if (!this.isActiveIntent(intentId)) {
      this.log('markMapRevealStarted:SKIP_NOT_ACTIVE', {
        intentId,
        activeIntentId: this.state.intentId,
        phase: this.state.phase,
        loadingMode: this.state.loadingMode,
      });
      return;
    }
    this.log('markMapRevealStarted', { intentId, phase: this.state.phase });
    const completingIntentId = this.state.intentId;
    this.mutate((draft) => {
      if (draft.mapReady) {
        return false;
      }
      draft.mapReady = true;
      draft.phase = 'settled';
      draft.loadingMode = 'none';
      draft.intentId = null;
      draft.kind = null;
      draft.startedAtMs = null;
      draft.dataReady = false;
      draft.listReady = false;
      draft.coverageReady = true;
      draft.mapRevealRequested = false;
      draft.mapRevealRequestKey = null;
      draft.requiresCoverage = false;
      draft.revealEpoch += 1;
      return true;
    });
    if (completingIntentId) {
      this.onIntentComplete?.(completingIntentId);
    }
  }

}

export const createPresentationTransitionController = (
  options: PresentationTransitionControllerOptions
): PresentationTransitionController => new PresentationTransitionController(options);
