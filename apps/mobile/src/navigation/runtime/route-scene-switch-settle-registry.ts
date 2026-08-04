/**
 * The scene-switch SETTLE CONTINUATION registry (F1350).
 *
 * A caller that says "close the active route and then do X" hands X in as an
 * `onSettle`. The old shape stored those continuations in a
 * `Map<transitionToken, Set<callback>>` and only ever flushed the CURRENT token —
 * so a switch that was SUPERSEDED before it settled did two wrong things at once:
 *
 *   1. the caller's continuation NEVER RAN (a silent dropped promise — the
 *      global-restaurant draft, for one, simply never got cleared), and
 *   2. its Map entry was never dropped, so the Map grew one dead `Set` per
 *      superseded switch for the whole process lifetime. Only `dispose()`
 *      cleared it. That was the territory's one unbounded-lifetime leak.
 *
 * Two structural corrections, both encoded here rather than remembered:
 *
 * - **A continuation always reaches its caller**, with a VERDICT saying which
 *   ending it got: `'settled'` (the switch completed) or `'superseded'` (a newer
 *   switch replaced it before it could settle). "Never fires" is no longer one of
 *   the outcomes.
 * - **At most one pending set can exist at a time**, and that is now
 *   UNREPRESENTABLE rather than merely true: the registry holds a SINGLE SLOT,
 *   not a map. A monotone counter is an unbounded key space; the state it was
 *   keying has exactly one live occupant, because registration only ever happens
 *   immediately after a commit and every commit supersedes its predecessor.
 *   A single slot is a stronger bound than any closed key vocabulary — it caps
 *   the residency at one, not at the size of the vocabulary.
 *
 * Deliberately dependency-free (no react-native, no reanimated) so the rule is
 * provable in the hermetic jest lane — see route-scene-switch-settle-registry.spec.ts,
 * whose replayed-supersede case is the RED recipe for both corrections.
 */

export type RouteSceneSwitchSettleVerdict = 'settled' | 'superseded';

export type RouteSceneSwitchSettleCallback = (verdict: RouteSceneSwitchSettleVerdict) => void;

type PendingSettleSlot = {
  transitionToken: number;
  callbacks: Set<RouteSceneSwitchSettleCallback>;
};

export class RouteSceneSwitchSettleCallbackRegistry {
  private pending: PendingSettleSlot | null = null;

  /**
   * The token whose continuations are currently waiting, or null. Exposed so the
   * boundedness rule ("never more than one pending set") is assertable from a test
   * rather than argued from the shape of the field.
   */
  public get pendingTransitionToken(): number | null {
    return this.pending?.transitionToken ?? null;
  }

  public get pendingCallbackCount(): number {
    return this.pending?.callbacks.size ?? 0;
  }

  /**
   * A new switch has committed under `nextTransitionToken`. Anything still waiting
   * on an OLDER token can no longer settle, so it is drained NOW with the
   * `'superseded'` verdict. Called from every commit path — including the ones that
   * carry no continuation of their own, which is exactly the case the old code
   * leaked on.
   */
  public supersedeFor(nextTransitionToken: number): void {
    const superseded = this.pending;
    if (!superseded || superseded.transitionToken === nextTransitionToken) {
      return;
    }
    this.pending = null;
    superseded.callbacks.forEach((callback) => {
      callback('superseded');
    });
  }

  public register(transitionToken: number, onSettle: RouteSceneSwitchSettleCallback): void {
    // Registration for a different token than the one waiting means the waiter was
    // superseded without a commit-side drain; give it its verdict rather than
    // silently overwriting the slot.
    this.supersedeFor(transitionToken);
    const slot: PendingSettleSlot = this.pending ?? { transitionToken, callbacks: new Set() };
    slot.callbacks.add(onSettle);
    this.pending = slot;
  }

  /** The switch under `transitionToken` reached its settle boundary. */
  public flush(transitionToken: number): void {
    const settled = this.pending;
    if (!settled || settled.transitionToken !== transitionToken) {
      return;
    }
    this.pending = null;
    settled.callbacks.forEach((callback) => {
      callback('settled');
    });
  }

  /**
   * Teardown. Continuations are DROPPED, not fired: `dispose()` tears the runtime
   * down underneath them, and running a continuation into a disposed controller is
   * a worse failure than not running it. This is the one place "never fires" is
   * still the answer, and it is stated.
   */
  public abandon(): void {
    this.pending = null;
  }
}
