import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { GEMINI_CALLER_PROFILES } from './gemini-caller-profiles';

/**
 * EVERY GEMINI CALLER IS PROFILED — a data-completeness invariant, and the
 * only one left in this file.
 *
 * The topology invariants that used to live here (one client, every paid
 * surface gated) were source scanners, and one of them shipped a false green
 * by matching the word `assertSpendBudgetOpen` inside a COMMENT while the
 * real gate on the main generation path was gone. They are now structural:
 * the raw SDK client lives only in GatedGeminiClient, which exposes gated
 * operations and nothing else, and the import boundary that keeps it there is
 * an ESLint rule that fails in the editor.
 *
 * This one stays a test because it is not a boundary — it is a claim about
 * two lists agreeing, which no type or import rule can express.
 */

const SRC_ROOT = join(__dirname, '..', '..', '..');
const SCRIPTS_ROOT = join(SRC_ROOT, '..', 'scripts');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('Gemini gateway lockdown', () => {
  // scripts/ is inside the wall too (red team R4): the calibration
  // harness that lived there with its own client measured a configuration
  // production never ran — a fake measurement is worse than none.
  const files = [...walk(SRC_ROOT), ...walk(SCRIPTS_ROOT)];

  it('every usageCaller in the codebase has a caller profile', () => {
    // Two ways to make a Gemini GENERATION call: the internal option key
    // (usageCaller) and the public gateway (generateForCaller). Plain
    // `caller:` ledger tags from other vendors (Places, TomTom, embeddings)
    // are not generation requests and carry no profile.
    const seen = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /usageCaller:\s*'([a-z0-9_.-]+)'/gi,
      )) {
        seen.add(match[1]);
      }
      for (const match of source.matchAll(
        /generateForCaller\(\{[\s\S]{0,200}?caller:\s*'([a-z0-9_.-]+)'/g,
      )) {
        seen.add(match[1]);
      }
    }
    // Callers whose rows are not generateContent requests (cache lifecycle
    // tags, batch job accounting) have no generation profile by design.
    const nonGeneration = new Set([
      'llm.systemInstructionCache',
      'llm.queryInstructionCache',
      'llm.batchSystemCache',
      'llm.callGeminiApi',
      'gemini-batch.collection_extraction',
    ]);
    // Red team F2: the gate's caller was wrongly exempted here, which meant
    // deleting its profile kept CI green (the only guard left was a boot
    // crash). Generation callers are NEVER exempt.
    const unprofiled = [...seen].filter(
      (caller) =>
        !nonGeneration.has(caller) && !(caller in GEMINI_CALLER_PROFILES),
    );
    expect(unprofiled).toEqual([]);
  });

  it('no profile is an orphan (a table entry with no live call site)', () => {
    // Red team F1: the haystack included gemini-caller-profiles.ts itself,
    // whose keys are single-quoted — every profile matched its own
    // definition and the test could never fail. Exclude the table.
    const allSource = files
      .filter((file) => !file.endsWith('gemini-caller-profiles.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const orphans = Object.keys(GEMINI_CALLER_PROFILES).filter(
      (caller) => !allSource.includes(`'${caller}'`),
    );
    expect(orphans).toEqual([]);
  });
});
