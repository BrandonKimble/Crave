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

  /**
   * EVERY PAID SDK SURFACE PASSES THE SPEND GATE.
   *
   * The gateway work moved client ownership for embeddings and batch into
   * typed vendor ops — and quietly left `embedContent` without the admission
   * check that generation and batch both have. So when the Tier-3 backstop
   * fired or the vendor poisoned the pool, generation stopped and EMBEDDINGS
   * KEPT SPENDING (red team 2026-08-02). embedContent bills per input token
   * and runs on the search hot path, where a Redis outage turns every query
   * into a live embed.
   *
   * The lesson matches this file's premise: auditing call sites is what
   * failed, so the topology is the invariant instead. A surface that COSTS
   * MONEY must have the gate between the enclosing function's start and the
   * call; a free surface (get/list/cancel/update/delete) must not need one.
   */
  it('every paid Gemini SDK surface is preceded by the spend gate', () => {
    const PAID = [
      'models.generateContent',
      'models.embedContent',
      'caches.create',
      'batches.create',
    ];
    const gateway = readFileSync(
      join(SRC_ROOT, 'modules/external-integrations/llm/llm.service.ts'),
      'utf8',
    );
    const lines = gateway.split('\n');

    const ungated: string[] = [];
    for (const [index, line] of lines.entries()) {
      const surface = PAID.find((paid) => line.includes(`this.genAI.${paid}`));
      if (!surface) continue;
      // Scope to the ENCLOSING METHOD, not a fixed line window. A fixed
      // window reported generateContent as ungated because callLLMApi's gate
      // sits 534 lines above the call inside a retry loop — a false positive
      // that would have trained everyone to ignore this test.
      let start = 0;
      for (let back = index; back >= 0; back--) {
        if (
          /^ {2}(private |public |protected )?(async )?[A-Za-z_]\w*\(/.test(
            lines[back],
          )
        ) {
          start = back;
          break;
        }
      }
      const body = lines.slice(start, index).join('\n');
      if (!body.includes('assertSpendBudgetOpen')) {
        ungated.push(`${surface} @ llm.service.ts:${index + 1}`);
      }
    }
    expect(ungated).toEqual([]);
  });

  it('the paid-surface scanner is not vacuously green', () => {
    // If the SDK is ever reached by a name this list does not know, the test
    // above passes while spending real money. Pin that the names it looks for
    // are actually present in the gateway.
    const gateway = readFileSync(
      join(SRC_ROOT, 'modules/external-integrations/llm/llm.service.ts'),
      'utf8',
    );
    for (const paid of [
      'models.generateContent',
      'models.embedContent',
      'caches.create',
      'batches.create',
    ]) {
      expect({ paid, present: gateway.includes(`this.genAI.${paid}`) }).toEqual(
        {
          paid,
          present: true,
        },
      );
    }
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
