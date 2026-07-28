import { resolveThinkingConfig } from './gemini-thinking';

/**
 * These pin the ONE property that the 2026-07-27 cost audit proved is
 * load-bearing: a Gemini 3 request never leaves here without an explicit
 * thinking level, because the vendor default is HIGH. Each spec can show RED
 * — delete the corresponding line in the resolver and one fails.
 */
describe('resolveThinkingConfig', () => {
  const GEMINI3 = 'gemini-3-flash-preview';

  it('ALWAYS returns a level for a gemini-3 model, even with no settings', () => {
    expect(
      resolveThinkingConfig({ model: GEMINI3, context: 'content' }).config
        ?.thinkingLevel,
    ).toBe('LOW');
    expect(
      resolveThinkingConfig({ model: GEMINI3, context: 'query' }).config
        ?.thinkingLevel,
    ).toBe('MINIMAL');
  });

  it('uses queryLevel for query and level for content', () => {
    const settings = { level: 'MEDIUM', queryLevel: 'MINIMAL' };
    expect(
      resolveThinkingConfig({ model: GEMINI3, context: 'content', settings })
        .config?.thinkingLevel,
    ).toBe('MEDIUM');
    expect(
      resolveThinkingConfig({ model: GEMINI3, context: 'query', settings })
        .config?.thinkingLevel,
    ).toBe('MINIMAL');
  });

  it('falls back to level when queryLevel is unset', () => {
    expect(
      resolveThinkingConfig({
        model: GEMINI3,
        context: 'query',
        settings: { level: 'MEDIUM' },
      }).config?.thinkingLevel,
    ).toBe('MEDIUM');
  });

  it('normalizes prefixed/lowercase levels', () => {
    expect(
      resolveThinkingConfig({
        model: GEMINI3,
        context: 'content',
        settings: { level: 'thinking_level.high' },
      }).config?.thinkingLevel,
    ).toBe('HIGH');
  });

  it('reports an invalid level AND still emits a safe default (never HIGH)', () => {
    const result = resolveThinkingConfig({
      model: GEMINI3,
      context: 'content',
      settings: { level: 'turbo' },
    });
    expect(result.invalidLevel).toBe('turbo');
    expect(result.config?.thinkingLevel).toBe('LOW');
  });

  it('emits no level for non-gemini-3 models (no HIGH default to guard)', () => {
    const result = resolveThinkingConfig({
      model: 'gemini-2.5-flash-lite',
      context: 'query',
      settings: { level: 'HIGH' },
    });
    expect(result.config).toBeUndefined();
  });

  it('carries includeThoughts only when asked', () => {
    expect(
      resolveThinkingConfig({ model: GEMINI3, context: 'query' }).config
        ?.includeThoughts,
    ).toBeUndefined();
    expect(
      resolveThinkingConfig({
        model: GEMINI3,
        context: 'query',
        includeThoughtsOverride: true,
      }).config?.includeThoughts,
    ).toBe(true);
  });
});
