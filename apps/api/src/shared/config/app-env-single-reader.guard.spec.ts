import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { codeOnly } from '../testing/code-only';

// APP_ENV IS READ IN ONE PLACE, BECAUSE ITS VALUE BECOMES A REDIS KEY.
//
// The three-valued AppEnv commit claimed it collapsed "eight hand-rolled
// readers with different normalizations". It introduced `normalizeAppEnv` and
// converted three files — and left the TWO that actually build Redis key
// prefixes untouched (red team 2026-08-02):
//
//   centralized-rate-limiter  trimmed, never lowercased, never mapped
//                             `production` -> `prod`, feeding
//                             `crave:${appEnv}:llm-rate-limiter`
//   rate-limit-coordinator    a third dialect handling production/development
//                             but not `stage`, feeding
//                             `crave:${appEnv}:external-rate-limit`
//
// Two spellings across a rolling deploy means two disjoint rate-limit windows
// and a silently doubled ceiling — on the two vendors that cost the most.
//
// The commit message was the sweep's only evidence, and it was wrong. This is
// the evidence instead.

const SRC = join(__dirname, '..', '..');

/**
 * Files allowed to read the raw variable. Everything else must call
 * `normalizeAppEnv`, so a new bespoke dialect cannot appear unnoticed.
 */
const RAW_READERS = new Set([
  // The normalizer itself, and the config layer that seeds it.
  'shared/config/app-env.ts',
  'config/configuration.ts',
  // Exposure gates that deliberately refuse on prod/staging by NAME — they
  // must see the raw value to fail closed on an unrecognized one.
  'shared/config/debug-routes.gate.ts',
  'modules/identity/auth/clerk-auth.service.ts',
  // Boot-time DB guard; normalizes internally via normalizeAppEnv.
  'prisma/prisma.service.ts',
]);

function tsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsFiles(full, acc);
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))
      acc.push(full);
  }
  return acc;
}

function rawAppEnvReaders(): string[] {
  const offenders: string[] = [];
  for (const file of tsFiles(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    if (RAW_READERS.has(rel)) continue;
    const source = codeOnly(readFileSync(file, 'utf8'));
    if (!/process\.env\.(APP_ENV|CRAVE_ENV)/.test(source)) continue;
    // Reading it is fine if the value goes straight through the normalizer.
    if (/normalizeAppEnv\s*\(/.test(source)) continue;
    offenders.push(rel);
  }
  return offenders.sort();
}

describe('APP_ENV has one reader', () => {
  it('the scanner sees the tree (not vacuously green)', () => {
    expect(tsFiles(SRC).length).toBeGreaterThan(100);
  });

  it('no file normalizes APP_ENV by hand', () => {
    expect(rawAppEnvReaders()).toEqual([]);
  });
});
