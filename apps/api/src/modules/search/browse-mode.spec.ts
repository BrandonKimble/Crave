import 'reflect-metadata';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { judgedVocabularyDouble } from '../../shared/testing/judged-vocabulary-double';

/**
 * BROWSE MODE — the word-role composition rule (2026-08-15, narrowed by
 * owner amendment the same day).
 *
 * The facet is consulted BEFORE grounding and independent of the bank:
 * a banked junk surface ('best' the ghost restaurant, 'good taco') is not
 * evidence against a frame verdict. The laws pinned here:
 *
 *   1. FRAME-WORD-ONLY queries → BROWSE: unfiltered ranked serve. No entity
 *      filters, no residue probes, no demand rows — 'best food near me'
 *      measured EMPTY-with-confidence before this rule, because 'me' probed
 *      the linker and 'food' died in the bare-category list.
 *   2. VENUE-CATEGORY words keep today's behavior (owner amendment): they
 *      ground to their restaurant_attribute where one exists and build no
 *      browse scoping and no demand — category semantics land with the
 *      venue-taxonomy plan. Bare 'restaurants' is PROVISIONALLY
 *      frame-equivalent (browses) pending that plan.
 *   3. ≥1 particular → today's path with frame words excluded from
 *      GROUNDING INPUT only — never from name matching. A frame word inside
 *      a multiword banked name still grounds (the No-Name-Burgers law,
 *      applied to this facet).
 */

const FRAME_SEED: Array<[string, string]> = [
  ['best', 'en'],
  ['top', 'en'],
  ['good', 'en'],
  ['near', 'en'],
  ['me', 'en'],
  ['food', 'en'], // bare 'food' is frame BY OWNER RULING — demand-suppressed
  ['最好', 'und'],
];
const VENUE_SEED: Array<[string, string]> = [
  ['restaurants', 'en'],
  ['shops', 'en'],
  ['bar', 'en'],
  ['餐厅', 'und'],
];

const BOUNDS = {
  northEast: { lat: 30.52, lng: -97.56 },
  southWest: { lat: 30.14, lng: -97.94 },
};

type Span = {
  text: string;
  start: number;
  end: number;
  entities: Array<{ entityId: string; type: string; name: string }>;
  subGroups?: never[];
};

