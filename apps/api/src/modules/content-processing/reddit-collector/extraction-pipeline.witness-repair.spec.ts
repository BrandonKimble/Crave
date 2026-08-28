// p-limit is ESM-only; jest's CJS transform chokes on it when the pipeline
// service's import chain pulls in llm-concurrent-processing. Stub it — this
// spec never runs concurrent LLM work.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import {
  ContractRefusalRow,
  ExtractionPipelineService,
} from './extraction-pipeline.service';
import type {
  LLMMention,
  LLMPost,
} from '../../external-integrations/llm/llm.types';

/**
 * THE WITNESS-REPAIR RULE (v17 diff triage, the 813-claim pointer class):
 * the model's CLAIM is the observed span; the pointer is derivable data.
 * Pinned both sides here:
 *   - witnesses=0 REFUSES (the Luckys/invention guard — the span appears
 *     NOWHERE in scope, so the name is invented);
 *   - witnesses>=1 REPAIRS the pointer deterministically to the FIRST
 *     witness in the input's source order (post, then comments in order —
 *     the same depth-aware reading order the prompt resolves refs in),
 *     stable across reruns even when MULTIPLE sources carry the span.
 * The old rule (unique witness repairs, 2+ witnesses refuse) is retired:
 * ambiguity between REAL occurrences of a name is harmless.
 */

