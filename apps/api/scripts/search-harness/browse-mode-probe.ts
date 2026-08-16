/**
 * @script-class: probe
 *
 * BROWSE-MODE PROBE (word-role composition rule, 2026-08-15; orchestration
 * takeover, 2026-08-16). Runs the gate queries through the REAL serve path —
 * SearchOrchestrationService.runNaturalQuery, the exact service the
 * controller's POST /search/natural calls — against the live local corpus
 * and the certified word-role vocabulary.
 *
 * WHY orchestration and not interpret()+runQuery(): the foundation red team
 * (#1) caught this probe green while the app was red. The probe hand-stitched
 * interpret() to runQuery() and so bypassed orchestration's empty-targets
 * gate, which rejected every browse query with the "Adjust your search"
 * scold before browseMode was ever consulted. Driving the full path makes
 * that gap structurally impossible to reopen.
 *
 * What each case pins (assertions, not vibes — any miss exits 1):
 *   food              → browse serve: ranked page WITH results, coverage full
 *   top               → browse serve, NO beer
 *   best              → browse serve (bank is not evidence against the frame)
 *   best food near me → browse serve, no scold
 *   restaurants       → browse (PROVISIONAL frame-equivalent, owner amendment)
 *   coffee shops      → today's behavior: grounds its attribute, no browse
 *   餐厅              → today's behavior (venue-category grounds where banked)
 *   tacos             → control, today's path unchanged
 *   best birria near me → birria only, frames stripped, no 'me' probe
 *   zorblatt quinlex  → NON-browse unresolvable: honest empty + scold stays
 */
import { bootstrap, out } from './_shared';
import { SearchOrchestrationService } from '../../src/modules/search/search-orchestration.service';

const BOUNDS = {
  northEast: { lat: 30.52, lng: -97.56 },
  southWest: { lat: 30.14, lng: -97.94 },
};

type Case = {
  q: string;
  locale: string | null;
  note: string;
  expectBrowse: boolean;
  /** Browse serves must be non-empty with coverage 'full' and no scold. */
  expectServe: boolean;
};

const CASES: Case[] = [
  {
    q: 'food',
    locale: null,
    note: 'bare domain word — frame by ruling',
    expectBrowse: true,
    expectServe: true,
  },
  {
    q: 'top',
    locale: null,
    note: 'was: fuzzy-grounded beer',
    expectBrowse: true,
    expectServe: true,
  },
  {
    q: 'best',
    locale: null,
    note: 'banked ghost restaurant is not evidence',
    expectBrowse: true,
    expectServe: true,
  },
  {
    q: 'best food near me',
    locale: null,
    note: 'was: NOTHING (the severity-1 hole)',
    expectBrowse: true,
    expectServe: true,
  },
  {
    q: 'restaurants',
    locale: null,
    note: 'provisional bare-word browse',
    expectBrowse: true,
    expectServe: true,
  },
  {
    q: 'coffee shops',
    locale: null,
    note: 'today: attribute grounding, no browse',
    expectBrowse: false,
    expectServe: true,
  },
  {
    q: '餐厅',
    locale: 'zh-CN',
    note: 'zh venue-category — today, not browse',
    expectBrowse: false,
    expectServe: true,
  },
  {
    q: 'tacos',
    locale: null,
    note: 'CONTROL — particular, unchanged',
    expectBrowse: false,
    expectServe: true,
  },
  {
    q: 'best birria near me',
    locale: null,
    note: 'frames stripped, birria',
    expectBrowse: false,
    expectServe: true,
  },
  {
    q: 'zorblatt quinlex',
    locale: null,
    note: 'non-browse unresolvable — honest empty stays',
    expectBrowse: false,
    expectServe: false,
  },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  let failures = 0;
  try {
    const orchestration = app.get(SearchOrchestrationService);
    for (const c of CASES) {
      const res = await orchestration.runNaturalQuery({
        query: c.q,
        locale: c.locale,
        bounds: BOUNDS,
        pagination: { page: 1, pageSize: 10 },
      } as never);
      const meta = res.metadata as unknown as Record<string, unknown>;
      const browseMode =
        (meta.queryAnalysis as { browseMode?: boolean } | undefined)
          ?.browseMode === true;
      const dishes = res.dishes?.length ?? 0;
      const restaurants = res.restaurants?.length ?? 0;
      const total = dishes + restaurants;
      const coverage = String(meta.resultCoverageStatus);
      const scold = typeof meta.emptyQueryMessage === 'string';
      const top = (
        (res.dishes ?? []).slice(0, 3) as Array<{
          name?: string;
          foodName?: string;
        }>
      )
        .map((d) => d.name ?? d.foodName ?? '?')
        .join(' | ');

      const problems: string[] = [];
      if (browseMode !== c.expectBrowse) {
        problems.push(`browseMode=${String(browseMode)}`);
      }
      if (c.expectServe && c.expectBrowse) {
        if (total === 0) problems.push('EMPTY browse serve');
        if (coverage !== 'full') problems.push(`coverage=${coverage}`);
        if (scold) problems.push('scold on a browse serve');
      }
      if (!c.expectServe) {
        if (total !== 0) problems.push(`served ${total} results`);
        if (coverage !== 'unresolved') problems.push(`coverage=${coverage}`);
        if (!scold) problems.push('missing honest empty message');
      }
      if (c.q === 'top' && top.toLowerCase().includes('beer')) {
        problems.push('beer is back');
      }
      if (problems.length) failures += 1;

      out(`--- '${c.q}'  (${c.note})`);
      out(
        `    browseMode=${String(browseMode)} dishes=${dishes} ` +
          `restaurants=${restaurants} coverage=${coverage} ` +
          `scold=${String(scold)} top=[${top}]` +
          (problems.length ? `  RED: ${problems.join(', ')}` : '  ok'),
      );
    }

    // FIRST-SEARCH SYNC-HEARING LATENCY CEILING (foundation red team #7):
    // a query carrying a word NOBODY has judged pays at most the bounded
    // hearing (FIRST_SEARCH_HEARING_CEILING_MS = 1500ms) plus ordinary
    // interpret cost. A nonsense word is novel by construction; this case
    // goes RED if the bounded await ever becomes unbounded.
    // MEASURED at the real 1-2 word shape (2026-08-16, api_usage_ledger
    // duration_ms, n=12): hearing p50=1226ms / p95=1423ms — the ceiling
    // holds with ~5% headroom, so a typical run pays the hearing itself
    // (~1.2-1.4s), not the timeout.
    const CEILING_MS = 1_500;
    const SLACK_MS = 1_500; // grounding probes + analyzer, generous
    const novelWord = `zzqx${Date.now().toString(36)}`;
    const t0 = performance.now();
    await orchestration.runNaturalQuery({
      query: `${novelWord} tacos`,
      locale: null,
      bounds: BOUNDS,
      pagination: { page: 1, pageSize: 10 },
    } as never);
    const elapsed = Math.round(performance.now() - t0);
    const withinCeiling = elapsed <= CEILING_MS + SLACK_MS;
    out(
      `--- novel-word latency: '${novelWord} tacos' full-path=${elapsed}ms ` +
        `ceiling=${CEILING_MS}ms(+${SLACK_MS} slack) ${withinCeiling ? 'ok' : 'RED'}`,
    );
    if (!withinCeiling) failures += 1;

    out(failures ? `PROBE RED: ${failures} failing case(s)` : 'PROBE GREEN');
    if (failures) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
