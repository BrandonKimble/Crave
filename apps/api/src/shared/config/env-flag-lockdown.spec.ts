import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { isEnvFlagEnabled, isEnvFlagExplicitlyDisabled } from './env-flag';

/**
 * ONE ENV-FLAG DIALECT (F466 — the F401 class).
 *
 * `COLLECTION_SCHEDULER_ENABLED` once had two readers with two different
 * answers: one lowercased before comparing, one compared case-sensitively
 * against `'true'`. So `=TRUE` started the pacer dispatching collection while
 * Reddit skipped credential validation — one switch, two answers, silently
 * disagreeing. The codebase carried at least four dialects (`=== 'true'`,
 * `!== 'false'`, `'true' || '1'`, bare truthiness), several of them gating
 * real spend, against a canonical reader that was used exactly ONCE.
 *
 * The law: a boolean env flag is read through `env-flag.ts` and nowhere else.
 * A hand-rolled `process.env.X === 'true'` comparison anywhere outside it is
 * a new dialect, and this spec fails the build.
 *
 * RED proof: add `process.env.FOO === 'true'` to any non-allowlisted file.
 */

const API_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(API_ROOT, 'src');

/**
 * KNOWN REMAINING DEBT, enumerated on purpose.
 *
 * The D-E pass converted the content-processing sites (the ones gating
 * collection spend). These files still carry the old dialect and are OUTSIDE
 * that pass's scope. They are listed — not silently excluded — so the debt is
 * countable and the law still binds every NEW file. Deleting a line from this
 * list is how the debt gets paid; nothing may be ADDED to it without the same
 * scrutiny the original finding got.
 */
const KNOWN_REMAINING = [
  'config/configuration.ts',
  'shared/logging/winston.config.ts',
  'modules/home/curated-list-builder.service.ts',
  'modules/entity-text-search/entity-embedding-reconciler.service.ts',
  'modules/entity-text-search/entity-sibling-edge-builder.service.ts',
  'modules/identity/auth/clerk-auth.service.ts',
  'modules/search/search-query.executor.ts',
  'modules/search/search-query-interpretation.service.ts',
  'modules/search/search-orchestration.service.ts',
  'modules/signals/signal-demand-aggregate.service.ts',
  'modules/external-integrations/llm/gemini-batch.service.ts',
  'modules/external-integrations/llm/rate-limiting/smart-llm-processor.service.ts',
  'modules/external-integrations/llm/llm-audit-policy.ts',
  'modules/search/search.service.ts',
  'modules/search/utils/search-debug.ts',
];

/** A boolean comparison of an env var against a flag literal, any dialect:
 *  `process.env.X === 'true'`, `!== 'false'`, `=== '1'`, and the
 *  `?.trim().toLowerCase() === 'true'` / `(process.env.X || '') === 'true'`
 *  variants — the intervening call chain is what made these hard to grep. */
const HAND_ROLLED =
  /process\.env(?:\.[A-Z0-9_]+|\[['"][A-Z0-9_]+['"]\])[\s\S]{0,80}?[!=]==\s*['"](?:true|false|1|0|yes|no|on|off)['"]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.includes('.spec.')) out.push(full);
  }
  return out;
}

describe('env flags have exactly one dialect (F466)', () => {
  it('no file outside env-flag.ts hand-rolls a boolean env comparison', () => {
    const offenders = walk(SRC)
      .filter((file) => HAND_ROLLED.test(readFileSync(file, 'utf-8')))
      .map((file) =>
        file
          .slice(SRC.length + 1)
          .split('\\')
          .join('/'),
      )
      .filter((rel) => !rel.endsWith('shared/config/env-flag.ts'))
      .filter((rel) => !KNOWN_REMAINING.some((known) => rel.endsWith(known)));

    expect(offenders).toEqual([]);
  });

  it('the content-processing flags all read through the canonical reader', () => {
    const converted = [
      'modules/content-processing/entity-resolver/dish-knowledge-synthesis.service.ts',
      'modules/content-processing/reddit-collector/full-projection-rebuild.runner.ts',
      'modules/content-processing/reddit-collector/city-reextract.runner.ts',
      'modules/content-processing/reddit-collector/extraction-pipeline.service.ts',
      'modules/content-processing/reddit-collector/keyword-search-orchestrator.service.ts',
      'modules/content-processing/reddit-collector/keyword-slice-selection.service.ts',
      'modules/content-processing/reddit-collector/collector-pacer.service.ts',
    ];
    for (const rel of converted) {
      const text = readFileSync(join(SRC, rel), 'utf-8');
      expect(text).toContain('config/env-flag');
      expect(HAND_ROLLED.test(text)).toBe(false);
    }
  });

  it('the known-remaining list only shrinks (it is debt, not an exemption)', () => {
    // Pinning the count makes paying the debt a visible, deliberate edit and
    // makes ADDING to it impossible to do by accident.
    expect(KNOWN_REMAINING).toHaveLength(15);
  });
});

describe('the canonical reader itself', () => {
  it('accepts the spellings a human actually types', () => {
    for (const on of ['true', 'TRUE', ' 1 ', 'yes', 'On']) {
      expect(isEnvFlagEnabled(on)).toBe(true);
    }
    for (const off of ['false', 'FALSE', '0', 'no', 'off', '']) {
      expect(isEnvFlagEnabled(off)).toBe(false);
    }
  });

  it('treats an unrecognized value as OFF — a flag nobody can prove is on is not on', () => {
    expect(isEnvFlagEnabled('flase')).toBe(false);
    expect(isEnvFlagEnabled('maybe', true)).toBe(false);
  });

  it('honors the fallback only when the var is absent', () => {
    expect(isEnvFlagEnabled(undefined, true)).toBe(true);
    expect(isEnvFlagEnabled(null, true)).toBe(true);
    expect(isEnvFlagEnabled('false', true)).toBe(false);
  });

  it('the OPT-DOWN reader answers only "did someone explicitly say no?"', () => {
    // For a protection that is ON by default, a typo must NOT disable it.
    expect(isEnvFlagExplicitlyDisabled(undefined)).toBe(false);
    expect(isEnvFlagExplicitlyDisabled('')).toBe(false);
    expect(isEnvFlagExplicitlyDisabled('flase')).toBe(false);
    expect(isEnvFlagExplicitlyDisabled('true')).toBe(false);
    for (const off of ['off', 'OFF', 'false', '0', 'no']) {
      expect(isEnvFlagExplicitlyDisabled(off)).toBe(true);
    }
  });
});
