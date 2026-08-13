/**
 * @script-class: probe
 * @finding: the FIRST end-to-end Mandarin battery (2026-08-12). zh joined
 * SUPPORTED_LOCALES with a capped preview sweep behind it; this probe is the
 * evidence for what a Chinese speaker actually reaches. Read-only.
 *
 * Each case runs the REAL path: the analyzer's script/locale fusion, the
 * gazetteer scan over the analyzer's n-grams, then `interpret()`, then
 * `runQuery()` wherever grounding succeeded. Nothing here is simulated.
 */
import { bootstrap, out } from './_shared';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';
import { SearchService } from '../../src/modules/search/search.service';
import { analyzeQuery } from '../../src/modules/entity-text-search/query-analyzer';
import type { SearchQueryRequestDto } from '../../src/modules/search/dto/search-query.dto';

const TYPES: EntityType[] = [
  'food',
  'ingredient',
  'food_attribute',
  'restaurant_attribute',
  'restaurant',
] as EntityType[];

/** Austin viewport — runQuery requires one. */
const BOUNDS = {
  northEast: { lat: 30.52, lng: -97.56 },
  southWest: { lat: 30.14, lng: -97.94 },
};

const CASES: Array<{ q: string; locale: string; note: string }> = [
  { q: '牛肉面', locale: 'zh-CN', note: 'beef noodle soup' },
  { q: '麻辣牛肉面', locale: 'zh-CN', note: 'bridging compound' },
  { q: '川味牛肉面', locale: 'zh-CN', note: 'regional compound' },
  { q: '珍珠奶茶', locale: 'zh-CN', note: 'boba, unspaced' },
  { q: '珍珠 奶茶', locale: 'zh-CN', note: 'boba, spaced — must equal above' },
  { q: '饺子', locale: 'zh-CN', note: 'dumpling' },
  { q: '北京烤鸭', locale: 'zh-CN', note: 'peking duck' },
  { q: '素食比萨', locale: 'zh-CN', note: 'vegan pizza (attribute+head)' },
  { q: '便宜的寿司', locale: 'zh-CN', note: 'cheap sushi (particle 的)' },
  { q: '牛肉', locale: 'zh-CN', note: 'span competition: short' },
  { q: 'pho 牛肉', locale: 'en-US', note: 'mixed script' },
  { q: '麻辣3号', locale: 'zh-CN', note: 'Han+digit' },
  { q: '牛肉麺', locale: 'zh-CN', note: 'zh typo — must NOT recover garbage' },
  { q: '牛肉面', locale: 'es-MX', note: 'Han from a Spanish phone' },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const scan = app.get(EntityTextSearchService);
    const interpretation = app.get(SearchQueryInterpretationService);
    const search = app.get(SearchService);

    for (const c of CASES) {
      const analysis = analyzeQuery(c.q, c.locale);
      const groups = await scan.scanForKnownEntityGroups(c.q, TYPES, {
        requestLocale: c.locale,
      });
      const spans = groups.length
        ? groups
            .map(
              (g) =>
                `${g.text}→${g.entities.map((e) => `${e.name}(${e.type})`).join('|')}`,
            )
            .join(' ')
        : '(no span)';
      const result = await interpretation.interpret({
        query: c.q,
        locale: c.locale,
      } as never);
      const entities = result.structuredRequest.entities as Record<
        string,
        Array<{ normalizedName: string }> | undefined
      >;
      const grounded = Object.entries(entities)
        .flatMap(([k, v]) => (v ?? []).map((e) => `${k}:${e.normalizedName}`))
        .join(' ');
      out(`--- ${c.q}  (${c.note}, locale=${c.locale})`);
      out(
        `    script=${analysis.script} lang=${JSON.stringify(analysis.detectedLocale ?? null)}`,
      );
      out(`    spans: ${spans}`);
      out(`    interpret: [${grounded || 'UNGROUNDED'}]`);
      out(`    unresolved: ${JSON.stringify(result.unresolved ?? null)}`);
      if (grounded) {
        const res = await search.runQuery({
          ...(result.structuredRequest as object),
          bounds: BOUNDS,
          pagination: { page: 1, pageSize: 10 },
        } as unknown as SearchQueryRequestDto);
        const meta = res.metadata as unknown as Record<string, unknown>;
        out(
          `    runQuery: dishes=${res.dishes?.length ?? 0} restaurants=${res.restaurants?.length ?? 0} totals=${String(meta?.totalFoodResults)}/${String(meta?.totalRestaurantResults)}`,
        );
        const top = (res.dishes ?? []).slice(0, 3) as Array<{
          name?: string;
          foodName?: string;
        }>;
        if (top.length) {
          out(
            `    top: ${top.map((d) => d.name ?? d.foodName ?? '?').join(' | ')}`,
          );
        }
      }
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
