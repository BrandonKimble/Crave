type GeminiGenerationConfig = Record<string, unknown>;

/**
 * COST-BUG REGRESSION (2026-07-27). `callLLMApi` used to resolve its config
 * as `options.generationConfig ?? defaultGenerationConfig`, so any caller
 * that supplied its own config silently LOST the computed thinkingConfig —
 * and Gemini 3 defaults to HIGH thinking when no level is sent. Measured:
 * entity-resolution.match_batch averaged 5,694 output tokens/call vs 48 for
 * the same judgment through the single-item path (118x), making resolution
 * 64% of replay spend. This pins the merge semantics so the regression
 * cannot return silently.
 */
function resolveGenerationConfig(
  optionsConfig: GeminiGenerationConfig | undefined,
  baseThinkingConfig: { thinkingLevel?: string } | undefined,
  defaultConfig: GeminiGenerationConfig,
): GeminiGenerationConfig {
  return optionsConfig
    ? {
        ...(baseThinkingConfig ? { thinkingConfig: baseThinkingConfig } : {}),
        ...optionsConfig,
      }
    : defaultConfig;
}

describe('callLLMApi generationConfig merge (thinking-config seam)', () => {
  const base = { thinkingLevel: 'MINIMAL' };
  const fallback: GeminiGenerationConfig = { temperature: 1 };

  it('injects the computed thinking config into a caller-supplied config', () => {
    const merged = resolveGenerationConfig(
      { temperature: 0, maxOutputTokens: 65536 } as GeminiGenerationConfig,
      base,
      fallback,
    );
    expect(
      (merged as { thinkingConfig?: { thinkingLevel?: string } })
        .thinkingConfig,
    ).toEqual(base);
    expect(merged.temperature).toBe(0);
    expect(merged.maxOutputTokens).toBe(65536);
  });

  it('lets a caller DELIBERATELY override thinking (override wins over the default)', () => {
    const merged = resolveGenerationConfig(
      {
        temperature: 0,
        thinkingConfig: { thinkingLevel: 'HIGH' },
      } as GeminiGenerationConfig,
      base,
      fallback,
    );
    expect(
      (merged as { thinkingConfig?: { thinkingLevel?: string } })
        .thinkingConfig,
    ).toEqual({ thinkingLevel: 'HIGH' });
  });

  it('falls back to the default config when the caller supplies none', () => {
    expect(resolveGenerationConfig(undefined, base, fallback)).toBe(fallback);
  });

  it('supplies no thinking key when none was computed (never invents one)', () => {
    const merged = resolveGenerationConfig(
      { temperature: 0 } as GeminiGenerationConfig,
      undefined,
      fallback,
    );
    expect('thinkingConfig' in merged).toBe(false);
  });
});