function harness(scanResult: (query: string) => Span[]) {
  const retrieveCandidates = jest.fn(() => Promise.resolve([]));
  const entityTextSearch = {
    scanForKnownEntityGroups: jest.fn((query: string) =>
      Promise.resolve(scanResult(query)),
    ),
    retrieveCandidates,
  };
  const signals = {
    record: jest.fn(),
    bboxFromBounds: jest.fn(() => null),
  };
  const engineCoverage = {
    resolveViewportCoverage: jest.fn(() =>
      Promise.resolve({ engines: [{ engineId: 'engine-1' }] }),
    ),
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const service = new SearchQueryInterpretationService(
    entityTextSearch as never,
    engineCoverage as never,
    { getDietaryIds: jest.fn(() => Promise.resolve(new Set())) } as never,
    { recordResidue: jest.fn(() => Promise.resolve()) } as never,
    signals as never,
    { oracle: undefined } as never,
    judgedVocabularyDouble({
      frames: FRAME_SEED,
      venueCategories: VENUE_SEED,
    }),
    logger as never,
  );
  return { service, retrieveCandidates, signals };
}

const span = (
  query: string,
  text: string,
  entities: Span['entities'],
): Span => {
  const start = query.toLowerCase().indexOf(text.toLowerCase());
  return { text, start, end: start + text.length, entities };
};

describe('browse mode — the word-role composition rule', () => {
  it("'best food near me' → browse: no entities, no probes, no demand rows", async () => {
    const { service, retrieveCandidates, signals } = harness(() => []);
    const result = await service.interpret({
      query: 'best food near me',
      bounds: BOUNDS,
    } as never);
    expect(result.queryAnalysis?.browseMode).toBe(true);
    expect(result.structuredRequest.entities).toEqual({});
    expect(result.unresolved).toEqual([]);
    expect(retrieveCandidates).not.toHaveBeenCalled();
    expect(signals.record).not.toHaveBeenCalled();
  });

  it("'top' → browse; the frame word never probes the linker (no beer)", async () => {
    const { service, retrieveCandidates, signals } = harness(() => []);
    const result = await service.interpret({ query: 'top' } as never);
    expect(result.queryAnalysis?.browseMode).toBe(true);
    expect(result.structuredRequest.entities).toEqual({});
    expect(retrieveCandidates).not.toHaveBeenCalled();
    expect(signals.record).not.toHaveBeenCalled();
  });

  it("'best' → browse even though a ghost restaurant is BANKED under it — the bank is not evidence", async () => {
    const { service } = harness((q) => [
      span(q, 'best', [
        { entityId: 'ghost-1', type: 'restaurant', name: 'Best' },
      ]),
    ]);
    const result = await service.interpret({ query: 'best' } as never);
    expect(result.queryAnalysis?.browseMode).toBe(true);
    expect(result.structuredRequest.entities).toEqual({});
  });

  it("bare 'restaurants' → browse PROVISIONALLY, and records NO demand (categories are not demand)", async () => {
    const { service, retrieveCandidates, signals } = harness(() => []);
    const result = await service.interpret({
      query: 'restaurants',
      bounds: BOUNDS,
    } as never);
    expect(result.queryAnalysis?.browseMode).toBe(true);
    expect(result.structuredRequest.entities).toEqual({});
    expect(result.unresolved).toEqual([]);
    expect(retrieveCandidates).not.toHaveBeenCalled();
    expect(signals.record).not.toHaveBeenCalled();
  });

  it("'coffee shops' keeps TODAY's behavior (owner amendment): grounds its attribute, no browse, no demand", async () => {
    const { service, signals } = harness((q) => [
      span(q, 'coffee shops', [
        {
          entityId: 'attr-1',
          type: 'restaurant_attribute',
          name: 'coffee shop',
        },
      ]),
    ]);
    const result = await service.interpret({
      query: 'coffee shops',
      bounds: BOUNDS,
    } as never);
    expect(result.queryAnalysis?.browseMode).toBe(false);
    expect(
      result.structuredRequest.entities.restaurantAttributes?.map(
        (e) => e.entityIds[0],
      ),
    ).toEqual(['attr-1']);
    expect(signals.record).not.toHaveBeenCalled();
  });

  it("'best birria near me' → today's path: birria grounds, frames stripped, no 'me' probe, no demand", async () => {
    const { service, retrieveCandidates, signals } = harness((q) => [
      span(q, 'birria', [
        { entityId: 'food-birria', type: 'food', name: 'birria' },
      ]),
      span(q, 'best', [
        { entityId: 'ghost-1', type: 'restaurant', name: 'Best' },
      ]),
    ]);
    const result = await service.interpret({
      query: 'best birria near me',
    } as never);
    expect(result.queryAnalysis?.browseMode).toBe(false);
    expect(
      result.structuredRequest.entities.food?.map((e) => e.entityIds[0]),
    ).toEqual(['food-birria']);
    // The frame-only ghost span is DROPPED from grounding input…
    expect(result.structuredRequest.entities.restaurants).toBeUndefined();
    // …and no frame token seeds a residue probe or a demand row.
    expect(retrieveCandidates).not.toHaveBeenCalled();
    expect(signals.record).not.toHaveBeenCalled();
    expect(result.unresolved).toEqual([]);
  });

  it('a frame word INSIDE a multiword banked name still grounds — name matching untouched', async () => {
    const { service } = harness((q) => [
      span(q, 'Best Quality Daughter', [
        {
          entityId: 'rest-bqd',
          type: 'restaurant',
          name: 'Best Quality Daughter',
        },
      ]),
    ]);
    const result = await service.interpret({
      query: 'Best Quality Daughter',
    } as never);
    expect(result.queryAnalysis?.browseMode).toBe(false);
    expect(
      result.structuredRequest.entities.restaurants?.map((e) => e.entityIds[0]),
    ).toEqual(['rest-bqd']);
  });

  it("'tacos' control — a particular word takes today's path unchanged", async () => {
    const { service } = harness((q) => [
      span(q, 'tacos', [{ entityId: 'food-taco', type: 'food', name: 'taco' }]),
    ]);
    const result = await service.interpret({ query: 'tacos' } as never);
    expect(result.queryAnalysis?.browseMode).toBe(false);
    expect(
      result.structuredRequest.entities.food?.map((e) => e.entityIds[0]),
    ).toEqual(['food-taco']);
  });

  it("an UNHEARD word blocks browse conservatively (today's path)", async () => {
    const { service, retrieveCandidates } = harness(() => []);
    const svc2 = new SearchQueryInterpretationService(
      {
        scanForKnownEntityGroups: jest.fn(() => Promise.resolve([])),
        retrieveCandidates,
      } as never,
      {} as never,
      { getDietaryIds: jest.fn(() => Promise.resolve(new Set())) } as never,
      { recordResidue: jest.fn(() => Promise.resolve()) } as never,
      { record: jest.fn(), bboxFromBounds: jest.fn(() => null) } as never,
      { oracle: undefined } as never,
      judgedVocabularyDouble({
        frames: FRAME_SEED,
        unjudged: ['sushiritto'],
      }),
      (() => {
        const logger = {
          setContext: () => logger,
          info: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        };
        return logger;
      })() as never,
    );
    void service;
    const result = await svc2.interpret({ query: 'best sushiritto' } as never);
    expect(result.queryAnalysis?.browseMode).toBe(false);
    // NOTHING GROUNDED, so the frame word is NOT excluded from the residue
    // run (the vi pa-05 lesson: an und frame verdict must not split a
    // compound we failed to read). The whole run reaches the residue lane;
    // the demand door strips 'best' from anything it records.
    expect(result.unresolved).toEqual([
      { type: 'food', terms: ['best sushiritto'] },
    ]);
  });
});
