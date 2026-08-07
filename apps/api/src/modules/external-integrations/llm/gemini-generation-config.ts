/**
 * THE one answer to "what generationConfig does a Gemini call actually get?".
 *
 * COST-BUG REGRESSION (2026-07-27, hardened 2026-07-28, extracted 2026-08-06).
 *
 * `callLLMApi` used to resolve its config as `options.generationConfig ??
 * defaultGenerationConfig`, so any caller supplying its own config silently
 * LOST the computed thinkingConfig — and Gemini 3 thinks HIGH when no level
 * is sent. Measured: entity-resolution.match_batch averaged 5,694 output
 * tokens/call vs 48 for the same judgment through the path that set it
 * correctly, making resolution 64% of replay spend.
 *
 * The first fix special-cased ONE key (thinkingConfig) and left the CLASS
 * alive. The merge below pins the general property — no computed universal
 * default can be lost by any caller, for any key — plus the boundary that
 * keeps it safe: the COLLECTION-specific response schema must NOT leak onto
 * callers that bring their own config, or every unrelated prompt inherits
 * the extraction shape.
 *
 * It lives here, pure and dependency-free, rather than inlined in
 * `callLLMApi`, because its regression spec must be able to CALL IT. While
 * it was private the spec could only test a hand-copied twin: reverting the
 * production line to the original bug left all 196 tests in the module green
 * (F4926), i.e. the file that exists to prevent a measured 118x cost
 * regression could not detect that regression.
 */
export type GeminiGenerationConfig = Record<string, unknown> & {
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  responseJsonSchema?: Record<string, unknown>;
  cachedContent?: string;
  systemInstruction?: string;
  httpOptions?: {
    timeout?: number;
  };
  abortSignal?: AbortSignal;
  thinkingConfig?: {
    thinkingBudget?: number;
    thinkingLevel?: string;
    includeThoughts?: boolean;
  };
};

/**
 * Merge the caller's config over the computed UNIVERSAL defaults, stripping
 * `undefined` values so an explicitly-undefined key cannot clobber a
 * computed one either. A caller that brings no config at all is the
 * COLLECTION (extraction) path and gets the collection defaults whole.
 */
export function resolveGenerationConfig(
  optionsConfig: GeminiGenerationConfig | undefined,
  universalDefaults: GeminiGenerationConfig,
  collectionDefaults: GeminiGenerationConfig,
): GeminiGenerationConfig {
  const definedOnly = (config: GeminiGenerationConfig) =>
    Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined),
    ) as GeminiGenerationConfig;
  return optionsConfig
    ? { ...universalDefaults, ...definedOnly(optionsConfig) }
    : collectionDefaults;
}
