import {
  resolveGenerationConfig,
  type GeminiGenerationConfig,
} from './gemini-generation-config';

/**
 * COST-BUG REGRESSION (2026-07-27, hardened 2026-07-28, repointed 2026-08-06).
 *
 * These assertions used to run against a hand-copied twin of the merge
 * declared in this file, so reverting production to the original bug left
 * all 196 tests in the module green (F4926). `resolveGenerationConfig` is
 * now imported from production and is the subject under test.
 *
 * `callLLMApi` used to resolve its config as `options.generationConfig ??
 * defaultGenerationConfig`, so any caller supplying its own config silently
 * LOST the computed thinkingConfig — and Gemini 3 thinks HIGH when no level
 * is sent. Measured: entity-resolution.match_batch averaged 5,694 output
 * tokens/call vs 48 for the same judgment through the path that set it
 * correctly, making resolution 64% of replay spend.
 *
 * The first fix special-cased ONE key and left the CLASS alive. These specs
 * now pin the general property — no computed universal default can be lost
 * by any caller, for any key — plus the boundary that keeps it safe: the
 * COLLECTION-specific response schema must NOT leak onto callers that bring
 * their own config, or every unrelated prompt inherits the extraction shape.
 */
describe('callLLMApi generationConfig merge', () => {
  const thinking = { thinkingLevel: 'MINIMAL' };
  const universal: GeminiGenerationConfig = {
    temperature: 0.1,
    topP: 0.5,
    maxOutputTokens: 65536,
    thinkingConfig: thinking,
  };
  const collection: GeminiGenerationConfig = {
    ...universal,
    responseMimeType: 'application/json',
    responseJsonSchema: { collection: true },
  };

  it('injects the computed thinking config into a caller-supplied config', () => {
    const merged = resolveGenerationConfig(
      { temperature: 0, responseJsonSchema: { mine: true } },
      universal,
      collection,
    );
    expect(merged.thinkingConfig).toEqual(thinking);
    expect(merged.temperature).toBe(0);
  });

  it('preserves EVERY universal default, not just thinking (the class, not the key)', () => {
    const merged = resolveGenerationConfig(
      { temperature: 0 },
      universal,
      collection,
    );
    expect(merged.topP).toBe(0.5);
    expect(merged.maxOutputTokens).toBe(65536);
    expect(merged.thinkingConfig).toEqual(thinking);
  });

  it('lets a caller DELIBERATELY override any default', () => {
    const merged = resolveGenerationConfig(
      { thinkingConfig: { thinkingLevel: 'HIGH' }, maxOutputTokens: 1024 },
      universal,
      collection,
    );
    expect(merged.thinkingConfig).toEqual({ thinkingLevel: 'HIGH' });
    expect(merged.maxOutputTokens).toBe(1024);
  });

  it('does NOT let an explicit undefined clobber a computed default', () => {
    const merged = resolveGenerationConfig(
      { thinkingConfig: undefined, temperature: undefined },
      universal,
      collection,
    );
    expect(merged.thinkingConfig).toEqual(thinking);
    expect(merged.temperature).toBe(0.1);
  });

  it('never leaks the COLLECTION response schema onto a caller with its own config', () => {
    const merged = resolveGenerationConfig(
      { responseJsonSchema: { mine: true } },
      universal,
      collection,
    );
    expect(merged.responseJsonSchema).toEqual({ mine: true });

    // Even a caller that supplies NO schema must not inherit the extraction
    // one — that would silently reshape an unrelated prompt's output.
    const noSchema = resolveGenerationConfig(
      { temperature: 0 },
      universal,
      collection,
    );
    expect(noSchema.responseJsonSchema).toBeUndefined();
    expect(noSchema.responseMimeType).toBeUndefined();
  });

  it('falls back to the full collection config when the caller brings none', () => {
    const merged = resolveGenerationConfig(undefined, universal, collection);
    expect(merged).toEqual(collection);
    expect(merged.thinkingConfig).toEqual(thinking);
  });
});
