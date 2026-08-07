import { resolveChunkTargetTokens } from './llm-chunking.service';

/**
 * LLM_CHUNK_TARGET_TOKENS is resolved at BOOT and REFUSED when set-but-invalid
 * (F4954). The old `parsePositiveInt(value, 35000)` meant `abc`, `0` and `-1`
 * all silently became 35000 — the exact class of stale-override-nobody-sees
 * that env-config-audit already caught once.
 */
describe('resolveChunkTargetTokens', () => {
  it('uses the documented default when absent or blank', () => {
    expect(resolveChunkTargetTokens(undefined)).toBe(35000);
    expect(resolveChunkTargetTokens('')).toBe(35000);
    expect(resolveChunkTargetTokens('   ')).toBe(35000);
  });

  it('accepts a valid positive integer override', () => {
    expect(resolveChunkTargetTokens('20000')).toBe(20000);
  });

  it.each(['abc', '0', '-1', '3.5'])(
    'REFUSES the set-but-invalid value %s instead of silently defaulting',
    (raw) => {
      expect(() => resolveChunkTargetTokens(raw)).toThrow(/positive integer/);
    },
  );
});
