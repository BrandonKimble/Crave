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
 *       the surface's old cards exit NOW (the strip is chrome and stays; the gap is
 *       bare white under the strip — NO skeleton between slices, the law)
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
 * new slice is not ready yet (body renders NOTHING — bare white under the strip);
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
       * re-captures after every settle — i.e. the armed thunk always restores the
       * last SETTLED control state (capture-at-press would be too late: the press
       * handler flips the store BEFORE scheduleCommit reaches the seam). The thunk
       * runs on the engine's 'failed' edge only. 'finalized' rolls the baseline
       * forward to the committed values; 'cancelled' (= seam dispose, surface
       * teardown) does NOT restore — the next present refetches against the live
       * control values. The restore implementation must not re-enter the press edge
       * (suppress its own control-change listeners). Surfaces whose slices are
       * synchronous client re-slices (bookmarks) cannot fail and declare nothing.
       */
      captureControlBaseline?: () => () => void;
    } & CommonDeclaration<TKind>);

export type ToggleStripConsequenceSeam<TKind extends string> = {
  scheduleCommit: (runner: ToggleRunner, options: { kind: TKind }) => void;
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
  // re-captured after every settle, fired on the 'failed' edge only.
  const captureControlBaseline =
    declaration.consequence === 'content' ? declaration.captureControlBaseline : undefined;
  let restoreControlBaseline: (() => void) | null = captureControlBaseline?.() ?? null;

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
    const restore = restoreControlBaseline;
    restoreControlBaseline = null;
    if (outcome === 'failed' && restore != null) {
      // The consequence did not land: snap the optimistic control back to the last
      // settled snapshot so control and content stay coherent. Cleared BEFORE the
      // call so the engine's failed→finalized echo is inert.
      logger.warn('[CONTENTTOGGLE] control reverted on failure', { surface: surfaceName, kind });
      restore();
    }
    // Roll the baseline forward: after a finalized settle this captures the committed
    // control values; after a failed settle the store is back at the old baseline.
    restoreControlBaseline = captureControlBaseline?.() ?? null;
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
      settleContent('cancelled', engine.getState().kind ?? 'disposed');
      engine.dispose();
    },
  };
};
