/**
 * THE CONSEQUENCE DECLARATION SEAM (strip engine — plans/toggle-strip-rebuild-ledger.md;
 * charter Part 3).
 *
 * A page DECLARES its strip's consequence class; the strip package wires the pure
 * interaction engine. Pages never construct or touch the engine directly.
 *
 * - `'world'` — the toggle swaps a presented map+sheet world. The commit is gated on
 *   the surface's visual floor: quiet window elapsed AND fade-out acked at ~0
 *   (`awaitVisualFloor` on every begin; the declaration's `floorSignal` feeds both the
 *   already-at-floor oracle and the ack edge). This is exactly the shipped search
 *   wiring, generalized — the search coordinator is the first consumer.
 * - `'content'` — the toggle only re-slices/reorders/switches sheet content (leg 4,
 *   audit D5; the leg-2 RED stub's real implementation). The choreography is
 *   deliberately simple and NEVER touches the map/list coordination machinery:
 *
 *     press-up → `scheduleCommit` → contentPhase flips to 'awaiting' SYNCHRONOUSLY —
 *       the surface's old cards exit NOW (the strip is chrome and stays; the gap
 *       paints the scene's refetch skeleton under the live strip — variant A, the
 *       OA12 law, minted by useContentToggle's `awaitingFace`)
 *     → restarting quiet window (a tap burst re-arms; the runner fires once)
 *     → runner executes (fetch, or a synchronous client re-slice)
 *     → resolution edge (engine finalize/fail/cancel) → contentPhase back to
 *       'settled' — the new cards snap in. A later quick-fade lands on this same
 *       edge if the measured gap warrants it (owner decides from data, not vibes).
 *
 *   `settleMs: 0` degenerates cleanly for synchronous client slices: begin → commit →
 *   runner → finalize run in ONE call stack, so 'awaiting' is set and cleared before
 *   React ever renders — exit and enter collapse into the same frame by construction.
 *
 *   INSTRUMENTED from day one (methodology: composite, RED-provable): every content
 *   interaction logs `[CONTENTTOGGLE] gap` with the press-up→content-ready
 *   distribution inputs (`exitToReadyMs` from the first exit of the burst,
 *   `lastPressToReadyMs` from the last press) plus the outcome edge — a real defect
 *   (slow fetch, dropped landing) shows RED as a large gap or a 'cancelled' outcome.
 */

import { logger } from '../utils';

import {
  createToggleInteractionEngine,
  type ToggleInteractionEngine,
  type ToggleInteractionState,
  type ToggleLifecycleEvent,
  type ToggleRunner,
} from './toggle-interaction-engine';

export type ToggleStripFloorSignal = {
  /** Is the surface ALREADY at its visual floor (no fade will run, no ack will come)? */
  isAtFloor: () => boolean;
  /** Fires on the fade-out-reached-floor edge; returns the unsubscribe. */
  subscribeFloorAck: (listener: () => void) => () => void;
};

export type ToggleStripConsequence = 'world' | 'content';

/**
 * The content choreography's one observable: 'awaiting' = old cards are out and the
 * new slice is not ready yet (the results region paints the primitive's awaiting
 * face — the scene's refetch skeleton under the live strip, OA12);
 * 'settled' = content seated. World seams are always 'settled' (their cover is the
 * presentation fade, not a content gap).
 */
export type ToggleStripContentPhase = 'settled' | 'awaiting';

type CommonDeclaration<TKind extends string> = {
  onInteractionState?: (state: ToggleInteractionState<TKind>) => void;
  onLifecycle?: (event: ToggleLifecycleEvent<TKind>) => void;
  /** Restarting quiet-window length (engine default when omitted; 0 = synchronous). */
  settleMs?: number;
  /** Names the surface in dev logs/barks (e.g. 'results', 'polls-feed'). */
  surfaceName?: string;
};

