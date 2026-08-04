import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import {
  SURFACE_BILLING,
  isPaidSurface,
  undeclaredSurfaces,
  type GeminiSurface,
  type GeminiSurfaces,
} from './gemini-billable-surfaces';

/**
 * THE Gemini client. Every surface that COSTS MONEY runs the spend gate before
 * it can be reached, because there is no other way to reach it.
 *
 * WHY THIS REPLACED A TEST (2026-08-02).
 *
 * The gate used to be a call-site convention policed by a source scanner: for
 * each `this.genAI.<paid surface>` the scanner required an
 * `assertSpendBudgetOpen` somewhere in the enclosing method. That is enforcement
 * at the weakest possible level, and it failed exactly as you would expect —
 * the scanner did not strip comments, a COMMENT above the call already
 * contained the string, and the gate on `models.generateContent` (the main
 * generation path) could be replaced with `void 0` while CI stayed green.
 *
 * The scanner existed because the raw SDK client was a field anyone could
 * call. Deleting the field deletes the need for the scanner: a paid call that
 * skips the gate is now unrepresentable rather than audited. The raw client is
 * constructed here and never escapes — no getter, no property, nothing to
 * reach past.
 *
 * PAID vs FREE NO LONGER LIVES HERE. It was a comment plus a habit of writing
 * `await this.gate()`, and it was wrong once — `updateCacheTtl` was filed under
 * FREE while the registry calling it metered every extension as billable
 * storage. A comment cannot be exhaustive and a habit cannot be checked.
 *
 * `gemini-billable-surfaces.ts` now holds the disposition of every surface,
 * derived from the BigQuery billing export rather than from judgment, and this
 * class is bound to it three ways:
 *
 *   - it `implements GeminiSurfaces`, so a declared surface must exist here;
 *   - every paid method calls `this.gatePaid('name')`, which REFUSES if the
 *     declaration disagrees with the call — a method body and its billing
 *     classification cannot drift apart;
 *   - the constructor rejects any method this codebase has not classified,
 *     which is the one direction TypeScript cannot express.
 */
/**
 * Run the spend gate for a surface the declaration says is PAID.
 *
 * A MODULE FUNCTION, NOT A METHOD, and that is load-bearing. TypeScript's
 * `private` is erased at runtime, so a private helper still sits on the
 * prototype — and the constructor's inventory check found exactly that,
 * reporting its own helper as an unclassified surface. Keeping helpers off the
 * prototype makes the prototype EXACTLY the client's surface, which is what
 * gives that check its meaning.
 *
 * Refusing when the declaration disagrees is the point: it makes the
 * classification and the code acting on it one fact. Calling this from a free
 * surface is a bug in one of the two places, and either way the process must
 * not proceed to spend.
 */
async function gatePaid(
  gate: () => Promise<void>,
  surface: GeminiSurface,
): Promise<void> {
  if (!isPaidSurface(surface)) {
    throw new Error(
      `${surface} calls the spend gate but SURFACE_BILLING declares it ` +
        `'${SURFACE_BILLING[surface]}'. One of the two is wrong. Note that ` +
        `gating deleteCache would INCREASE spend — it stops a running ` +
        `storage charge.`,
    );
  }
  await gate();
}

export class GatedGeminiClient implements GeminiSurfaces {
  private readonly raw: GoogleGenAI;

  constructor(
    apiKey: string,
    /**
     * Throws when the spend backstop is closed. Injected rather than imported
     * so this file has no opinion about WHERE the budget lives — only that a
     * paid call cannot happen without asking.
     */
    private readonly gate: () => Promise<void>,
  ) {
    this.raw = new GoogleGenAI({ apiKey });
    // THE DIRECTION TYPES CANNOT COVER. TypeScript will not enumerate a
    // class's own methods and demand each appears in a map, and a new method
    // is exactly how the updateCacheTtl defect arrived. Every process that
    // builds this client runs the check, and an unclassified surface is a
    // boot failure rather than a silent default.
    const undeclared = undeclaredSurfaces(this);
    if (undeclared.length > 0) {
      throw new Error(
        `GatedGeminiClient exposes surface(s) with no billing classification: ` +
          `${undeclared.join(', ')}. Add each to SURFACE_BILLING in ` +
          `gemini-billable-surfaces.ts — check the BigQuery billing export ` +
          `(scripts/gemini-billable-skus.sh) rather than guessing.`,
      );
    }
  }

  // ── PAID ──────────────────────────────────────────────────────────────

  async generateContent(params: unknown): Promise<GenerateContentResponse> {
    await gatePaid(this.gate, 'generateContent');
    return this.raw.models.generateContent(params as never);
  }

  async embedContent(params: unknown): Promise<{
    embeddings?: Array<{ values?: number[] }>;
  }> {
    await gatePaid(this.gate, 'embedContent');
    return this.raw.models.embedContent(params as never) as Promise<{
      embeddings?: Array<{ values?: number[] }>;
    }>;
  }

  async createCache(params: {
    model: string;
    config: { systemInstruction?: unknown; ttl: string };
  }): Promise<{ name?: string; usageMetadata?: { totalTokenCount?: number } }> {
    await gatePaid(this.gate, 'createCache');
    return this.raw.caches.create(params as never);
  }

  /**
   * EXTENDING A CACHE IS BUYING MORE TOKEN-HOURS.
   *
   * This sat under FREE until a red team read the registry that calls it:
   * gemini-context-cache.registry.ts meters every successful extension as a
   * `cachedContentStorage` event with `durationHours`, draining the same
   * gemini.monthlySpend pool a generation call does. Classifying it free was
   * the embeddings defect verbatim — the commit that closed "generation stops
   * while embeddings keep spending" opened "generation stops while cache
   * extensions keep spending" in the same file.
   *
   * The lesson is about the PAID/FREE split itself: it is a claim about
   * Google's billing, and the only honest way to place a method is to find
   * the code that meters it.
   */
  async updateCacheTtl(name: string, ttl: string): Promise<void> {
    await gatePaid(this.gate, 'updateCacheTtl');
    await this.raw.caches.update({ name, config: { ttl } });
  }

  async createBatch(params: unknown): Promise<{ name?: string }> {
    await gatePaid(this.gate, 'createBatch');
    return this.raw.batches.create(params as never) as Promise<{
      name?: string;
    }>;
  }

  // ── FREE (reads and lifecycle; Google does not bill these) ────────────

  async cancelBatch(name: string): Promise<void> {
    await this.raw.batches.cancel({ name });
  }

  getBatch<T>(name: string): Promise<T> {
    return this.raw.batches.get({ name }) as Promise<T>;
  }

  listBatches(pageSize: number): Promise<unknown> {
    return this.raw.batches.list({ config: { pageSize } }) as Promise<unknown>;
  }

  async deleteCache(name: string): Promise<void> {
    await this.raw.caches.delete({ name });
  }
}
