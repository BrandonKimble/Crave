import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { PrismaClient } from '@prisma/client';

/**
 * CALIBRATION-TAIL INSTRUMENTS (search-from-scratch spec §4.0 sequencing):
 * build every instrument NOW, flip/curate NOTHING until the post-reload
 * graph settles — each thing is then measured exactly once, against data
 * that is done changing. READ-ONLY.
 *
 *   yarn ts-node scripts/search-harness/calibration-instruments.ts conflicts
 *     → the multi-type name list for the owner's ~44-name placement
 *       curation (spec §4.2): every ACTIVE name occupying 2+ buckets,
 *       with per-type evidence counts. food+ingredient-only pairs are
 *       EXCLUDED (the twin union already serves them).
 *
 *   yarn ts-node scripts/search-harness/calibration-instruments.ts junk
 *     → retroactive junk sweep candidates (spec §5): zero-location
 *       generic-name restaurants, generic food-side words, 5+-word
 *       extraction fragments. Output is a REVIEW list, never a delete.
 *
 *   yarn ts-node scripts/search-harness/calibration-instruments.ts threshold
 *     → richness-threshold re-measure (owner set 25 = one page; verify
 *       post-reload): distribution of all-word ("full") pool sizes per
 *       recent low-result context, plus overall connection-count deciles.
 */

const prisma = new PrismaClient();

async function conflicts(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { name: string; types: string[]; counts: number[] }[]
  >`
    WITH by_name AS (
      SELECT LOWER(e.name) AS name, e.type::text AS type, e.entity_id,
             (SELECT COUNT(*) FROM core_restaurant_items c
              WHERE c.food_id = e.entity_id)
             + (SELECT COUNT(*) FROM core_restaurant_items c
                WHERE c.food_attributes @> ARRAY[e.entity_id])
             AS evidence
      FROM core_entities e
      WHERE e.status = 'active'
    )
    SELECT name,
           array_agg(type ORDER BY type) AS types,
           array_agg(evidence::int ORDER BY type) AS counts
    FROM by_name
    GROUP BY name
    HAVING COUNT(DISTINCT type) >= 2
       AND NOT (array_agg(DISTINCT type ORDER BY type) = ARRAY['food','ingredient'])
    ORDER BY name
  `;
  console.log(
    `multi-type conflict names (excl food+ingredient pairs): ${rows.length}`,
  );
  for (const row of rows) {
    console.log(
      `${row.name}\t${row.types.map((t, i) => `${t}=${row.counts[i]}`).join(' ')}`,
    );
  }
}

async function junk(): Promise<void> {
  const genericRestaurants = await prisma.$queryRaw<
    { name: string; entity_id: string }[]
  >`
    SELECT e.name, e.entity_id::text
    FROM core_entities e
    WHERE e.status = 'active' AND e.type = 'restaurant'
      AND LOWER(e.name) IN ('best','place','favorite','spot','restaurant','food')
      AND NOT EXISTS (
        SELECT 1 FROM core_restaurant_locations rl
        WHERE rl.restaurant_id = e.entity_id AND rl.google_place_id IS NOT NULL
      )
  `;
  const genericFoods = await prisma.$queryRaw<
    { name: string; type: string; entity_id: string }[]
  >`
    SELECT e.name, e.type::text, e.entity_id::text
    FROM core_entities e
    WHERE e.status = 'active' AND e.type IN ('food','food_attribute')
      AND LOWER(e.name) IN ('fresh','classic','dinner','lunch','good','great','nice')
  `;
  const fragments = await prisma.$queryRaw<
    { name: string; type: string; entity_id: string }[]
  >`
    SELECT e.name, e.type::text, e.entity_id::text
    FROM core_entities e
    WHERE e.status = 'active'
      AND e.type IN ('food','food_attribute','restaurant_attribute')
      AND array_length(string_to_array(TRIM(e.name), ' '), 1) >= 5
    ORDER BY e.name
  `;
  console.log(
    `zero-location generic restaurants: ${genericRestaurants.length}`,
  );
  genericRestaurants.forEach((r) => console.log(`  ${r.name}\t${r.entity_id}`));
  console.log(`generic food-side words: ${genericFoods.length}`);
  genericFoods.forEach((r) => console.log(`  ${r.type}\t${r.name}`));
  console.log(`5+-word extraction fragments: ${fragments.length}`);
  fragments.slice(0, 50).forEach((r) => console.log(`  ${r.type}\t${r.name}`));
  if (fragments.length > 50) console.log(`  … +${fragments.length - 50} more`);
}

async function threshold(): Promise<void> {
  // Per-food pool-size deciles: how many connections a subject typically
  // has — the denominator the one-page threshold gates against.
  const deciles = await prisma.$queryRaw<{ decile: number; pool: number }[]>`
    WITH pools AS (
      SELECT c.food_id, COUNT(*)::int AS pool
      FROM core_restaurant_items c
      GROUP BY c.food_id
    )
    SELECT ntile AS decile, MAX(pool) AS pool
    FROM (SELECT pool, ntile(10) OVER (ORDER BY pool) AS ntile FROM pools) x
    GROUP BY ntile ORDER BY ntile
  `;
  console.log('per-food connection-pool deciles (post-reload, re-measure):');
  deciles.forEach((d) => console.log(`  d${d.decile}: ≤${d.pool}`));
  const lowResult = await prisma.$queryRaw<{ day: string; asks: number }[]>`
    SELECT (created_at::date)::text AS day, COUNT(*)::int AS asks
    FROM collection_on_demand_requests
    WHERE reason = 'low_result'
      AND created_at > now() - interval '30 days'
    GROUP BY 1 ORDER BY 1
  `;
  console.log('low_result demand rows by day (30d):');
  lowResult.forEach((r) => console.log(`  ${r.day}: ${r.asks}`));
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'conflicts') await conflicts();
  else if (cmd === 'junk') await junk();
  else if (cmd === 'threshold') await threshold();
  else {
    console.error('usage: calibration-instruments.ts conflicts|junk|threshold');
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

void main();
