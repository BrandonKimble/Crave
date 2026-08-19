import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { stripComments } from '../../../shared/testing/code-only';
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

  // Callers whose rows are not generateContent requests (cache lifecycle
  // tags, batch job accounting) have no generation profile by design.
  const nonGeneration = new Set([
    'llm.systemInstructionCache',
    'llm.queryInstructionCache',
    'llm.batchSystemCache',
    'llm.callGeminiApi',
    'gemini-batch.collection_extraction',
    // F1811: the second real purpose this test's new registerIngestor scan
    // caught — scripts/smoke-gemini-batch.ts's manual probe, a batch-job
    // accounting tag, not a generateContent request. Same exemption class
    // as collection_extraction above.
    'gemini-batch.smoke_test',
  ]);

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
      // INDIRECTED CALLERS (blind spot found 2026-08-17): the word-court
      // lanes carry their caller string in a lane-config object far from the
      // generateForCaller call, so neither pattern above ever saw them —
      // vocabulary.word_role_judge ran 32k hearings unprofiled while this
      // spec stayed green. Convention: every generation-judge caller ends in
      // `_judge`; a `caller: 'x_judge'` string ANYWHERE is a generation
      // caller and must be profiled. Non-generation vendor tags (Places,
      // TomTom, embeddings) never use the suffix.
      for (const match of source.matchAll(
        /caller:\s*'([a-z0-9_.-]+_judge)'/g,
      )) {
        seen.add(match[1]);
      }
    }
    // Red team F2: the gate's caller was wrongly exempted here, which meant
    // deleting its profile kept CI green (the only guard left was a boot
    // crash). Generation callers are NEVER exempt.
    // Liveness: an empty scan (regexes stop matching, source tree moves)
    // would make `unprofiled` empty and pass this completeness guard blind.
    // Assert the scan actually saw generation callers before trusting [].
    expect(seen.size).toBeGreaterThan(0);
    const unprofiled = [...seen].filter(
      (caller) =>
        !nonGeneration.has(caller) && !(caller in GEMINI_CALLER_PROFILES),
    );
    expect(unprofiled).toEqual([]);
  });

  it('every gemini-batch purpose has an explicit generation-exemption decision (F1811)', () => {
    // F1811: `usageCaller:`/`generateForCaller(` above are QUOTED-STRING-ONLY
    // regexes — gemini-batch.service.ts's ledger caller tag is a TEMPLATE
    // LITERAL, `` caller: `gemini-batch.${purpose}` ``, invisible to both.
    // Rather than widen those regexes to a fragile template-literal pattern,
    // derive the actual set of registered batch purposes from the one
    // greppable, always-literal call site — `registerIngestor('purpose', ...)`
    // — and require EACH to appear in `nonGeneration` by name. A second
    // purpose registered without updating the exemption set fails this test
    // instead of silently escaping both completeness checks with zero CI
    // signal, the same silent-drift shape the file's header docstring says
    // killed the previous scanner generation.
    const registeredPurposes = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /registerIngestor\(\s*'([a-z0-9_.-]+)'/g,
      )) {
        registeredPurposes.add(match[1]);
      }
    }
    expect(registeredPurposes.size).toBeGreaterThan(0);
    const missingExemptionDecision = [...registeredPurposes]
      .map((purpose) => `gemini-batch.${purpose}`)
      .filter((caller) => !nonGeneration.has(caller));
    expect(missingExemptionDecision).toEqual([]);
  });

  it('no profile is an orphan (a table entry with no live call site)', () => {
    // Red team F1: the haystack included gemini-caller-profiles.ts itself,
    // whose keys are single-quoted — every profile matched its own
    // definition and the test could never fail. Exclude the table.
    // F2702: strip comments before joining. A raw-text scan credits prose —
    // a `// see 'relevance-gate.judgeBatch'` mention would keep a dead profile
    // "alive", the same comment-satisfies-the-guard shape the header docstring
    // says killed the previous scanner generation. Match against code only.
    const allSource = files
      .filter((file) => !file.endsWith('gemini-caller-profiles.ts'))
      .map((file) => stripComments(readFileSync(file, 'utf8'), file))
      .join('\n');
    const orphans = Object.keys(GEMINI_CALLER_PROFILES).filter(
      (caller) => !allSource.includes(`'${caller}'`),
    );
    expect(orphans).toEqual([]);
  });
});
