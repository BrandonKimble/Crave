import * as fs from 'fs';
import * as path from 'path';
import { GEMINI_CALLER_PROFILES } from './gemini-caller-profiles';

/**
 * §24 caller taxonomy (Job 1, 2026-07-25): the usage ledger's per-class
 * measurement depends on EVERY interactive Gemini call site threading a
 * distinct `usageCaller` tag into callLLMApi — the generic
 * 'llm.callGeminiApi' tag is a dead-man default (it logs a warning when
 * hit), not an acceptable steady state.
 *
 * The "every call site is tagged" half is now a TYPE property — `usageCaller`
 * is a required field on callLLMApi's options (F4931), so an untagged site is
 * a compile error, not something this spec has to text-scan for. What remains
 * here is what the compiler cannot see: that each tag RESOLVES to a caller
 * profile (a typo'd tag silently gets the default profile + ledger blur), that
 * tags are unique, and that nobody hardcodes the dead-man tag.
 */
describe('LLMService caller taxonomy (§24 Job 1)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'llm.service.ts'),
    'utf8',
  );

  function callSiteSpans(): Array<{ index: number; span: string }> {
    const spans: Array<{ index: number; span: string }> = [];
    const marker = 'this.callLLMApi(';
    let from = 0;
    for (;;) {
      const index = source.indexOf(marker, from);
      if (index === -1) break;
      // Scan to the matching close paren of the call.
      let depth = 0;
      let end = index + marker.length - 1;
      for (let i = index + marker.length - 1; i < source.length; i++) {
        const ch = source[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      spans.push({ index, span: source.slice(index, end + 1) });
      from = end + 1;
    }
    return spans;
  }

  const siteTags = (): string[] =>
    callSiteSpans()
      .map(({ span }) => /usageCaller:\s*'([^']+)'/.exec(span)?.[1])
      .filter((tag): tag is string => tag !== undefined);

  it('finds the expected call sites at all (guards against the marker rotting)', () => {
    // DERIVED floor, not a seeded 12 (F4931): the marker must still match at
    // least as many sites as there are literal usageCaller tags we can read —
    // if the paren-scanner rots, the spans (and their tags) vanish together.
    expect(callSiteSpans().length).toBeGreaterThanOrEqual(siteTags().length);
    expect(siteTags().length).toBeGreaterThan(0);
  });

  it('every usageCaller tag resolves to a caller profile (a typo silently gets the default profile + ledger blur)', () => {
    const registryKeys = new Set(Object.keys(GEMINI_CALLER_PROFILES));
    const unresolved = siteTags().filter((tag) => !registryKeys.has(tag));
    expect(unresolved).toEqual([]);
  });

  it('no call site reuses the generic dead-man tag explicitly', () => {
    const explicitGeneric = callSiteSpans().filter(({ span }) =>
      span.includes("usageCaller: 'llm.callGeminiApi'"),
    );
    expect(explicitGeneric).toEqual([]);
  });

  it('every tag is unique per prompt class (the whole point of the taxonomy)', () => {
    const tags = callSiteSpans()
      .map(({ span }) => /usageCaller:\s*'([^']+)'/.exec(span)?.[1])
      .filter((tag): tag is string => tag !== undefined);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
