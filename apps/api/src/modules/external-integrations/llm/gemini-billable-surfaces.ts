/**
 * WHICH GEMINI SURFACES COST MONEY — derived from the BILL, not from judgment.
 *
 * This file exists because the PAID/FREE split was an unverified claim, and it
 * was wrong once: `updateCacheTtl` sat under FREE while the registry that calls
 * it metered every extension as billable storage. The commit that fixed it
 * still rested on someone reading the right file at the right moment.
 *
 * So the split was re-derived from the only authority that settles it: the
 * BigQuery billing export (`scripts/gemini-billable-skus.sh` re-runs the
 * query). Every Gemini SKU Google has ever charged us for falls into exactly
 * four families:
 *
 *   generate_content input/output token count      (interactive AND batch)
 *   generate_content cached input token count      (a cached READ discount)
 *   generate_content cached content STORAGE        token-hours — $65.30 to date
 *   EmbedContent input token count
 *
 * Two consequences follow, and neither is obvious from the SDK's shape:
 *
 * 1. There is NO SKU for a control-plane read. Getting, listing or cancelling a
 *    batch, and deleting a cache, are billed at zero — not "cheaply", but
 *    absent from the bill entirely. Their placement under FREE is now an
 *    observation.
 *
 * 2. `deleteCache` MUST NEVER BE GATED. Cache storage bills per token-hour for
 *    as long as the cache lives, so deleting one STOPS a running charge. A
 *    future author "tightening" this client by gating every method would make a
 *    closed budget keep paying storage it can no longer stop — the gate would
 *    increase spend. That is why its disposition is spelled out rather than
 *    merely omitted.
 */

/**
 * `free-and-must-stay-free` is not decoration: it marks a surface where adding
 * a gate would COST money rather than save it.
 */
export type SurfaceBilling = 'paid' | 'free' | 'free-and-must-stay-free';

/**
 * THE declaration. Exhaustive in both directions by construction: a surface
 * missing an entry fails to compile against `GeminiSurfaces`, an entry with no
 * surface fails the same way, and a method added to the client without
 * appearing here fails the constructor's inventory check at boot.
 */
export const SURFACE_BILLING = {
  // Billed as generate_content input/output tokens.
  generateContent: 'paid',
  // Billed as EmbedContent input tokens. This one was ungated for a while:
  // the backstop fired, generation stopped, and embeddings kept spending.
  embedContent: 'paid',
  // Starts a cached-content STORAGE charge (token-hours).
  createCache: 'paid',
  // EXTENDS that storage charge. Was classified free; it is not.
  updateCacheTtl: 'paid',
  // A batch's tokens are billed on the same generate_content SKUs with a
  // `batch` suffix, so submitting is the act that incurs them.
  createBatch: 'paid',
  // No SKU exists for these.
  getBatch: 'free',
  listBatches: 'free',
  cancelBatch: 'free',
  // See (2) above — gating this would increase spend.
  deleteCache: 'free-and-must-stay-free',
} as const satisfies Record<string, SurfaceBilling>;

export type GeminiSurface = keyof typeof SURFACE_BILLING;

/**
 * The shape the client must implement. A name in SURFACE_BILLING with no
 * method here is a compile error.
 */
export type GeminiSurfaces = {
  [K in GeminiSurface]: (...args: never[]) => unknown;
};

export function isPaidSurface(surface: GeminiSurface): boolean {
  return SURFACE_BILLING[surface] === 'paid';
}

/**
 * Names on the client's prototype that SURFACE_BILLING does not know about.
 *
 * This is the direction the type system cannot cover: TypeScript will not
 * enumerate a class's methods to demand they appear in a map. A new method is
 * exactly how the original defect arrived, so it is checked at construction —
 * every process that builds the client runs it, and it throws.
 */
export function undeclaredSurfaces(client: object): string[] {
  const prototype = Object.getPrototypeOf(client) as object;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .filter((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return typeof descriptor?.value === 'function';
    })
    .filter((name) => !(name in SURFACE_BILLING))
    .sort();
}
