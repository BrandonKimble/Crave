import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  ENTITY_MATCH_BATCH_ENVELOPE,
  ENTITY_MATCH_SINGLE_ENVELOPE,
  renderEntityMatchSystemInstruction,
} from './entity-match-prompt';
import {
  ENTITY_MATCH_RESPONSE_JSON_SCHEMA,
  ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA,
} from './prompts/llm-response-schemas';

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
  it('renders each transport as the canonical .md PLUS its own envelope, nothing else', () => {
    for (const [mode, envelope] of [
      ['single', ENTITY_MATCH_SINGLE_ENVELOPE],
      ['batch', ENTITY_MATCH_BATCH_ENVELOPE],
    ] as const) {
      const rendered = renderEntityMatchSystemInstruction(canonical(), mode);
      expect(rendered.startsWith(canonical().trimEnd())).toBe(true);
      expect(rendered).toContain(envelope);
      // The envelope is transport, not judgment: everything the model is told
      // about WHEN two names are the same entity comes from the .md.
      expect(rendered.replace(envelope, '').trim()).toBe(canonical().trim());
    }
  });

  /**
   * THE DEFECT THIS PINS (red team 2026-08-12): the rederived .md absorbed the
   * BATCH protocol — "You receive `items`", "one verdict per input `index`",
   * `candidateId`. The single lane sends `{term, kind, candidates}` and its
   * enforced schema requires `candidate_id`, so the canonical text described a
   * request that lane never sends and named an output key its own schema
   * rejects. Each transport now states its own protocol, and the canonical
   * text states neither.
   */
  it('each transport names the id field ITS enforced schema requires', () => {
    expect(Object.keys(ENTITY_MATCH_RESPONSE_JSON_SCHEMA.properties)).toContain(
      'candidate_id',
    );
    expect(ENTITY_MATCH_SINGLE_ENVELOPE).toContain('candidate_id');
    expect(ENTITY_MATCH_SINGLE_ENVELOPE).not.toContain('candidateId');

    expect(
      Object.keys(
        ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA.properties.items.items
          .properties,
      ),
    ).toContain('candidateId');
    expect(ENTITY_MATCH_BATCH_ENVELOPE).toContain('candidateId');
  });

  it('keeps the multi-item protocol OUT of the canonical text', () => {
    // A single-item request has no `items` array and no `index`; the .md is
    // read by BOTH transports, so neither word may live there.
    expect(canonical()).not.toMatch(/\bindex\b/);
    expect(canonical()).not.toMatch(/`items`/);
    expect(
      renderEntityMatchSystemInstruction(canonical(), 'single'),
    ).not.toMatch(/\bindex\b/);
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
      // Phrase updated with the rederived .md (2026-08-11): the asymmetry
      // now reads "a wrong new merely mints a spurious twin that later
      // evidence can merge" under "The error economics — why doubt says new".
      expect(renderEntityMatchSystemInstruction(canonical(), mode)).toMatch(
        /spurious twin that later\s+evidence\s+can\s+merge/,
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