export type ToggleStripConsequenceDeclaration<TKind extends string> =
  | ({ consequence: 'world'; floorSignal: ToggleStripFloorSignal } & CommonDeclaration<TKind>)
  | ({
      consequence: 'content';
      /**
       * CONTROL/CONTENT COHERENCE ON FAILURE (leg 5 — the leg-4 red-team item; page
       * foundation piece 8, failure): the control flipped OPTIMISTICALLY on press-up,
       * so if the consequence FAILS the old content returns under a lying control
       * ("Results" over Live cards). A content surface whose consequence can fail
       * declares how to snapshot its control store. The seam captures at CREATION and
       * re-captures ONLY on the 'finalized' SUCCESS edge — i.e. the armed thunk always
       * restores the last SETTLED control state (capture-at-press would be too late:
       * the press handler flips the store BEFORE scheduleCommit reaches the seam).
       * The thunk runs on 'failed' and on an explicit seam.cancel(); in both cases the
       * SAME thunk stays armed — the baseline is still the last settled truth. This is
       * what makes the contract honest for ASYNC control stores (React setState): a
       * post-failure re-capture in the failure's own stack would read the failed
       * optimistic values, because an async restore has not applied yet (the G1
       * double-failure bug — second failure "restores" the first failure's values).
       * Capture therefore happens only where the store is settled by construction:
       * creation, and the success edge (an async consequence has re-rendered by the
       * time it resolves). 'cancelled' via seam DISPOSE (surface teardown) does NOT
       * restore — the next present refetches against the live control values. The
       * restore implementation must not re-enter the press edge (suppress its own
       * control-change listeners). Surfaces whose slices are synchronous client
       * re-slices (lists) cannot fail and declare nothing.
       */
      captureControlBaseline?: () => () => void;
    } & CommonDeclaration<TKind>);

export type ToggleStripConsequenceSeam<TKind extends string> = {
  scheduleCommit: (runner: ToggleRunner, options: { kind: TKind }) => void;
  /** Abandon the in-flight interaction. Content class: the old content stays, so the
   *  seam ALSO restores the control to the last settled baseline (when declared) —
   *  an explicit cancel must not leave a flipped control over unswapped cards. Seam
   *  dispose does NOT restore (teardown is not a failure). */
  cancel: () => void;
  notifyIntentComplete: (intentId: string) => void;
  getState: () => ToggleInteractionState<TKind>;
  subscribe: (listener: () => void) => () => void;
  /** 'awaiting' while old content is out and the new slice is not ready (content only). */
  getContentPhase: () => ToggleStripContentPhase;
  subscribeContentPhase: (listener: () => void) => () => void;
  /** Full teardown: unsubscribes the floor signal and disposes the engine. */
  dispose: () => void;
};

