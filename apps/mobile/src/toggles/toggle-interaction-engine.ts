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
 *     → [awaitVisualFloor kinds] LEVEL gate: the commit additionally waits for the
 *       surface's visual floor (the presentation fade-out acked at ~0) — the swap can
 *       never land over a visible world (T3, plans/toggle-strip-primitive.md). The
 *       'started' lifecycle is what asserts the cover level that STARTS that fade, so
 *       press-up → fade-out begins → commit lands exactly at the floor. A bounded
 *       fallback (floor never acks: backgrounded app, dead ramp) commits anyway and
 *       logs LOUDLY — expose, never silently hang.
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
  begin: (runner: ToggleRunner, options: { kind: TKind; awaitVisualFloor?: boolean }) => void;
  cancel: () => void;
  notifyIntentComplete: (intentId: string) => void;
  /** Visual-floor ack (T3): the surface's fade-out reached ~0 — a gated commit whose
   *  quiet window already elapsed fires NOW; otherwise the ack is remembered for the
   *  active interaction. Idempotent; ignored when nothing is gated. */
  notifyVisualFloor: () => void;
  getState: () => ToggleInteractionState<TKind>;
  subscribe: (listener: () => void) => () => void;
  /** Teardown: a QUIET full stop — bumps the seq (dropping any in-flight landing),
   *  aborts the consequence signal, clears the timer. No events, no state publish:
   *  the surface is gone; nothing should hear from the engine again. */
  dispose: () => void;
};

type CreateToggleInteractionEngineArgs<TKind extends string> = {
  /** Bus-adapter sink: mirrors interaction state into an external store (search bus). */
  onInteractionState?: (state: ToggleInteractionState<TKind>) => void;
  onLifecycle?: (event: ToggleLifecycleEvent<TKind>) => void;
  /** Restarting quiet-window length. 0 commits synchronously on begin. */
  settleMs?: number;
  /** T3 floor oracle for awaitVisualFloor interactions: returns true when the surface
   *  is ALREADY at its visual floor (no fade will run, so no ack will arrive — e.g. a
   *  toggle fired while the world is still covered). Checked at every commit gate. */
  isAtVisualFloor?: () => boolean;
  /** Bounded wait past the quiet window for the floor ack before the LOUD fallback
   *  commit. Sized to the canonical fade (~300ms) + stall margin. */
  visualFloorFallbackMs?: number;
};

const TOGGLE_INTENT_PREFIX = 'toggle-intent:';
export const DEFAULT_TOGGLE_SETTLE_MS = 300;
export const DEFAULT_VISUAL_FLOOR_FALLBACK_MS = 900;

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
  isAtVisualFloor,
  visualFloorFallbackMs = DEFAULT_VISUAL_FLOOR_FALLBACK_MS,
}: CreateToggleInteractionEngineArgs<TKind> = {}): ToggleInteractionEngine<TKind> => {
  let interactionSeq = 0;
  let activeKind: TKind | null = null;
  let activeIntentId: string | null = null;
  let activeRunner: ToggleRunner | null = null;
  let awaitingVisualSync = false;
  let settleTimeout: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  // T3 floor gate state (all seq-scoped; reset on begin/cancel/finalize).
  let awaitVisualFloorActive = false;
  let quietWindowElapsed = false;
  let visualFloorAcked = false;
  let visualFloorFallbackTimeout: ReturnType<typeof setTimeout> | null = null;
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

  const clearVisualFloorFallbackTimeout = (): void => {
    if (visualFloorFallbackTimeout != null) {
      clearTimeout(visualFloorFallbackTimeout);
      visualFloorFallbackTimeout = null;
    }
  };

  const resetVisualFloorGate = (): void => {
    clearVisualFloorFallbackTimeout();
    awaitVisualFloorActive = false;
    quietWindowElapsed = false;
    visualFloorAcked = false;
  };

  const finalizeInteraction = (seq: number, awaitedVisualSync: boolean): boolean => {
    if (interactionSeq !== seq) {
      return false;
    }
    clearSettleTimeout();
    resetVisualFloorGate();
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
    resetVisualFloorGate();
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
    clearVisualFloorFallbackTimeout();
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

  // T3: the quiet window elapsed — commit now unless the visual-floor gate holds it.
  // Gated commits fire from notifyVisualFloor (the level trigger) or the LOUD bounded
  // fallback; an already-at-floor surface (isAtVisualFloor oracle) commits immediately
  // since no fade will run and no ack will arrive.
  const handleQuietWindowElapsed = (seq: number, intentId: string): void => {
    if (interactionSeq !== seq) {
      return;
    }
    quietWindowElapsed = true;
    if (!awaitVisualFloorActive || visualFloorAcked || isAtVisualFloor?.() === true) {
      commitActiveInteraction(intentId);
      return;
    }
    clearVisualFloorFallbackTimeout();
    visualFloorFallbackTimeout = setTimeout(() => {
      visualFloorFallbackTimeout = null;
      if (interactionSeq !== seq || activeIntentId !== intentId) {
        return;
      }
      // CONTRACT (expose, never silently hang): the fade-out never acked its floor —
      // the swap will be visible. Commit anyway so the user is never stuck.
      logger.warn('[TOGGLE] visual_floor_ack_timeout', {
        intentId,
        kind: activeKind,
        waitedMs: visualFloorFallbackMs,
      });
      commitActiveInteraction(intentId);
    }, visualFloorFallbackMs);
  };

  const notifyVisualFloor = (): void => {
    if (activeIntentId == null || !awaitVisualFloorActive) {
      return;
    }
    visualFloorAcked = true;
    if (quietWindowElapsed) {
      commitActiveInteraction(activeIntentId);
    }
  };

  const begin = (
    runner: ToggleRunner,
    options: { kind: TKind; awaitVisualFloor?: boolean }
  ): void => {
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
    resetVisualFloorGate();
    awaitVisualFloorActive = options.awaitVisualFloor === true;
    logger.info('[TOGGLE] begin', { seq, intentId, kind });
    onLifecycle?.({ type: 'started', intentId, kind });
    publishState({ kind, pendingPresentationIntentId: intentId });

    if (settleMs <= 0) {
      handleQuietWindowElapsed(seq, intentId);
      return;
    }
    // RESTARTING quiet-window debounce: each begin re-arms the timer, so the heavy
    // commit fires exactly once after the user pauses; the seq guard drops a stale
    // timer if a newer interaction superseded this one before it fired.
    clearSettleTimeout();
    settleTimeout = setTimeout(() => {
      settleTimeout = null;
      handleQuietWindowElapsed(seq, intentId);
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
    notifyVisualFloor,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      interactionSeq += 1;
      clearSettleTimeout();
      resetVisualFloorGate();
      abortController?.abort();
      abortController = null;
      activeKind = null;
      activeIntentId = null;
      activeRunner = null;
      awaitingVisualSync = false;
      listeners.clear();
    },
  };
};
