import * as fs from 'fs';
import * as path from 'path';

/**
 * §24 caller taxonomy (Job 1, 2026-07-25): the usage ledger's per-class
 * measurement depends on EVERY interactive Gemini call site threading a
 * distinct `usageCaller` tag into callLLMApi — the generic
 * 'llm.callGeminiApi' tag is a dead-man default (it logs a warning when
 * hit), not an acceptable steady state. This spec is a structural guard:
 * it parses llm.service.ts and fails (RED-provable — delete any one tag and
 * watch it go red) if a `this.callLLMApi(` invocation's options do not
 * include a `usageCaller:` within the call's argument span.
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

  it('finds the expected call sites at all (guards against the marker rotting)', () => {
    expect(callSiteSpans().length).toBeGreaterThanOrEqual(12);
  });

  it('every this.callLLMApi call site passes a distinct usageCaller tag (no blur-tagged interactive spend)', () => {
    const untagged = callSiteSpans().filter(
      ({ span }) => !span.includes('usageCaller:'),
    );
    expect(
      untagged.map(({ index }) => {
        const line = source.slice(0, index).split('\n').length;
        return `llm.service.ts:${line}`;
      }),
    ).toEqual([]);
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