function buildService(): ExtractionPipelineService {
  const service = new ExtractionPipelineService(
    { setContext: jest.fn().mockReturnThis() } as never,
    {} as never,
    {} as never,
    { getSystemPrompt: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { markDirty: jest.fn() } as never,
    { emit: jest.fn() } as never,
  );
  (service as unknown as { logger: unknown }).logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return service;
}

const llmPosts: LLMPost[] = [
  {
    id: 'p1',
    title: 'Best queso in town?',
    content: 'Looking for queso recs around Mueller.',
    comments: [
      { id: 'c1', content: "Maudie's queso is the move.", score: 4 },
      { id: 'c2', content: "Second Maudie's — also try Polvos.", score: 2 },
    ],
  } as unknown as LLMPost,
];

const sourceMap = {
  SRC001: { canonical_id: 'p1', source_type: 'post' },
  SRC002: { canonical_id: 'c1', source_type: 'comment' },
  SRC003: { canonical_id: 'c2', source_type: 'comment' },
};

function admit(mention: Partial<LLMMention>): {
  admitted: { place_source_id: string; place: string } | null;
  refusals: ContractRefusalRow[];
} {
  const service = buildService();
  const enrichment = (
    service as unknown as {
      buildSourceEnrichmentMaps: (posts: LLMPost[]) => unknown;
    }
  ).buildSourceEnrichmentMaps(llmPosts);
  const refusals: ContractRefusalRow[] = [];
  const admitted = (
    service as unknown as {
      admitWireMention: (
        wireMention: unknown,
        chunkResult: unknown,
        enrichment: unknown,
        extractionInputId: string | null,
        sourceDocumentIdBySourceKey: Map<string, string>,
        refusals: ContractRefusalRow[],
      ) => { place_source_id: string; place: string } | null;
    }
  ).admitWireMention(
    {
      temp_id: 't1',
      item: 'queso',
      source_id: 'SRC002',
      ...mention,
    },
    { chunkId: 'chunk_0', input: { source_map: sourceMap } },
    enrichment,
    null,
    new Map(),
    refusals,
  );
  return { admitted, refusals };
}

describe('admitWireMention witness repair (v17)', () => {
  it('admits untouched when the cited source contains the span', () => {
    const { admitted, refusals } = admit({
      place_observed: "maudie's",
      place_source_id: 'SRC002',
    });
    expect(refusals).toHaveLength(0);
    expect(admitted?.place_source_id).toBe('c1');
    expect(admitted?.place).toBe("maudie's");
  });

  it('witnesses=0 refuses: an invented name stays out (the Luckys guard)', () => {
    const { admitted, refusals } = admit({
      place_observed: 'luckys diner',
      place_source_id: 'SRC002',
    });
    expect(admitted).toBeNull();
    expect(refusals).toHaveLength(1);
    expect(refusals[0].reason).toBe('span_not_in_cited_source');
    expect(refusals[0].detail).toContain('witnesses: 0');
    expect(refusals[0].mention).toMatchObject({
      place_observed: 'luckys diner',
    });
  });

  it('witnesses>=1 repairs a wrong pointer to the FIRST witness in source order', () => {
    // Cited the post (which never wrote the name); BOTH comments carry it.
    // The old rule refused this as ambiguous; the new rule repairs to c1 —
    // the first witness in the input's source order — deterministically.
    const { admitted, refusals } = admit({
      place_observed: "maudie's",
      place_source_id: 'SRC001',
    });
    expect(refusals).toHaveLength(0);
    expect(admitted?.place_source_id).toBe('c1');
  });

  it('a unique witness still repairs (subsumed by witnesses>=1)', () => {
    const { admitted, refusals } = admit({
      place_observed: 'polvos',
      place_source_id: 'SRC001',
    });
    expect(refusals).toHaveLength(0);
    expect(admitted?.place_source_id).toBe('c2');
  });
});

describe('admitWireMention ingredient observed-span contract (v17 loop2, junk RC2)', () => {
  it('keeps ingredients the source union wrote and drops the invented one — mention survives', () => {
    // Own source c1: "Maudie's queso is the move." — `queso` verifies;
    // `salted crab` appears nowhere in scope and is the RC2 pantry move.
    const { admitted, refusals } = admit({
      place_observed: "maudie's",
      place_source_id: 'SRC002',
      ingredients: ['queso', 'salted crab'],
    });
    expect(admitted).not.toBeNull();
    expect(
      (admitted as unknown as { ingredients: string[] }).ingredients,
    ).toEqual(['queso']);
    expect(refusals).toHaveLength(1);
    expect(refusals[0].reason).toBe('ingredient_not_in_source');
    expect(refusals[0].detail).toContain('"salted crab"');
    expect(refusals[0].mention).toMatchObject({
      ingredients: ['queso', 'salted crab'],
    });
  });

  it('licenses the resolution-order chain: an ask-text word verifies (v17 loop3)', () => {
    // "recs" lives only in the POST body — the mention's ask. Loop2 scoped
    // the union to own + place source and wrongly dropped it; loop3 walks
    // the resolution-order parent chain (c1 → p1), the same sources the
    // prompt licenses ask-inherited names from, so it now admits (with
    // C.5 head-token singular/plural variance: emitted `rec` vs "recs").
    const { admitted, refusals } = admit({
      place_observed: "maudie's",
      place_source_id: 'SRC002',
      ingredients: ['rec'],
    });
    expect(admitted).not.toBeNull();
    expect(
      (admitted as unknown as { ingredients: string[] }).ingredients,
    ).toEqual(['rec']);
    expect(refusals).toHaveLength(0);
  });

  it('licenses an ingredient inside the emitted dish name itself (C.5 rule 2, v17 loop3)', () => {
    // The bench's headline wrong-refusal: "best apple fritter?" ask-inherited
    // dish name — no source text in this fixture writes "apple", but the
    // emitted item does, and an in-dish-name ingredient is C.5-licensed by
    // construction.
    const { admitted, refusals } = admit({
      item: 'apple fritter',
      place_observed: "maudie's",
      place_source_id: 'SRC002',
      ingredients: ['apple'],
    });
    expect(admitted).not.toBeNull();
    expect(
      (admitted as unknown as { ingredients: string[] }).ingredients,
    ).toEqual(['apple']);
    expect(refusals).toHaveLength(0);
  });

  it('still refuses a fabricated contents-of ingredient (carnitas → pork)', () => {
    // Knowledge-derived contents: `pork` is not in the dish name, the source
    // union, or the ask chain — the fabrication catch survives loop3.
    const { admitted, refusals } = admit({
      item: 'carnitas',
      place_observed: "maudie's",
      place_source_id: 'SRC002',
      ingredients: ['pork'],
    });
    expect(admitted).not.toBeNull();
    expect(
      (admitted as unknown as { ingredients: string[] }).ingredients,
    ).toEqual([]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0].reason).toBe('ingredient_not_in_source');
  });

  it('an all-verified array passes untouched and banks nothing', () => {
    const { admitted, refusals } = admit({
      place_observed: "maudie's",
      place_source_id: 'SRC002',
      ingredients: ['queso'],
    });
    expect(refusals).toHaveLength(0);
    expect(
      (admitted as unknown as { ingredients: string[] }).ingredients,
    ).toEqual(['queso']);
  });
});
