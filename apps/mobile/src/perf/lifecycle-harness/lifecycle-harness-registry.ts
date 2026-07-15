/**
 * Lifecycle-harness verb registry — the bidirectional command bus the testing
 * methodology calls for (CLAUDE.md: "bidirectional command bus (ack + state
 * snapshot)"). Phase-3 charter Leg 1 (plans/search-lifecycle-phase3-charter.md).
 *
 * Shape: ONE generic verb map + ONE ack channel, deliberately NOT the
 * per-verb-field pattern of perf-scenario-command-registry — adding a verb is a
 * `registerLifecycleHarnessVerb` call at the owning runtime, zero coordinator
 * edits (the type-list-disease guard).
 *
 * Ack transport: correlation-ID single-line JSON on Metro stdout
 * (`[HARNESS-ACK] {...}`) — the repo's proven out-of-band channel (deep links
 * are one-way). Every invocation acks: ok:false with a reason is still an ack;
 * a silent no-op cannot pass.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type LifecycleHarnessVerbHandler = (
  payload: Record<string, unknown>
) => JsonValue | Promise<JsonValue>;

const verbRegistry = new Map<string, LifecycleHarnessVerbHandler>();

export const registerLifecycleHarnessVerb = (
  verb: string,
  handler: LifecycleHarnessVerbHandler
): (() => void) => {
  if (__DEV__ && verbRegistry.has(verb)) {
    // eslint-disable-next-line no-console
    console.warn(`[HARNESS] verb '${verb}' re-registered — last writer wins`);
  }
  verbRegistry.set(verb, handler);
  return () => {
    if (verbRegistry.get(verb) === handler) {
      verbRegistry.delete(verb);
    }
  };
};

export const emitLifecycleHarnessAck = (ack: {
  id: string;
  verb: string;
  ok: boolean;
  reason?: string;
  state?: JsonValue;
}): void => {
  // Single line, stable prefix — the outer script greps /tmp/crave-metro.log for
  // `[HARNESS-ACK]` + the correlation id.
  // eslint-disable-next-line no-console
  console.log(`[HARNESS-ACK] ${JSON.stringify(ack)}`);
};

export const invokeLifecycleHarnessVerb = async (args: {
  id: string;
  verb: string;
  payload: Record<string, unknown>;
}): Promise<void> => {
  const handler = verbRegistry.get(args.verb);
  if (!handler) {
    emitLifecycleHarnessAck({
      id: args.id,
      verb: args.verb,
      ok: false,
      reason: `verb_not_registered (registered: ${[...verbRegistry.keys()].join(',') || 'none'})`,
    });
    return;
  }
  try {
    const state = await handler(args.payload);
    emitLifecycleHarnessAck({ id: args.id, verb: args.verb, ok: true, state });
  } catch (error) {
    emitLifecycleHarnessAck({
      id: args.id,
      verb: args.verb,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};

export const listLifecycleHarnessVerbs = (): string[] => [...verbRegistry.keys()];
