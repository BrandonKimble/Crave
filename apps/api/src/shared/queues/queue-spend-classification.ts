/**
 * THE QUEUE SPEND CLASSIFICATION — one place that answers "does draining this
 * queue cost money?" for every Bull queue in the codebase.
 *
 * WHY THIS EXISTS (ledger 12d, a real $25 incident). A freshly booted worker
 * found a FOSSIL Redis backlog — ~1,100 grounding/cuisine jobs enqueued by a
 * process that had long since died — and drained it, spending ~880 Google
 * Places calls on work nobody had asked for that day.
 * `DISABLE_RESTAURANT_ENRICHMENT` gated new SCHEDULING and nothing else: the
 * flag stops the tap, it does not empty the bucket. A queue that already
 * holds a thousand jobs is a thousand vendor calls waiting for any worker
 * that happens to connect.
 *
 * The guard that prevents a repeat (worker-boot-spend-guard.ts) has to know
 * WHICH queues spend. Deriving that at a distance — "restaurant-ish names
 * spend" — is exactly the heuristic that rots the first time someone adds a
 * queue. So the classification is DATA, exhaustive, with the vendor named
 * per entry, and `queue-spend-classification.spec.ts` scans the source for
 * every `BullModule.registerQueue` and every `@Processor` and FAILS if a
 * queue name exists that this file does not classify. A new queue cannot be
 * added without answering the money question.
 *
 * NOTE ON `spend: 'none'`: it means "draining this queue calls no metered
 * vendor". Reddit's API is rate-limited but not billed, and the archive
 * lanes read files we already hold. Those queues drain freely at boot — a
 * fossil backlog there costs latency, never dollars, and freezing collection
 * on every redeploy would be a worse product than the problem it solves.
 */

export type QueueSpendClass =
  /** Draining a job calls a METERED vendor. Boot must not drain a fossil
   *  backlog of these without a human saying so. */
  | 'vendor-spend'
  /** Draining a job calls no metered vendor. Drains normally at boot. */
  | 'none';

export interface QueueSpendClassification {
  readonly spend: QueueSpendClass;
  /** The metered vendor(s) a job hits, or why nothing is metered. Prose, so
   *  the classification survives review without opening the worker. */
  readonly why: string;
}

/**
 * EVERY Bull queue this codebase registers, keyed by the exact queue name
 * passed to `BullModule.registerQueue` / `@Processor`.
 */
export const QUEUE_SPEND_CLASSIFICATION: Readonly<
  Record<string, QueueSpendClassification>
> = Object.freeze({
  // ── restaurant-enrichment ────────────────────────────────────────────────
  'restaurant-primary-enrichment': {
    spend: 'vendor-spend',
    why: 'Google Places identity + details per job (~$0.045 per newly grounded location). THE queue from the incident.',
  },
  'restaurant-secondary-location-expansion': {
    spend: 'vendor-spend',
    why: 'Google Places findPlaceFromText paging + details per job — the grounding-expansion lane, billed per page.',
  },
  'restaurant-cuisine-extraction': {
    spend: 'vendor-spend',
    why: 'Gemini call per restaurant to extract cuisine — metered LLM tokens.',
  },

  // ── attribute-ontology ───────────────────────────────────────────────────
  'attribute-ontology-adjudication': {
    spend: 'vendor-spend',
    why: 'Gemini adjudication of pending attributes — metered LLM tokens, sized by however many pending rows collection minted.',
  },

  // ── reddit-collector ─────────────────────────────────────────────────────
  'chronological-batch-processing-queue': {
    spend: 'vendor-spend',
    why: 'RedditBatchProcessingService runs LLM extraction over each batch — metered Gemini tokens per post.',
  },
  'keyword-batch-processing-queue': {
    spend: 'vendor-spend',
    why: 'RedditBatchProcessingService runs LLM extraction over each batch — metered Gemini tokens per post.',
  },
  'archive-batch-processing-queue': {
    spend: 'vendor-spend',
    why: 'RedditBatchProcessingService runs LLM extraction over each archived post — metered Gemini tokens.',
  },
  'chronological-collection': {
    spend: 'none',
    why: 'Reddit API reads only (rate-limited, not billed). It ENQUEUES batch jobs, and that spend-bearing queue is guarded on its own terms.',
  },
  'keyword-search-execution': {
    spend: 'none',
    why: 'Reddit search API reads only (rate-limited, not billed); the LLM cost lands on keyword-batch-processing-queue.',
  },
  'archive-collection': {
    spend: 'none',
    why: 'Reads archive dumps we already hold and fans out batch jobs; no metered vendor call of its own.',
  },
});

/** The queues a boot-time drain would charge us for. */
export const SPEND_BEARING_QUEUE_NAMES: readonly string[] = Object.freeze(
  Object.entries(QUEUE_SPEND_CLASSIFICATION)
    .filter(([, entry]) => entry.spend === 'vendor-spend')
    .map(([name]) => name)
    .sort(),
);

export const isSpendBearingQueue = (queueName: string): boolean =>
  QUEUE_SPEND_CLASSIFICATION[queueName]?.spend === 'vendor-spend';
