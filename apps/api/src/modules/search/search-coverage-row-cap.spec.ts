import 'reflect-metadata';
import {
  COVERAGE_MAX_ROWS,
  SearchCoverageService,
} from './search-coverage.service';

/**
 * THE COVERAGE READ IS BOUNDED, AND TRUNCATION IS COUNTABLE (F3807).
 *
 * The coverage/dots query had NO `LIMIT`: every eligible in-view location was
 * materialized into JS and mapped to a GeoJSON feature, bounded only by a
 * CLIENT-SUPPLIED bbox. There was no cap to mutate — that absence WAS the
 * finding — and the only thing that observed the row count was a debug log.
 *
 * Assertions are on the BOUND VALUE, not on the SQL text (asserting a
 * substring of a query prefix is the vacuity F3807 also files, one row over).
 *
 * MUTATION, both directions:
 *  - delete the `LIMIT ${COVERAGE_MAX_ROWS + 1}` -> case 1 goes RED;
 *  - delete the `rows.length = COVERAGE_MAX_ROWS` truncation or the named
 *    policy warn -> case 2 goes RED.
 */

const BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

function coverageRow(index: number) {
  return {
    restaurant_id: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`,
    location_id: `22222222-0000-4000-8000-${String(index).padStart(12, '0')}`,
    restaurant_name: `r-${index}`,
    longitude: -97.75,
    latitude: 30.25,
    location_hours: null,
    location_utc_offset_minutes: null,
    location_time_zone: null,
    crave_score: 7,
    crave_score_exact: 0.5,
    rising: null,
  };
}

function createHarness(rowCount: number) {
  const logger = createLogger();
  const capturedValues: unknown[][] = [];
  const prisma = {
    $queryRaw: jest.fn((sql: { values: unknown[] }) => {
      capturedValues.push(sql.values);
      return Promise.resolve(
        Array.from({ length: rowCount }, (_, i) => coverageRow(i)),
      );
    }),
  };
  const service = new SearchCoverageService(
    prisma as never,
    { resolve: () => [] } as never,
    logger as never,
  );
  return { service, logger, capturedValues };
}

describe('shortcut coverage: the read is bounded (F3807)', () => {
  it('binds the row cap (plus the truncation sentinel) into the query', async () => {
    const { service, capturedValues } = createHarness(3);

    await service.buildShortcutCoverageGeoJson({ bounds: BOUNDS } as never);

    expect(capturedValues).toHaveLength(1);
    // The sentinel: one MORE than the cap, so a full page is distinguishable
    // from an exactly-full page.
    expect(capturedValues[0]).toContain(COVERAGE_MAX_ROWS + 1);
  });

  it('truncates at the cap and logs the named policy when the sentinel row comes back', async () => {
    const { service, logger } = createHarness(COVERAGE_MAX_ROWS + 1);

    const geojson = (await service.buildShortcutCoverageGeoJson({
      bounds: BOUNDS,
    } as never)) as { features: unknown[] };

    // The sentinel is never emitted.
    expect(geojson.features).toHaveLength(COVERAGE_MAX_ROWS);
    const policies = logger.warn.mock.calls.map(
      (call: unknown[]) => (call[1] as { policy?: string } | undefined)?.policy,
    );
    expect(policies).toContain('coverage-row-cap-truncation');
  });

  it('does not warn, and emits every row, below the cap', async () => {
    const { service, logger } = createHarness(3);

    const geojson = (await service.buildShortcutCoverageGeoJson({
      bounds: BOUNDS,
    } as never)) as { features: unknown[] };

    expect(geojson.features).toHaveLength(3);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
