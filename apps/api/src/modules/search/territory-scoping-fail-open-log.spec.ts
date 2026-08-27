import 'reflect-metadata';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import {
  judgedVocabularyDouble,
  LEGACY_CUE_SEED,
} from '../../shared/testing/judged-vocabulary-double';

/**
 * TERRITORY-SCOPING FAIL-OPEN IS OBSERVABLE (F3104, D73: instrumentation
 * only — the fail-open POLICY itself is escalated with F2601 and is NOT
 * asserted as correct here, only as visible).
 *
 * The gazetteer's viewport-coverage resolve used to fail into a bare
 * `catch { scanEngineId = null }` — the restaurant arm silently scanned
 * GLOBALLY (exactly the multi-city mis-grounding red team ⑧ scoped it to
 * prevent), with nothing countable. This spec pins the contract:
 *
 *  1. a coverage failure does NOT fail the search (fail-open preserved),
 *  2. the scan runs UNSCOPED (engineId null — today's behavior, unchanged),
 *  3. the degradation is LOGGED with the named policy string, so a
 *     persistent coverage regression is a countable event, not a mystery.
 *
 * MUTATION-CAPABLE: delete the `this.logger.warn(...)` inside the catch in
 * search-query-interpretation.service.ts (reverting to the bare catch) and
 * the logging assertion goes RED while both behavior assertions stay green.
 */

const ITEM_ID = 'aaaaaaaa-0000-0000-0000-0000000f3104';

const BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

function makeService(coverage: { resolveViewportCoverage: jest.Mock }) {
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const entityTextSearch = {
    // The whole query grounds to one food span, so no residue lane (and no
    // second coverage resolve in the staging path) runs.
    scanForKnownEntityGroups: jest.fn(() =>
      Promise.resolve([
        {
          text: 'pizza',
          start: 0,
          end: 5,
          entities: [{ entityId: ITEM_ID, name: 'pizza', type: 'item' }],
        },
      ]),
    ),
    retrieveCandidates: jest.fn(() => Promise.resolve([])),
  };
  const dietary = { getDietaryIds: jest.fn(() => Promise.resolve(new Set())) };
  const signals = { record: jest.fn(), bboxFromBounds: jest.fn(() => null) };
  const svc = new SearchQueryInterpretationService(
    entityTextSearch as never,
    coverage as never,
    dietary as never,
    { getCuisineIds: () => Promise.resolve(new Set()) } as never,
    { recordResidue: jest.fn(() => Promise.resolve()) } as never,
    signals as never,
    { oracle: () => [] } as never,
    judgedVocabularyDouble({ negators: LEGACY_CUE_SEED }),
    logger as never,
  );
  return { svc, logger, entityTextSearch };
}

describe('territory scoping fail-open is logged (F3104)', () => {
  it('coverage failure: search continues unscoped AND the policy warn fires', async () => {
    const coverage = {
      resolveViewportCoverage: jest.fn(() =>
        Promise.reject(new Error('coverage outage')),
      ),
    };
    const { svc, logger, entityTextSearch } = makeService(coverage);

    // 1. fail-open: the search does not die with the coverage service.
    await expect(
      svc.interpret({ query: 'pizza', bounds: BOUNDS } as never),
    ).resolves.toBeDefined();

    // 2. unchanged behavior: the scan ran, unscoped.
    expect(entityTextSearch.scanForKnownEntityGroups).toHaveBeenCalledWith(
      'pizza',
      expect.anything(),
      expect.objectContaining({ engineId: null }),
    );

    // 3. the degradation is countable, under its named policy.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('territory scoping disabled'),
      expect.objectContaining({
        policy: 'territory-scoping-fail-open',
        error: { message: 'coverage outage' },
      }),
    );
  });

  it('coverage success: scoped scan, no policy warn', async () => {
    const coverage = {
      resolveViewportCoverage: jest.fn(() =>
        Promise.resolve({ engines: [{ engineId: 'engine-1' }], share: 1 }),
      ),
    };
    const { svc, logger, entityTextSearch } = makeService(coverage);

    await expect(
      svc.interpret({ query: 'pizza', bounds: BOUNDS } as never),
    ).resolves.toBeDefined();
    expect(entityTextSearch.scanForKnownEntityGroups).toHaveBeenCalledWith(
      'pizza',
      expect.anything(),
      expect.objectContaining({ engineId: 'engine-1' }),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('territory scoping disabled'),
      expect.anything(),
    );
  });
});
