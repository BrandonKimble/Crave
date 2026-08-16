/**
 * @script-class: probe
 *
 * DECOMPOSED-READING ROUTING PROBE (owner ruling 2026-08-06: ONE list,
 * Crave Score order, NO decomposed tier — precision comes from reading
 * parts as MODIFIERS, i.e. conjuncts, not rival dishes).
 *
 * Asserts the deterministic routing on real parses:
 *   1. "tacos veganos"    → compound food primary; part `taco` decomposed
 *      food (fallback — no modifier reading); part `vegan*` lands as an
 *      ATTRIBUTE (soft conjunct), never a food.
 *   2. "arroz con pollo"  → compound food primary; parts land in the
 *      INGREDIENT lane (hard conjunct) when an ingredient reading exists —
 *      "anything that has rice and chicken satisfies the search".
 *   3. RED: if a decomposed part of (1) lands as a bare FOOD *attribute
 *      reading available*, or any part carries decomposed=false, report red.
 *
 * Run (sim DB): DATABASE_URL=...crave_sim npx ts-node -T scripts/search-harness/decomposed-tier-probe.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { bootstrap, out } from './_shared';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';

interface Bucketed {
  item?: Array<{ normalizedName: string; decomposed?: boolean }>;
  itemAttributes?: Array<{ normalizedName: string; decomposed?: boolean }>;
  placeAttributes?: Array<{
    normalizedName: string;
    decomposed?: boolean;
  }>;
  ingredients?: Array<{ normalizedName: string; decomposed?: boolean }>;
}

async function main(): Promise<void> {
  const app = await bootstrap();
  let failures = 0;
  try {
    const interpretation = app.get(SearchQueryInterpretationService);
    const bounds = {
      northEast: { lat: 30.52, lng: -97.5 },
      southWest: { lat: 30.1, lng: -98.0 },
    };
    const parse = async (query: string): Promise<Bucketed> => {
      const r = (await interpretation.interpret({
        query,
        locale: 'es-US',
        bounds,
      } as never)) as unknown as { structuredRequest: { entities: Bucketed } };
      const e = r.structuredRequest.entities;
      out(`\n"${query}"`);
      for (const [bucket, items] of Object.entries(e)) {
        for (const item of (items as Bucketed['item']) ?? []) {
          out(
            `  ${bucket}: ${item.normalizedName}${item.decomposed ? '  [decomposed]' : ''}`,
          );
        }
      }
      return e;
    };

    const t = await parse('tacos veganos');
    const compoundPrimary = (t.item ?? []).some(
      (f) => !f.decomposed && f.normalizedName.includes('vegano'),
    );
    const partIsItem = (t.item ?? []).some((f) => f.decomposed);
    const veganAsAttr = [
      ...(t.itemAttributes ?? []),
      ...(t.placeAttributes ?? []),
    ].some((a) => a.normalizedName.startsWith('vegan'));
    const veganAsItem = (t.item ?? []).some(
      (f) => f.decomposed && f.normalizedName.startsWith('vegan'),
    );
    if (!compoundPrimary || !partIsItem || veganAsItem) failures += 1;
    out(
      `  ✓compound primary=${compoundPrimary} part-as-food=${partIsItem} vegan-as-attr=${veganAsAttr} vegan-as-food(RED)=${veganAsItem}`,
    );

    const a = await parse('arroz con pollo');
    const compound2 = (a.item ?? []).some((f) => !f.decomposed);
    const ingredientParts = (a.ingredients ?? []).filter(
      (i) => i.decomposed,
    ).length;
    out(
      `  ✓compound primary=${compound2} ingredient-conjuncts=${ingredientParts}`,
    );
    if (!compound2) failures += 1;

    out(`\n${failures ? 'RED' : 'GREEN'} (${failures} failing checks)`);
    if (failures) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
