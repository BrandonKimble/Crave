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
  const files = walk(SRC_ROOT);

  it('the raw GoogleGenAI client is constructible ONLY inside the gateway seam', () => {
    const allowed = new Set([
      // The gateway itself: owns THE generateContent client.
      'external-integrations/llm/llm.service.ts',
      // The batch TRANSPORT (batches.create/get): folding it into the
      // pipeline is the deferred item 3 of the gateway plan — its request
      // CONFIGS already flow through buildCollectionBatchRequest.
      'external-integrations/llm/gemini-batch.service.ts',
      // embedContent has no thinking/config/cache dimension to forget and
      // was audited clean ($0.078 lifetime); folding it buys purity, not
      // protection. Allowed deliberately, with this line as the record.
      'external-integrations/llm/embedding.service.ts',
    ]);
    const offenders = files
      .filter((file) => readFileSync(file, 'utf8').includes('new GoogleGenAI'))
      .map((file) => file.replace(`${SRC_ROOT}/`, '').replace(/\\/g, '/'))
      .map((file) => file.replace(/^modules\//, ''))
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
      'relevance-gate.judgeBatch', // also appears as ledger tag; profiled
      'photo-vision.isFoodContent', // legacy ledger tag, replaced by photos.is_food
    ]);
    const generationCallers = [...seen].filter(
      (caller) =>
        !nonGeneration.has(caller) || caller in GEMINI_CALLER_PROFILES,
    );
    const unprofiled = generationCallers.filter(
      (caller) =>
        !(caller in GEMINI_CALLER_PROFILES) && !nonGeneration.has(caller),
    );
    expect(unprofiled).toEqual([]);
  });

  it('no profile is an orphan (a table entry with no live call site)', () => {
    const allSource = files
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const orphans = Object.keys(GEMINI_CALLER_PROFILES).filter(
      (caller) => !allSource.includes(`'${caller}'`),
    );
    expect(orphans).toEqual([]);
  });
});
