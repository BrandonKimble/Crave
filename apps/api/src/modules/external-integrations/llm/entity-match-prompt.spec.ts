import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  ENTITY_MATCH_BATCH_ENVELOPE,
  renderEntityMatchSystemInstruction,
} from './entity-match-prompt';

/**
 * ONE SOURCE OF TRUTH for the same-entity judgment.
 *
 * `entity-resolution.match` read prompts/entity-match-prompt.md while
 * `entity-resolution.match_batch` carried a divergent inline copy in
 * llm.service.ts. These pin the unification, and the decisive one is the
 * MUTATION: change the .md and BOTH transports' rendered prompts change. A
 * spec that merely asserted "the batch prompt mentions candidates" would have
 * passed happily through the whole period the twins were drifting.
 */

const PROMPT_PATH = join(__dirname, 'prompts', 'entity-match-prompt.md');
const canonical = (): string => readFileSync(PROMPT_PATH, 'utf-8');

describe('entity match prompt', () => {
  it('renders the single-call transport as the canonical .md, byte for byte', () => {
    expect(renderEntityMatchSystemInstruction(canonical(), 'single')).toBe(
      canonical(),
    );
  });

  it('renders the batch transport as the canonical .md PLUS envelope plumbing only', () => {
    const batch = renderEntityMatchSystemInstruction(canonical(), 'batch');
    expect(batch.startsWith(canonical().trimEnd())).toBe(true);
    expect(batch).toContain(ENTITY_MATCH_BATCH_ENVELOPE);
    // The envelope is transport, not judgment: everything the model is told
    // about WHEN two names are the same entity comes from the .md.
    expect(batch.replace(ENTITY_MATCH_BATCH_ENVELOPE, '').trim()).toBe(
      canonical().trim(),
    );
  });

  it('MUTATION PROOF: editing the .md changes BOTH transports', () => {
    const original = canonical();
    const sentinel = 'SENTINEL-ONE-SOURCE-OF-TRUTH-9f2a';
    try {
      writeFileSync(PROMPT_PATH, `${original}\n\n${sentinel}\n`, 'utf-8');
      const mutated = canonical();
      expect(renderEntityMatchSystemInstruction(mutated, 'single')).toContain(
        sentinel,
      );
      expect(renderEntityMatchSystemInstruction(mutated, 'batch')).toContain(
        sentinel,
      );
    } finally {
      writeFileSync(PROMPT_PATH, original, 'utf-8');
    }
    expect(canonical()).toBe(original);
  });

  it('keeps the cost-asymmetry framing the inline twin had lost', () => {
    // The drift that made this defect expensive: the batch copy said
    // "uncertain = new" but never said WHY a wrong merge is the costly
    // direction. Both transports carry it now because there is one text.
    for (const mode of ['single', 'batch'] as const) {
      expect(renderEntityMatchSystemInstruction(canonical(), mode)).toMatch(
        /costlier than a spurious new one/,
      );
    }
  });

  it('leaves NO inline entity-match system instruction in llm.service.ts', () => {
    const service = readFileSync(join(__dirname, 'llm.service.ts'), 'utf-8');
    // Both call sites must go through the one renderer.
    expect(service).toContain("this.entityMatchSystemInstruction('single')");
    expect(service).toContain("this.entityMatchSystemInstruction('batch')");
    // The twin's signature opening line must not come back.
    expect(service).not.toMatch(/You judge entity identity/);
  });
});