export const createToggleStripConsequenceSeam = <TKind extends string>(
  declaration: ToggleStripConsequenceDeclaration<TKind>
): ToggleStripConsequenceSeam<TKind> => {
  const isWorld = declaration.consequence === 'world';
  const surfaceName = declaration.surfaceName ?? 'unnamed';

  // ── Content phase (the D5 choreography state) ────────────────────────────────────
  let contentPhase: ToggleStripContentPhase = 'settled';
  const contentPhaseListeners = new Set<() => void>();
  // Gap instrumentation (press-up → content-ready), reset per interaction burst.
  let burstExitAtMs: number | null = null;
  let burstLastPressAtMs: number | null = null;
  let burstCommitCount = 0;
  // Restore thunk for the last SETTLED control state — captured at creation,
  // re-captured on the 'finalized' SUCCESS edge only (settled truth by construction;
  // see the declaration doc), fired on 'failed' and on explicit cancel.
  const captureControlBaseline =
    declaration.consequence === 'content' ? declaration.captureControlBaseline : undefined;
  let restoreControlBaseline: (() => void) | null = captureControlBaseline?.() ?? null;
  // A 'failed' engine edge finalizes in the SAME stack ('failed' → 'finalized' echo,
  // failInteraction → finalizeInteraction). The echo must not re-capture: an async
  // (React setState) restore has not applied yet, so the capture would snapshot the
  // FAILED optimistic values as "settled" (G1).
  let suppressFinalizedEchoRecapture = false;
  // dispose() settles through the same path as an explicit cancel but must NOT
  // restore — teardown is not a failure (the next present refetches).
  let disposing = false;

  const publishContentPhase = (next: ToggleStripContentPhase): void => {
    if (contentPhase === next) {
      return;
    }
    contentPhase = next;
    contentPhaseListeners.forEach((listener) => listener());
  };

  const settleContent = (
    outcome: 'finalized' | 'failed' | 'cancelled',
    kind: TKind | string
  ): void => {
    if (isWorld) {
      return;
    }
    const nowMs = Date.now();
    if (burstExitAtMs != null) {
      // THE MEASUREMENT the owner's transition decision rides on (charter Part 3:
      // observe the real gap, then choose). Dev log; RED = large gaps / non-finalized
      // outcomes on surfaces that should be instant.
      logger.info('[CONTENTTOGGLE] gap', {
        surface: surfaceName,
        kind,
        outcome,
        exitToReadyMs: nowMs - burstExitAtMs,
        lastPressToReadyMs: burstLastPressAtMs != null ? nowMs - burstLastPressAtMs : null,
        commits: burstCommitCount,
      });
    }
    burstExitAtMs = null;
    burstLastPressAtMs = null;
    burstCommitCount = 0;
    if (outcome === 'failed') {
      if (restoreControlBaseline != null) {
        // The consequence did not land: snap the optimistic control back to the last
        // settled snapshot so control and content stay coherent. The thunk stays
        // armed — its snapshot is STILL the last settled truth, and re-capturing here
        // would read a maybe-not-yet-restored (async setState) store (G1).
        logger.warn('[CONTENTTOGGLE] control reverted on failure', {
          surface: surfaceName,
          kind,
        });
        restoreControlBaseline();
      }
      // The engine's failed→finalized echo lands in this same stack; it must not
      // roll the baseline forward off unsettled values.
      suppressFinalizedEchoRecapture = true;
    } else if (outcome === 'finalized') {
      if (suppressFinalizedEchoRecapture) {
        suppressFinalizedEchoRecapture = false;
      } else {
        // THE SUCCESS EDGE is the one place the store is settled by construction
        // (an async consequence has rendered its committed control values by the
        // time it resolves): roll the baseline forward to them.
        restoreControlBaseline = captureControlBaseline?.() ?? null;
      }
    } else if (!disposing && restoreControlBaseline != null) {
      // Explicit seam.cancel() mid-awaiting: the old content stays, so the control
      // must return to it — same honesty as the failed edge (G5). Dispose skips
      // this: teardown is not a failure.
      logger.warn('[CONTENTTOGGLE] control reverted on cancel', {
        surface: surfaceName,
        kind,
      });
      restoreControlBaseline();
    }
    publishContentPhase('settled');
  };

  // The seam observes the engine's lifecycle for the resolution edge, then forwards
  // to the declaration's own listener (compose, never replace).
  const handleLifecycle = (event: ToggleLifecycleEvent<TKind>): void => {
    if (event.type === 'finalized' || event.type === 'failed' || event.type === 'cancelled') {
      settleContent(event.type === 'finalized' ? 'finalized' : event.type, event.kind);
    }
    declaration.onLifecycle?.(event);
  };

  const engine: ToggleInteractionEngine<TKind> = createToggleInteractionEngine<TKind>({
    onInteractionState: declaration.onInteractionState,
    onLifecycle: handleLifecycle,
    ...(declaration.settleMs != null ? { settleMs: declaration.settleMs } : {}),
    ...(isWorld ? { isAtVisualFloor: declaration.floorSignal.isAtFloor } : {}),
  });

  // World: the floor-ack edge releases a gated commit the instant the fade-out
  // bottoms out. The seam owns the subscription for the engine's whole life.
  const unsubscribeFloor = isWorld
    ? declaration.floorSignal.subscribeFloorAck(() => engine.notifyVisualFloor())
    : null;

  const scheduleCommit = (runner: ToggleRunner, options: { kind: TKind }): void => {
    if (!isWorld) {
      // PRESS-UP EXIT: the phase flips before the engine even begins, in the caller's
      // own stack — the surface that reads it re-renders in the same React batch as
      // the control's optimistic flip. Old cards exit NOW.
      const nowMs = Date.now();
      if (burstExitAtMs == null) {
        burstExitAtMs = nowMs;
      }
      burstLastPressAtMs = nowMs;
      burstCommitCount += 1;
      publishContentPhase('awaiting');
    }
    engine.begin(runner, { kind: options.kind, awaitVisualFloor: isWorld });
  };

  return {
    scheduleCommit,
    cancel: engine.cancel,
    notifyIntentComplete: engine.notifyIntentComplete,
    getState: engine.getState,
    subscribe: engine.subscribe,
    getContentPhase: () => contentPhase,
    subscribeContentPhase: (listener) => {
      contentPhaseListeners.add(listener);
      return () => {
        contentPhaseListeners.delete(listener);
      };
    },
    dispose: () => {
      unsubscribeFloor?.();
      logger.debug('[ToggleStrip] consequence seam disposed', { surface: surfaceName });
      // Engine dispose is QUIET (no lifecycle events), so settle the phase directly —
      // a disposed seam must never leave a surface stuck rendering the awaiting gap.
      // `disposing` keeps the cancel-edge restore OUT of teardown (not a failure).
      disposing = true;
      settleContent('cancelled', engine.getState().kind ?? 'disposed');
      engine.dispose();
    },
  };
};
