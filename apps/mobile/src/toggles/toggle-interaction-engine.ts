import { logger } from '../utils';

/**
 * THE TOGGLE INTERACTION ENGINE — the pure core of the revise-protocol
 * (plans/toggle-system-ideal.md v2.1). Extracted from the search toggle coordinator
 * (the TR5 portable-toggle-primitive seed); the state machine moved verbatim, the
 * React hook structure became closures, and the bus writes became optional sinks.
 *
 * The protocol every toggle rides:
 *   begin (press-up; caller has already flipped its own optimistic state)
 *     → restarting quiet-window debounce (rapid taps re-arm; the heavy consequence
 *       fires exactly once, ~settleMs after the LAST tap — never mid-burst)
 *     → commit: run the consequence (sync or async; AbortSignal provided)
 *     → optional visual-sync wait (finalize deferred until notifyIntentComplete)
 *     → finalize (idle republish + 'finalized' lifecycle)
 * with seq-guarded cancellation at every boundary: cancel() aborts the in-flight
 * signal and drops any stale timer/landing; a superseded async landing can never
 * publish through the engine.
 *
 * Generic on TKind (each surface brings its own kind vocabulary). Both sinks are
 * OPTIONAL: a bus-backed surface (search) mirrors interaction state onto its bus; a
 * pageless surface reads getState()/subscribe() or ignores pending entirely.
 * Failure: a throwing/rejecting runner emits a 'failed' lifecycle event and
 * finalizes — surfaces route 'failed' to the uniform failure announcement where
 * that is the intended UX.
 */

export type ToggleInteractionState<TKind extends string> = {
  kind: TKind | null;
  pendingPresentationIntentId: string | null;
};

export type ToggleLifecycleEvent<TKind extends string> =
  | { type: 'started'; intentId: string; kind: TKind }
  | { type: 'settled'; intentId: string; kind: TKind }
  | { type: 'finalized'; intentId: string; kind: TKind; awaitedVisualSync: boolean }
  | { type: 'cancelled'; intentId: string; kind: TKind }
  | { type: 'failed'; intentId: string; kind: TKind; reason: string };

export type ToggleRunnerOutcome = { awaitVisualSync?: boolean } | void;

export type ToggleRunner = (args: {
  intentId: string;
  signal: AbortSignal;
}) => ToggleRunnerOutcome | Promise<ToggleRunnerOutcome>;

export type ToggleInteractionEngine<TKind extends string> = {
  begin: (runner: ToggleRunner, options: { kind: TKind }) => void;
  cancel: () => void;
  notifyIntentComplete: (intentId: string) => void;
  getState: () => ToggleInteractionState<TKind>;
  subscribe: (listener: () => void) => () => void;
  /** Test/teardown hook: clears any armed settle timer without emitting events. */
  dispose: () => void;
};

type CreateToggleInteractionEngineArgs<TKind extends string> = {
  /** Bus-adapter sink: mirrors interaction state into an external store (search bus). */
  onInteractionState?: (state: ToggleInteractionState<TKind>) => void;
  onLifecycle?: (event: ToggleLifecycleEvent<TKind>) => void;
  /** Restarting quiet-window length. 0 commits synchronously on begin. */
  settleMs?: number;
};

const TOGGLE_INTENT_PREFIX = 'toggle-intent:';
export const DEFAULT_TOGGLE_SETTLE_MS = 300;

export const createIdleToggleInteractionState = <
  TKind extends string,
>(): ToggleInteractionState<TKind> => ({
  kind: null,
  pendingPresentationIntentId: null,
});

