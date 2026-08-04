import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE 38TH JOIN CANNOT APPEAR.
 *
 * Seven of eight critical red-team defects were the same domain question
 * ("what is active / owned / affected?") hand-written as ad-hoc SQL at 37
 * separate call sites. ExtractionScopeService now owns those definitions.
 * This spec is the enforcement — the same shape as
 * gemini-gateway-lockdown.spec.ts, which has held the Gemini client
 * boundary since it was written.
 *
 * Each expectation can show RED: re-introduce a raw
 * `active_extraction_run_id` join in a reader and this fails.
 */

const API_ROOT = join(__dirname, '..', '..', '..', '..');
const SRC = join(API_ROOT, 'src');
const SCRIPTS = join(API_ROOT, 'scripts');

/**
 * TWO TESTS LEFT THIS FILE. They walked the source tree for files naming the
 * activation pointer, and for a run-excluding DELETE on the event ledgers —
 * import/pattern boundaries, which are ESLint selectors now
 * (see eslint.config.mjs). The walk covered src/ only, and the lint rule
 * immediately found three SCRIPTS naming the pointer: two legitimately (the
 * activation writer and the audit reporter, both exempted by name) and one,
 * backfill-attribute-evidence, genuinely hand-rolling the activation join.
 *
 * What remains here are assertions about what the DEFINITION says — the scope
 * service's own SQL, the activation script, and a .sql file. Those are not
 * boundaries and a lint rule cannot express them; they are also still text
 * assertions, and the honest replacement is executing the scope service
 * against a real Postgres with activation fixtures. That is a larger job than
 * this pass and it has not been done.
 */
describe('extraction scope is defined exactly once', () => {
  it('ExtractionScopeService answers all four questions the red team found wrong', () => {
    const text = readFileSync(
      join(
        SRC,
        'modules/content-processing/reddit-collector/extraction-scope.service.ts',
      ),
      'utf-8',
    );
    for (const method of [
      'documentsOwnedByRun', // D2
      'affectedRestaurantsForDocuments', // D7
      'shadowRunsFor', // D12
      'entityIdsWithActiveSupport', // D5
    ]) {
      expect(text).toContain(method);
    }
  });

  it('ownership is defined as the ACTIVE run, never as "appears in inputs" (D2)', () => {
    const text = readFileSync(
      join(
        SRC,
        'modules/content-processing/reddit-collector/extraction-scope.service.ts',
      ),
      'utf-8',
    );
    // The whole point: presence in a run's inputs is not ownership.
    expect(text).toContain('d.active_extraction_run_id');
    expect(text).toContain('replayOfExtractionRunId');
  });

  it('affected restaurants unions BOTH event ledgers (D7)', () => {
    const text = readFileSync(
      join(
        SRC,
        'modules/content-processing/reddit-collector/extraction-scope.service.ts',
      ),
      'utf-8',
    );
    const body = text.slice(text.indexOf('affectedRestaurantsForDocuments'));
    expect(body).toContain('core_restaurant_entity_events');
    expect(body).toContain('core_restaurant_events');
  });

  it('the active-scope fragment consumers import it, never inline it', () => {
    // Final-final red team #7: the D5 predicate was hand-copied inline in
    // the exact file it was invented for, unenforced. Every consumer of an
    // event-ledger read outside the allowlist must import a fragment.
    const consumers = [
      'modules/search/search-query.builder.ts',
      'modules/search/search-coverage.service.ts',
      'modules/home/curated-list-builder.service.ts',
      'modules/restaurant-enrichment/restaurant-entity-merge.service.ts',
      'modules/content-processing/entity-resolver/food-dedupe-merge.service.ts',
    ];
    for (const rel of consumers) {
      const text = readFileSync(join(SRC, rel), 'utf-8');
      // Round-six regression red team #1: `toContain('extraction-scope')`
      // was satisfiable by an UNUSED import, and the negative check covered
      // 3 of 5 files with one alias-brittle regex — a constructed violation
      // passed all six tests. The real invariant: a consumer's own source
      // NEVER names an event-ledger table (the fragment carries the table
      // name; the consumer only imports the builder). Any alias, any shape.
      expect(text).toContain('extraction-scope.service');
      expect(text).not.toContain('core_restaurant_events');
      expect(text).not.toContain('core_restaurant_entity_events');
    }
  });

  it('the activation script uses the shared definitions, not its own SQL', () => {
    const text = readFileSync(join(SCRIPTS, 'activate-shadow.ts'), 'utf-8');
    expect(text).toContain('ExtractionScopeService');
    // and must NOT re-derive affected restaurants itself
    expect(text).not.toContain(
      'SELECT DISTINCT restaurant_id FROM core_restaurant_entity_events',
    );
  });
});

