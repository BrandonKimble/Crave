/**
 * @script-class: probe
 * @finding: page-1 admission attribution. Measured 2026-08-09 — it DISPROVES the
 * assumption that same-item siblings are withheld until a page cannot fill:
 *   - "tacos al pastor" resolves THREE anchors (al pastor tacos, al pastor, taco).
 *     Every al-pastor row is already `exact`; page 1 is 12/20 `category` rows
 *     (birria tacos, carnitas tacos, fish taco, quesabirria) admitted at
 *     relevance 1.0 as category members of the DECOMPOSED part `taco`.
 *   - The tier-1 ring is NOT page-fill-gated in practice: "birria tacos" is
 *     19/20 `ring` and "pho bo" 13/20 `ring` (bun bo hue, shaken beef, beef lo
 *     mein, caldo de res) at the 0.1 cousin floor, ordered by Crave Score.
 * So the page-1 defect is admission RELEVANCE and decomposed-part fan-out, not a
 * missing same-item tier.
 *
 * For each query: interpret it, run the real pooled search, and label every
 * page-1 dish with WHY its food was admitted. The label set is recomputed here
 * from the SAME widening reads the pre-probe seed uses, so the reasons are the
 * production ones, not a reconstruction:
 *
 *   exact        the linked query anchor itself
 *   category     verified category member / head-final name variant / judged satisfies
 *   ring         dense sibling / judged cousin / mentions-it
 *
 *   npx ts-node -T scripts/search-harness/same-sibling-admission-demo.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { bootstrap, out } from './_shared';
import { SearchService } from '../../src/modules/search/search.service';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';
import { SearchSiblingExpansionService } from '../../src/modules/search/search-sibling-expansion.service';
import type { SearchQueryRequestDto } from '../../src/modules/search/dto/search-query.dto';

const BOUNDS = {
  northEast: { lat: 30.52, lng: -97.5 },
  southWest: { lat: 30.1, lng: -98.0 },
};

const QUERIES: { query: string; locale: string }[] = [
  { query: 'tacos al pastor', locale: 'en-US' },
  { query: 'birria tacos', locale: 'en-US' },
  { query: 'banh mi', locale: 'en-US' },
  { query: 'tacos', locale: 'es-US' },
  { query: 'pho bo', locale: 'vi-VN' },
  { query: 'ramen', locale: 'en-US' },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const interpretation = app.get(SearchQueryInterpretationService);
    const search = app.get(SearchService);
    const expansion = app.get(SearchSiblingExpansionService);

    for (const { query, locale } of QUERIES) {
      const parsed = (await interpretation.interpret({
        query,
        locale,
        bounds: BOUNDS,
      } as never)) as unknown as { structuredRequest: SearchQueryRequestDto };
      const request = {
        ...parsed.structuredRequest,
        pagination: { page: 1, pageSize: 20 },
      } as SearchQueryRequestDto;

      const anchors = (request.entities?.items ?? []).flatMap(
        (f) => (f as { entityIds?: string[] }).entityIds ?? [],
      );
      const reader = expansion.forRequest();
      const [category, variants, judged] = await Promise.all([
        reader.getCategoryMemberItemIds(anchors),
        reader.getNameContainmentVariantItemIds(anchors),
        reader.getSatisfiesItemIds(anchors),
      ]);
      const anchorSet = new Set(anchors);
      const catSet = new Set([
        ...category,
        ...variants.isVariantOf,
        ...judged.satisfies,
      ]);
      const label = (itemId: string): string =>
        anchorSet.has(itemId)
          ? 'exact'
          : catSet.has(itemId)
            ? 'category'
            : 'ring';

      const result = await search.runQuery(request);
      const dishes = result.dishes ?? [];
      out('');
      out(`================ "${query}" (${locale}) ================`);
      out(
        `  anchors=${anchors.length} category=${catSet.size} page-1 dishes=${dishes.length}`,
      );
      const counts: Record<string, number> = {};
      for (const [i, d] of dishes.entries()) {
        const reason = label(d.itemId);
        counts[reason] = (counts[reason] ?? 0) + 1;
        out(
          `  ${String(i + 1).padStart(2)}  ${reason.padEnd(13)}` +
            ` rel=${(d.relevance ?? 1).toFixed(3)}  ${d.itemName}  @ ${d.placeName}`,
        );
      }
      out(
        `  --- ${Object.entries(counts)
          .map(([k, v]) => `${k}:${v}`)
          .join('  ')}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
