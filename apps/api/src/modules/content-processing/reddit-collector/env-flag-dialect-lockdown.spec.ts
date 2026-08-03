import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * ENV-FLAG DIALECT LOCKDOWN (F466 / the F401 precedent).
 *
 * Boolean env/config flags must go through the canonical reader
 * `isEnvFlagEnabled` (src/shared/config/env-flag.ts), which has ONE truthy
 * vocabulary (true/1/yes/on) and treats unrecognized values as "not a silent
 * yes". Hand-rolled `=== 'true'` / `.toLowerCase() === '1'` dialects each
 * invent their own vocabulary and let a typo silently flip a spend gate.
 *
 * This spec fails if any file in content-processing compares an env/config
 * value directly against a boolean literal. RED proof: the DISABLE_RESTAURANT_
 * ENRICHMENT gate (`.toLowerCase() === 'true'`) matched this before F466; the
 * unit test below pins that the pattern would have caught it.
 *
 * (A mode selector like `COLLECTION_LLM_MODE === 'interactive'` is NOT a
 * boolean flag and is deliberately not matched — the literal is not
 * true/false/1/0.)
 */

const TERRITORY = join(__dirname, '..');

// env/config source within the same statement (no `;`) of a boolean literal,
// in either operand order.
const FORWARD =
  /(process\.env\.[A-Z0-9_]+|configService\s*\.\s*get[^;]{0,80})[^;]{0,160}?(===|!==)\s*['"`](true|false|1|0)['"`]/;
const REVERSE =
  /['"`](true|false|1|0)['"`]\s*(===|!==)[^;]{0,160}?(process\.env\.[A-Z0-9_]+|configService\s*\.\s*get)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.includes('.spec.')) out.push(full);
  }
  return out;
}

describe('env-flag dialect lockdown (F466)', () => {
  it('no content-processing file compares an env/config value to a boolean literal', () => {
    const offenders = walk(TERRITORY).filter((file) => {
      const text = readFileSync(file, 'utf-8');
      return FORWARD.test(text) || REVERSE.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('the pattern DID catch the pre-F466 dialect (RED proof)', () => {
    const preFix = `if (String(this.configService.get('DISABLE_RESTAURANT_ENRICHMENT') ?? '').toLowerCase() === 'true') {`;
    expect(FORWARD.test(preFix)).toBe(true);
    // and the canonical replacement does not match
    const postFix = `if (isEnvFlagEnabled(this.configService.get('DISABLE_RESTAURANT_ENRICHMENT'))) {`;
    expect(FORWARD.test(postFix) || REVERSE.test(postFix)).toBe(false);
  });

  it('a mode selector (non-boolean literal) is intentionally NOT matched', () => {
    const modeRead = `process.env.COLLECTION_LLM_MODE?.trim().toLowerCase() === 'interactive'`;
    expect(FORWARD.test(modeRead) || REVERSE.test(modeRead)).toBe(false);
  });
});