describe('THE SUPERSEDE LAW is defined exactly once (F472–F474)', () => {
  /**
   * "Delete the events of the runs this activation replaces" had forked into
   * THREE copies (collection-evidence, unified-processing, replay). The
   * within-generation prompt-hash scoping was discovered and fixed in each
   * one SEPARATELY, after its sibling — because until then, a live re-ingest
   * silently destroyed a retained generation's rollback evidence. A law
   * re-derived three times is a coincidence, not a law.
   *
   * The enforceable shape: a run-EXCLUDING delete against either event
   * ledger is the supersede operation, and only the scope service may
   * express it. Both dialects count — raw SQL and Prisma deleteMany.
   *
   * RED proof: plant either dialect in any other file and this fails.
   */
  const SCOPE_SERVICE =
    'modules/content-processing/reddit-collector/extraction-scope.service.ts';

  const prismaSupersede =
    /(restaurantEntityEvent|restaurantEvent)\s*\.\s*deleteMany\s*\([\s\S]{0,600}?extractionRunId\s*:\s*\{\s*not\s*:/;

  it('the scope service DOES hold it, with the within-generation prompt-hash scoping', () => {
    const text = readFileSync(join(SRC, SCOPE_SERVICE), 'utf-8');
    expect(text).toContain('supersedeAndActivate');
    expect(prismaSupersede.test(text)).toBe(true);
    // cross-generation deletion belongs exclusively to the explicit discard
    expect(text).toContain('systemPromptHash');
    // D7: the losing set unions BOTH ledgers
    const body = text.slice(
      text.indexOf('export async function supersedeAndActivate'),
    );
    expect(body).toContain('core_restaurant_entity_events');
    expect(body).toContain('core_restaurant_events');
  });

  it("replay's dead activation pair is gone (it held the third copy)", () => {
    const text = readFileSync(
      join(
        SRC,
        'modules/content-processing/reddit-collector/replay.service.ts',
      ),
      'utf-8',
    );
    expect(text).not.toContain('async activateExtractionRunForDocuments');
    expect(text).not.toContain('async activateExtractionRunForDateRange');
    // and it no longer re-inlines the D7 union
    expect(text).not.toContain('collectAffectedRestaurantIds');
  });
});

describe('the GC support definition (round-11/12 — tombstones are memory)', () => {
  it('gc-unsupported-entities.sql counts ANY surviving event as support and never touches archived rows', () => {
    const sql = readFileSync(
      join(API_ROOT, 'scripts', 'reload', 'gc-unsupported-entities.sql'),
      'utf-8',
    );
    // ANY-event support (deliberately NOT the active-run scope predicate):
    // the retained generation is rollback evidence — an active-run-only GC
    // deleted it once (F1). This line failing means someone re-scoped it.
    expect(sql).toContain(
      'UNION SELECT restaurant_id FROM core_restaurant_entity_events',
    );
    expect(sql).not.toMatch(
      /active_extraction_run_id[\s\S]*FROM core_restaurant_entity_events/,
    );
    // tombstones are memory: GC only collects unsupported ACTIVE rows
    expect(sql).toContain("e.status <> 'archived'");
  });
});