export const createToggleInteractionEngine = <TKind extends string>({
  onInteractionState,
  onLifecycle,
  settleMs = DEFAULT_TOGGLE_SETTLE_MS,
}: CreateToggleInteractionEngineArgs<TKind> = {}): ToggleInteractionEngine<TKind> => {
  let interactionSeq = 0;
  let activeKind: TKind | null = null;
  let activeIntentId: string | null = null;
  let activeRunner: ToggleRunner | null = null;
  let awaitingVisualSync = false;
  let settleTimeout: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let state: ToggleInteractionState<TKind> = createIdleToggleInteractionState<TKind>();
  const listeners = new Set<() => void>();

  const publishState = (next: ToggleInteractionState<TKind>): void => {
    state = next;
    onInteractionState?.(next);
    listeners.forEach((listener) => listener());
  };

  const clearSettleTimeout = (): void => {
    if (settleTimeout != null) {
      clearTimeout(settleTimeout);
      settleTimeout = null;
    }
  };

  const finalizeInteraction = (seq: number, awaitedVisualSync: boolean): boolean => {
    if (interactionSeq !== seq) {
      return false;
    }
    clearSettleTimeout();
    const intentId = activeIntentId;
    const kind = activeKind;
    logger.info('[TOGGLE] finalize', { intentId, kind, awaitedVisualSync });
    activeKind = null;
    activeIntentId = null;
    activeRunner = null;
    awaitingVisualSync = false;
    abortController = null;
    publishState(createIdleToggleInteractionState<TKind>());
    if (intentId != null && kind != null) {
      onLifecycle?.({ type: 'finalized', intentId, kind, awaitedVisualSync });
    }
    return true;
  };

  const failInteraction = (seq: number, reason: string): void => {
    if (interactionSeq !== seq) {
      return;
    }
    const intentId = activeIntentId;
    const kind = activeKind;
    logger.warn('Toggle interaction commit failed', { message: reason });
    if (intentId != null && kind != null) {
      onLifecycle?.({ type: 'failed', intentId, kind, reason });
    }
    finalizeInteraction(seq, false);
  };

  const cancel = (): void => {
    const intentId = activeIntentId;
    const kind = activeKind;
    interactionSeq += 1;
    clearSettleTimeout();
    abortController?.abort();
    abortController = null;
    activeKind = null;
    activeIntentId = null;
    activeRunner = null;
    awaitingVisualSync = false;
    publishState(createIdleToggleInteractionState<TKind>());
    if (intentId != null && kind != null) {
      onLifecycle?.({ type: 'cancelled', intentId, kind });
    }
  };

  const settleOutcome = (seq: number, outcome: ToggleRunnerOutcome): void => {
    if (interactionSeq !== seq) {
      return;
    }
    if (outcome == null || outcome.awaitVisualSync !== true) {
      finalizeInteraction(seq, false);
      return;
    }
    awaitingVisualSync = true;
  };

  const commitActiveInteraction = (intentId: string): void => {
    if (activeIntentId !== intentId) {
      return;
    }
    const seq = interactionSeq;
    const runner = activeRunner;
    const kind = activeKind;
    if (runner == null || kind == null || awaitingVisualSync) {
      return;
    }
    activeRunner = null;
    logger.info('[TOGGLE] settle:commit', { intentId, kind });
    publishState({ kind, pendingPresentationIntentId: null });
    onLifecycle?.({ type: 'settled', intentId, kind });

    abortController = new AbortController();
    let result: ToggleRunnerOutcome | Promise<ToggleRunnerOutcome>;
    try {
      result = runner({ intentId, signal: abortController.signal });
    } catch (error) {
      failInteraction(seq, error instanceof Error ? error.message : 'unknown error');
      return;
    }
    if (result instanceof Promise) {
      // Async consequence: the landing re-checks the seq guard, so a cancel or a
      // newer interaction drops it silently — a stale landing can never publish
      // through the engine.
      result.then(
        (outcome) => settleOutcome(seq, outcome),
        (error) => failInteraction(seq, error instanceof Error ? error.message : 'unknown error')
      );
      return;
    }
    settleOutcome(seq, result);
  };

  const begin = (runner: ToggleRunner, options: { kind: TKind }): void => {
    const seq = interactionSeq + 1;
    interactionSeq = seq;
    const kind = options.kind;
    const intentId = `${TOGGLE_INTENT_PREFIX}${seq}`;
    // A superseded in-flight consequence is dead the moment a new interaction
    // begins — abort its signal so cancelable work stops burning.
    abortController?.abort();
    abortController = null;
    activeKind = kind;
    activeIntentId = intentId;
    activeRunner = runner;
    awaitingVisualSync = false;
    logger.info('[TOGGLE] begin', { seq, intentId, kind });
    onLifecycle?.({ type: 'started', intentId, kind });
    publishState({ kind, pendingPresentationIntentId: intentId });

    if (settleMs <= 0) {
      commitActiveInteraction(intentId);
      return;
    }
    // RESTARTING quiet-window debounce: each begin re-arms the timer, so the heavy
    // commit fires exactly once after the user pauses; the seq guard drops a stale
    // timer if a newer interaction superseded this one before it fired.
    clearSettleTimeout();
    settleTimeout = setTimeout(() => {
      settleTimeout = null;
      if (interactionSeq !== seq) {
        return;
      }
      commitActiveInteraction(intentId);
    }, settleMs);
  };

  const notifyIntentComplete = (intentId: string): void => {
    if (activeIntentId !== intentId) {
      return;
    }
    finalizeInteraction(interactionSeq, true);
  };

  return {
    begin,
    cancel,
    notifyIntentComplete,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: clearSettleTimeout,
  };
};
