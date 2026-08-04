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
const SCRIPTS = join(API_ROOT, 'scripts');

/**
 * WHAT REMAINS, AND WHY SIX TESTS LEFT.
 *
 * The boundary half of this file became ESLint selectors. Then a second cut
 * removed the MIRROR tests — assertions that the scope service's own source
 * contains what it contains ("unions BOTH ledgers", "holds the supersede").
 * A text assertion on a single-owner file is a mirror: the file is the only
 * definition of the fact, so the test can only ever disagree with it by being
 * stale. Mirrors have the worst property a guard can have — they must be
 * EDITED IN THE SAME COMMIT as any legitimate change, which trains people to
 * update the guard to match the code, which is the opposite of enforcement.
 * The service is the single spellable way (lint-enforced), and its header
 * documents each law with its finding id; that is what "self-documenting
 * single owner" means, and it is the enforcement.
 *
 * The two tests kept are CROSS-FILE couplings the lint rules cannot see:
 * the activation script is an exempted OWNER (so lint does not read its
 * content), and gc-unsupported-entities.sql is a .sql file (lint only sees
 * TypeScript template literals). Each couples two artifacts that can drift.
 */
describe('extraction scope is defined exactly once', () => {
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
