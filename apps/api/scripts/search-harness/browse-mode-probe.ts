/**
 * @script-class: probe
 *
 * BROWSE-MODE PROBE (word-role composition rule, 2026-08-15). Runs the gate
 * queries end-to-end — interpret() then runQuery() — against the live local
 * corpus and the certified word-role vocabulary. The before-state, measured
 * 2026-08-15 pre-build: 'food' EMPTY, 'top' → beer, 'best food near me' →
 * NOTHING (confident wrongness, not just emptiness).
 *
 * What each case pins:
 *   food             → browse, full ranked page with results, coverage full
 *   top              → browse, NO beer, no probes
 *   best food near me → browse, no demand rows (frame words suppressed)
 *   restaurants      → browse (PROVISIONAL frame-equivalent, owner amendment)
 *   coffee shops     → today's behavior: grounds its attribute, no browse
 *   餐厅             → today's behavior (venue-category grounds where banked)
 *   tacos            → control, today's path unchanged
 *   best birria near me → birria only, frames stripped, no 'me' probe
 */
import { bootstrap, out } from './_shared';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';
import { SearchService } from '../../src/modules/search/search.service';
import type { SearchQueryRequestDto } from '../../src/modules/search/dto/search-query.dto';

const BOUNDS = {
  northEast: { lat: 30.52, lng: -97.56 },
  southWest: { lat: 30.14, lng: -97.94 },
};

const CASES: Array<{ q: string; locale: string | null; note: string }> = [
  { q: 'food', locale: null, note: 'bare domain word — frame by ruling' },
  { q: 'top', locale: null, note: 'was: fuzzy-grounded beer' },
  { q: 'best food near me', locale: null, note: 'was: NOTHING' },
  { q: 'restaurants', locale: null, note: 'provisional bare-word browse' },
  {
    q: 'coffee shops',
    locale: null,
    note: 'today: attribute grounding, no browse',
  },
  { q: '餐厅', locale: 'zh-CN', note: 'zh venue-category — today, not browse' },
  { q: 'tacos', locale: null, note: 'CONTROL — particular, unchanged' },
  { q: 'best birria near me', locale: null, note: 'frames stripped, birria' },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const interpretation = app.get(SearchQueryInterpretationService);
    const search = app.get(SearchService);
    for (const c of CASES) {
      const result = await interpretation.interpret({
        query: c.q,
        locale: c.locale,
        bounds: BOUNDS,
      } as never);
      const entities = result.structuredRequest.entities as Record<
        string,
        Array<{ normalizedName: string }> | undefined
      >;
      const grounded = Object.entries(entities)
        .flatMap(([k, v]) => (v ?? []).map((e) => `${k}:${e.normalizedName}`))
        .join(' ');
      out(`--- '${c.q}'  (${c.note})`);
      out(
        `    browseMode=${String(result.queryAnalysis?.browseMode)} ` +
          `entities=[${grounded || 'none'}] ` +
          `unresolved=${JSON.stringify(result.unresolved)}`,
      );
      const res = await search.runQuery({
        ...(result.structuredRequest as object),
        bounds: BOUNDS,
        pagination: { page: 1, pageSize: 10 },
      } as unknown as SearchQueryRequestDto);
      const meta = res.metadata as unknown as Record<string, unknown>;
      const top = (res.dishes ?? []).slice(0, 3) as Array<{
        name?: string;
        foodName?: string;
      }>;
      out(
        `    runQuery: dishes=${res.dishes?.length ?? 0} ` +
          `restaurants=${res.restaurants?.length ?? 0} ` +
          `coverage=${String(meta?.resultCoverageStatus)} ` +
          `top=[${top.map((d) => d.name ?? d.foodName ?? '?').join(' | ')}]`,
      );
    }
    // FIRST-SEARCH SYNC-HEARING LATENCY CEILING (foundation red team #7):
    // a query carrying a word NOBODY has judged pays at most the bounded
    // hearing (FIRST_SEARCH_HEARING_CEILING_MS = 1500ms) plus ordinary
    // interpret cost. A nonsense word is novel by construction; this case
    // goes RED if the bounded await ever becomes unbounded.
    const CEILING_MS = 1_500;
    const SLACK_MS = 1_500; // grounding probes + analyzer, generous
    const novelWord = `zzqx${Date.now().toString(36)}`;
    const t0 = performance.now();
    await interpretation.interpret({
      query: `${novelWord} tacos`,
      locale: null,
      bounds: BOUNDS,
    } as never);
    const elapsed = Math.round(performance.now() - t0);
    const withinCeiling = elapsed <= CEILING_MS + SLACK_MS;
    out(
      `--- novel-word latency: '${novelWord} tacos' interpret=${elapsed}ms ` +
        `ceiling=${CEILING_MS}ms(+${SLACK_MS} slack) ${withinCeiling ? 'ok' : 'RED'}`,
    );
    if (!withinCeiling) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
