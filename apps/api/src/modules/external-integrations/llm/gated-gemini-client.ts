import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

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
 * PAID vs FREE is the load-bearing distinction, so it is stated once, here.
 * Paid: generation, embeddings, context-cache mints AND TTL extensions (both
 * billed in token-hours), and batch submission. Free: reads and terminal
 * lifecycle — get, list, cancel, delete.
 *
 * Placing a method in the free group is a claim about Google's billing, and
 * the only honest way to make it is to find the code that meters the call.
 * `updateCacheTtl` was in the free group until someone did exactly that.
 */
export class GatedGeminiClient {
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
  }

  // ── PAID ──────────────────────────────────────────────────────────────

  async generateContent(params: unknown): Promise<GenerateContentResponse> {
    await this.gate();
    return this.raw.models.generateContent(params as never);
  }

  async embedContent(params: unknown): Promise<{
    embeddings?: Array<{ values?: number[] }>;
  }> {
    await this.gate();
    return this.raw.models.embedContent(params as never) as Promise<{
      embeddings?: Array<{ values?: number[] }>;
    }>;
  }

  async createCache(params: {
    model: string;
    config: { systemInstruction?: unknown; ttl: string };
  }): Promise<{ name?: string; usageMetadata?: { totalTokenCount?: number } }> {
    await this.gate();
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
    await this.gate();
    await this.raw.caches.update({ name, config: { ttl } });
  }

  async createBatch(params: unknown): Promise<{ name?: string }> {
    await this.gate();
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
