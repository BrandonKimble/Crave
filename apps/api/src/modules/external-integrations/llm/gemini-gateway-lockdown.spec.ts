import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { GEMINI_CALLER_PROFILES } from './gemini-caller-profiles';

/**
 * THE TOPOLOGY GUARD. Every Gemini cost bug this month was one defect in N
 * costumes: an independent request assembler forgetting a cross-cutting
 * truth (thinking level, spend admission, a ledger field, the model). The
 * gateway work removed the assemblers; these specs make the topology
 * ITSELF the invariant, so the next stray client or unprofiled caller fails
 * CI instead of shipping a new instance of the class.
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

  it('the raw GoogleGenAI client is constructible ONLY inside the gateway seam', () => {
    const allowed = new Set([
      // THE single owner. The batch transport and embeddings now consume
      // typed vendor ops from here (batchTransportOps / embedVendorOp), so
      // "a second assembler" is unrepresentable, not merely audited.
      'external-integrations/llm/llm.service.ts',
      // Historical one-shot A/B harness (2026-07-12 model comparison), kept
      // as a record; would run at HIGH thinking if ever re-used — rewrite
      // through the gateway before re-running.
      '../scripts/collection-model-ab-v2.ts',
    ]);
    // Detection is IMPORT-based (red team F6): `new GoogleGenAI` as a
    // string was evadable via an aliased import or `new (GoogleGenAI)`;
    // referencing the SDK module at all is not. A types-only need belongs
    // behind the gateway's exported types, not a direct SDK import.
    const offenders = files
      .filter((file) => readFileSync(file, 'utf8').includes('@google/genai'))
      .map((file) =>
        file
          .replace(`${SRC_ROOT}/`, '')
          .replace(/\\/g, '/')
          .replace(/^modules\//, '')
          .replace(/^.*\/apps\/api\/scripts\//, '../scripts/'),
      )
      .filter((file) => !allowed.has(file));
    expect(offenders).toEqual([]);
  });

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
      'embedding.embedContent',
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
