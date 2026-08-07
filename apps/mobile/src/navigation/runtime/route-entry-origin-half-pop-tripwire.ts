/**
 * THE HALF-POP TRIPWIRE (D56 / F1505 / F1516(C) / F5417).
 *
 * The defect it exists to catch, verbatim from the saga that produced it: a pop that
 * restored the SHEET but left the MAP wherever the dismissed world's fitAll put it. The
 * detection rule was always stated correctly — "a `pop` with no matching restore" — but it
 * was stated to a HUMAN reading a JSONL trace, and that trace emitted through
 * `logCameraOriginDebug`, gated on `CAMORIGIN_DEBUG_ENABLED = false`. So the instrument
 * that exists because "an instrument that cannot fire is an always-green lie" could not
 * fire in any build.
 *
 * F5417's ruling: a correctness TRIPWIRE and a narrative TRACE are different populations.
 * The trace is noise you flip on while debugging the camera lane and keeps its flag. The
 * tripwire is a correctness assertion that must be live WHENEVER THE DEFECT CAN OCCUR, so
 * it emits the way this territory's other tripwires emit — an ungated `__DEV__`
 * `console.error`, the `[ORIGIN-CONTRACT]` shape (route-entry-origin-capture-delegate.ts,
 * app-overlay-route-stack-algebra.ts). No debug flag stands between the defect and the bark.
 *
 * THE MECHANISM is a single pending slot, not a log line:
 *   • a pop verb ARMS it, and only when the popped entry actually carries an origin (the
 *     root entry departed nothing and the stack-at-root pop has nothing above it — those
 *     are STATES, and a tripwire that barks on a state is the always-red twin of the
 *     always-green lie);
 *   • the RESTORE leg — the registered origin restorer, at the point it commits the
 *     camera — DISARMS it;
 *   • the pop verb then ASSERTS the slot is clear before it returns.
 * So the slot spans the whole seam: it survives if the staging call is missing, if no
 * restorer is registered, or if a future restorer returns before the camera commit. Any of
 * those is the half-pop.
 *
 * PROVING MUTATION (route-entry-origin-half-pop-tripwire.spec.ts runs it): delete the
 * `stageRouteEntryOriginRestore` call from a pop verb and an ordinary dismiss barks. Before
 * F5417 that mutation was silent in every build.
 */

type PendingOriginPop = {
  verb: string;
  targetKey: string | null;
};

let pendingOriginPop: PendingOriginPop | null = null;

/** A pop verb that staged a real origin. Cleared by the restore leg; asserted on return. */
export const armOriginRestoreTripwire = (verb: string, targetKey: string | null): void => {
  pendingOriginPop = { verb, targetKey };
};

/** The restore leg reached its camera commit — the two halves of the pop met. */
export const disarmOriginRestoreTripwire = (): void => {
  pendingOriginPop = null;
};

/**
 * Fired by the pop verb once its staging call has returned. A surviving slot means the pop
 * happened and the restore did not.
 */
export const assertOriginRestoreCommitted = (): void => {
  const pending = pendingOriginPop;
  if (pending == null) {
    return;
  }
  pendingOriginPop = null;
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(
      `[ORIGIN-CONTRACT] HALF-POP — '${pending.verb}' popped to '${String(pending.targetKey)}' ` +
        `with an origin staged, but no origin restore committed: the sheet returns and the map ` +
        `stays where the dismissed world left it (F1505)`
    );
  }
};
