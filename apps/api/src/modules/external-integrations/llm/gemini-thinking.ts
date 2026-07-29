/**
 * THE one answer to "what thinking level does this Gemini call get?".
 *
 * Gemini 3 defaults to HIGH when a request specifies no thinking level, so
 * every request assembler that forgets one silently buys maximum reasoning.
 * That is not a per-call bug, it is a bug per ASSEMBLER — and this codebase
 * has three (LlmService, the relevance gate, and the batch request builder).
 * The 2026-07-27 cost audit found it in two of them; the fix is to stop
 * having three independent answers rather than to patch each site.
 *
 * Pure, dependency-free, and returns `invalidLevel` instead of logging so it
 * stays usable from any assembler while keeping the operator warning intact.
 */
export type ThinkingContext = 'content' | 'query';

export type GeminiThinkingSettings = {
  level?: string;
  queryLevel?: string;
  includeThoughts?: boolean;
  /**
   * PER-CALLER overrides, keyed by the §24 usageCaller tag — the same key
   * the usage ledger records, so "what level did we buy" and "what did it
   * cost" join on one column.
   *
   * Why this dimension exists: 'content' | 'query' is not per-caller, it is
   * per-global-setting, so ten caller classes collapse onto two levers.
   * `entity-resolution.match_batch` (a ~545-token identity judgment) and
   * `dish.knowledge_synthesize` (a generative call that once burned 63,325
   * output tokens) both declare 'query' and are therefore forced to the same
   * level — correct today by luck, not by design.
   *
   * DELIBERATELY EMPTY until a level is MEASURED. Inventing per-caller
   * values would be a fake estimate dressed as configuration; the point is
   * that the seam can express the difference the moment evidence exists.
   */
  perCaller?: Record<string, string>;
};

/** Mirrors the SDK's ThinkingConfig. `thinkingBudget` is the older
 *  token-budget control (unused here — Gemini 3 speaks levels) but stays in
 *  the shape so this type is assignable where the SDK's is expected. */
export type GeminiThinkingConfig = {
  thinkingLevel?: string;
  thinkingBudget?: number;
  includeThoughts?: boolean;
};

/** Defaults when nothing is configured: query is cheap classify/parse work,
 *  content is extraction. Neither is ever HIGH by accident. */
const DEFAULT_LEVEL: Record<ThinkingContext, string> = {
  query: 'MINIMAL',
  content: 'LOW',
};

export function isGemini3Model(model: string): boolean {
  return /gemini-3/i.test(model);
}

export function normalizeThinkingLevel(
  level: string | undefined,
): string | undefined {
  if (!level) {
    return undefined;
  }
  const cleaned = level
    .trim()
    .toUpperCase()
    .replace(/^THINKING_LEVEL[._]/u, '')
    .replace(/^THINKINGLEVEL[._]/u, '');
  return cleaned === 'MINIMAL' ||
    cleaned === 'LOW' ||
    cleaned === 'MEDIUM' ||
    cleaned === 'HIGH'
    ? cleaned
    : undefined;
}

export function resolveThinkingConfig(params: {
  model: string;
  context: ThinkingContext;
  settings?: GeminiThinkingSettings;
  includeThoughtsOverride?: boolean;
  /** §24 usageCaller tag; selects a per-caller level when one is set. */
  caller?: string;
}): { config?: GeminiThinkingConfig; invalidLevel?: string } {
  const { model, context, settings } = params;
  const includeThoughts =
    params.includeThoughtsOverride ?? settings?.includeThoughts === true;

  if (!isGemini3Model(model)) {
    // Non-Gemini-3 models have no thinking-level control (and no HIGH
    // default to guard against).
    return { config: includeThoughts ? { includeThoughts } : undefined };
  }

  const perCallerLevel = params.caller
    ? settings?.perCaller?.[params.caller]
    : undefined;
  const configuredLevel =
    perCallerLevel ??
    (context === 'query'
      ? (settings?.queryLevel ?? settings?.level)
      : settings?.level);
  const normalized = normalizeThinkingLevel(configuredLevel);
  return {
    config: {
      thinkingLevel: normalized ?? DEFAULT_LEVEL[context],
      ...(includeThoughts ? { includeThoughts } : {}),
    },
    ...(configuredLevel && !normalized
      ? { invalidLevel: configuredLevel }
      : {}),
  };
}
