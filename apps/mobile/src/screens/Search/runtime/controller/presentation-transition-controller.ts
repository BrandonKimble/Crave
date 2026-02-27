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
  | 'settling'
  | 'executing'
  | 'awaiting_readiness'
  | 'revealing'
  | 'settled'
  | 'cancelled';

export type PresentationLoadingMode = 'none' | 'initial_cover' | 'interaction_frost';

type PresentationTransitionPublishPatch = {
  presentationTransitionKind: PresentationMutationKind | null;
  presentationTransitionLoadingMode: PresentationLoadingMode;
};

export type BeginPresentationIntentOptions = {
  kind: PresentationMutationKind;
  loadingMode: Exclude<PresentationLoadingMode, 'none'>;
  intentId?: string;
  settleMs?: number;
  requiresCoverage?: boolean;
  phase?: Extract<PresentationPhase, 'settling' | 'executing'>;
};

type PresentationTransitionControllerOptions = {
  publish: (patch: PresentationTransitionPublishPatch) => void;
  now?: () => number;
  defaultSettleMs?: number;
};

type InternalState = {
  intentId: string | null;
  phase: PresentationPhase;
  kind: PresentationMutationKind | null;
  loadingMode: PresentationLoadingMode;
  startedAtMs: number | null;
  settleDeadlineMs: number | null;
  dataReady: boolean;
  listReady: boolean;
  mapReady: boolean;
  coverageReady: boolean;
  revealEpoch: number;
  mapRevealRequested: boolean;
  mapRevealRequestKey: string | null;
  requiresCoverage: boolean;
};

const DEFAULT_SETTLE_MS = 300;
const INTENT_PREFIX = 'presentation-intent:';

export class PresentationTransitionController {
  private readonly publish: PresentationTransitionControllerOptions['publish'];

  private readonly now: () => number;

  private readonly defaultSettleMs: number;

  private intentSeq = 0;

  private state: InternalState = {
    intentId: null,
    phase: 'idle',
    kind: null,
    loadingMode: 'none',
    startedAtMs: null,
    settleDeadlineMs: null,
    dataReady: false,
    listReady: false,
    mapReady: false,
    coverageReady: true,
    revealEpoch: 0,
    mapRevealRequested: false,
    mapRevealRequestKey: null,
    requiresCoverage: false,
  };

  public constructor(options: PresentationTransitionControllerOptions) {
    this.publish = options.publish;
    this.now = options.now ?? Date.now;
    this.defaultSettleMs = Math.max(1, options.defaultSettleMs ?? DEFAULT_SETTLE_MS);
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

  public beginIntent(options: BeginPresentationIntentOptions): string {
    const {
      kind,
      loadingMode,
      intentId = this.nextIntentId(),
      settleMs = this.defaultSettleMs,
      requiresCoverage = false,
      phase = loadingMode === 'interaction_frost' ? 'settling' : 'executing',
    } = options;
    const nowMs = this.now();
    const settleDeadlineMs = phase === 'settling' ? nowMs + Math.max(1, settleMs) : null;
    this.mutate((draft) => {
      draft.intentId = intentId;
      draft.phase = phase;
      draft.kind = kind;
      draft.loadingMode = loadingMode;
      draft.startedAtMs = nowMs;
      draft.settleDeadlineMs = settleDeadlineMs;
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
      return;
    }
    this.mutate((draft) => {
      draft.phase = 'cancelled';
      draft.intentId = null;
      draft.kind = null;
      draft.loadingMode = 'none';
      draft.startedAtMs = null;
      draft.settleDeadlineMs = null;
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

  public markSettlingComplete(intentId: string): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.mutate((draft) => {
      if (draft.phase !== 'settling') {
        return false;
      }
      draft.phase = 'executing';
      draft.settleDeadlineMs = null;
      return true;
    });
  }

  public markDataReady(intentId: string): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.mutate((draft) => {
      if (draft.dataReady) {
        return false;
      }
      draft.dataReady = true;
      if (draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      return true;
    });
  }

  public markListReady(intentId: string, ready: boolean): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.mutate((draft) => {
      if (draft.listReady === ready) {
        return false;
      }
      draft.listReady = ready;
      if (ready && draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      return true;
    });
  }

  public markCoverageReady(intentId: string, ready: boolean): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
    this.mutate((draft) => {
      if (draft.coverageReady === ready) {
        return false;
      }
      draft.coverageReady = ready;
      if (ready && draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      return true;
    });
  }

  public shouldRequestMapReveal(intentId: string): boolean {
    if (!this.isActiveIntent(intentId)) {
      return false;
    }
    return (
      this.state.dataReady &&
      this.state.listReady &&
      this.state.coverageReady &&
      !this.state.mapRevealRequested
    );
  }

  public markMapRevealRequested(intentId: string, requestKey: string): void {
    if (!this.isActiveIntent(intentId) || !requestKey) {
      return;
    }
    this.mutate((draft) => {
      if (draft.mapRevealRequested && draft.mapRevealRequestKey === requestKey) {
        return false;
      }
      draft.mapRevealRequested = true;
      draft.mapRevealRequestKey = requestKey;
      if (draft.phase === 'executing') {
        draft.phase = 'awaiting_readiness';
      }
      return true;
    });
  }

  public markMapRevealStarted(intentId: string): void {
    if (!this.isActiveIntent(intentId)) {
      return;
    }
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
      draft.settleDeadlineMs = null;
      draft.dataReady = false;
      draft.listReady = false;
      draft.coverageReady = true;
      draft.mapRevealRequested = false;
      draft.mapRevealRequestKey = null;
      draft.requiresCoverage = false;
      draft.revealEpoch += 1;
      return true;
    });
  }

  public markMapRevealSettled(intentId: string): void {
    if (!intentId) {
      return;
    }
    if (this.isActiveIntent(intentId)) {
      this.markMapRevealStarted(intentId);
    }
  }
}

export const createPresentationTransitionController = (
  options: PresentationTransitionControllerOptions
): PresentationTransitionController => new PresentationTransitionController(options);
