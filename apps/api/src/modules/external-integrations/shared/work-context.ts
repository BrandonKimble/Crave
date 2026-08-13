import { AsyncLocalStorage } from 'async_hooks';

/**
 * AMBIENT WORK CONTEXT — "what funded this unit of work?"
 *
 * Why (final red team D4): the spend campaign's envelope is sized on the
 * FULL manifest (extraction + interactive + embedding + places) but
 * `campaignId` was hand-threaded into exactly ONE ledger call, so only the
 * batch line was ever metered. Measured on the Austin manifest that is
 * $5.69 of $82.17 — about 7%. Everything the re-extraction triggers
 * downstream of batch ingest (entity resolution, name embeddings, attribute
 * placement, cuisine extraction) carried no campaign, so a resolver-heavy
 * candidate prompt could overrun the approved estimate by multiples and the
 * campaign would still read `spent << envelope`, never breaching, never
 * stopping.
 *
 * Threading the id through every call site is the same losing game the
 * gateway and the prompt registry already retired: N places each remembering
 * a shared truth, one forgetting. So the attribution becomes AMBIENT —
 * established once at the entry point that knows the answer, read by the
 * ledger without any call site participating.
 *
 * Deliberately NOT a Nest provider: it must be readable from static/util
 * code and from inside callbacks that never received an injector.
 */
export interface WorkContext {
  /** The owner-approved spend campaign funding this work, if any. */
  campaignId?: string;
  /** Human label for logs/diagnostics (e.g. 'reextract:austinfood:v7'). */
  label?: string;
  /** WHY the spend happens, when the caller name alone can't say — the
   *  honest-denominator dimension. Places uses three, and they are three
   *  because they are three different SKUs/causes, not three names for one:
   *  'grounding.new' (first grounding of a restaurant, full mask),
   *  'grounding.refresh' (lean-mask volatility re-poll) and
   *  'grounding.expansion' (secondary-location expansion, full mask over an
   *  already-grounded place). Written to api_usage_ledger.attribution so rate
   *  derivation can slice by cause instead of dividing everything by one
   *  denominator (the 51%-contaminated-Places-rate lesson). */
  attribution?: string;
}

const storage = new AsyncLocalStorage<WorkContext>();

/** Run `fn` with every vendor call underneath attributed to this context.
 *  AsyncLocalStorage propagates across awaits within the execution, so a
 *  single wrap at the entry point covers the whole downstream tree. */
export function runInWorkContext<T>(context: WorkContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentWorkContext(): WorkContext | undefined {
  return storage.getStore();
}

/** The campaign funding the current work, if any. The usage ledger uses
 *  this as the fallback when an event does not carry one explicitly, so
 *  explicit attribution still wins and nothing existing changes meaning. */
export function currentCampaignId(): string | undefined {
  return storage.getStore()?.campaignId;
}

/** The spend-cause attribution of the current work, if any. */
export function currentAttribution(): string | undefined {
  return storage.getStore()?.attribution;
}

/**
 * THE BOUNDARY-CROSSING CONVENTION (2026-08-12). AsyncLocalStorage dies at
 * every durable/async boundary — a BullMQ enqueue, a batch job's
 * resumeContext, any payload another process will pick up. Code that crosses
 * one captures `snapshotWorkContext()` INTO THE PAYLOAD and the far side
 * re-establishes it with `runInWorkContext(payload.workContext, ...)`.
 * A snapshot is a defensive COPY: the ambient store object is shared by the
 * whole execution tree, and a payload holding a live reference would see
 * (or cause) later mutation. Reading fields piecemeal
 * (`{ campaignId: currentCampaignId() }`) drops the label and the
 * attribution — use the snapshot. Enforced by the
 * `campaign.attribution-crosses-every-queue-boundary` invariant
 * (scripts/check-workcontext-boundaries.mjs).
 */
export function snapshotWorkContext(): WorkContext | undefined {
  const context = storage.getStore();
  return context ? { ...context } : undefined;
}
