/**
 * @script-class: operational
 *
 * R11/R12 VENUE-AXIS DATA PREP (2026-08-16): promote the Google place types
 * already STORED on grounded restaurants (restaurant_metadata->googlePlaces->
 * types — no API call, free) into restaurant_attribute evidence rows
 * (source_class 'places_api'), using the audited classification in
 * google-place-type-attributes.ts. This is the backfill for restaurants
 * grounded before the map covered their types (incl. the R12 star: the bare
 * `restaurant` type is a mapped venue kind now).
 *
 * DATA ONLY: writes evidence rows + the merge-only restaurant_attributes
 * array union — the exact pair the live enrichment path
 * (RestaurantLocationEnrichmentService) writes. NO search-semantics change.
 *
 * Idempotent: evidence insert is upsert-by-(restaurant, attribute,
 * source_class) via skipDuplicates; the array union only adds; attribute
 * entities are created on demand with their vocabulary aliases (same law as
 * ensureRestaurantAttributeEntity).
 *
 *   yarn workspace api ts-node scripts/backfill-place-type-attributes.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import {
  GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP,
  RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME,
  isClassifiedGooglePlaceType,
} from '../src/modules/restaurant-enrichment/google-place-type-attributes';
import { identityInsertData } from '../src/modules/content-processing/entity-resolver/entity-identity';
import { addSurfaces } from '../src/modules/content-processing/entity-resolver/entity-surface.service';

interface GroundedRow {
  entity_id: string;
  types: string[];
  restaurant_attributes: string[];
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);

    const rows = await prisma.$queryRaw<GroundedRow[]>`
      SELECT e.entity_id,
             ARRAY(
               SELECT t.value FROM jsonb_array_elements_text(
                 e.restaurant_metadata->'googlePlaces'->'types'
               ) t
             ) AS types,
             e.restaurant_attributes
        FROM core_entities e
       WHERE e.type = 'restaurant'
         AND e.status = 'active'
         AND jsonb_typeof(e.restaurant_metadata->'googlePlaces'->'types') = 'array'
         AND EXISTS (
           SELECT 1 FROM core_restaurant_locations l
            WHERE l.restaurant_id = e.entity_id
              AND l.google_place_id IS NOT NULL
         )
    `;
    out(
      `grounded restaurants with stored types: ${rows.length} (mode=${apply ? 'APPLY' : 'dry-run'})`,
    );

    // Unclassified census first — this script must not run against a map
    // that does not cover the corpus.
    const unclassified = new Set<string>();
    for (const row of rows) {
      for (const type of row.types) {
        if (!isClassifiedGooglePlaceType(type)) unclassified.add(type);
      }
    }
    if (unclassified.size) {
      out(`REFUSING: unclassified types: ${[...unclassified].join(', ')}`);
      process.exitCode = 1;
      return;
    }

    // Resolve (or plan) attribute entity ids for every canonical the corpus
    // needs.
    const neededCanonicals = new Set<string>();
    for (const row of rows) {
      for (const type of row.types) {
        const canonical = GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP[type];
        if (canonical) neededCanonicals.add(canonical);
      }
    }
    // Match by IDENTITY KEY, not name: the uq_attribute_identity_key partial
    // unique index is on (type, identity_key) over non-archived rows, and a
    // fold-equivalent name ('Tex Mex' vs 'tex-mex') would P2002 a create the
    // name-equality probe did not see.
    const existing = await prisma.entity.findMany({
      where: {
        type: EntityType.restaurant_attribute,
        status: { not: 'archived' },
      },
      select: { entityId: true, identityKey: true },
    });
    const idsByIdentityKey = new Map<string, string>();
    for (const e of existing) {
      if (e.identityKey && !idsByIdentityKey.has(e.identityKey)) {
        idsByIdentityKey.set(e.identityKey, e.entityId);
      }
    }
    const idsByName = new Map<string, string>();
    for (const canonical of neededCanonicals) {
      const key = identityInsertData(
        canonical,
        EntityType.restaurant_attribute,
      ).identityKey;
      const id = key ? idsByIdentityKey.get(key) : undefined;
      if (id) idsByName.set(canonical, id);
    }
    const missing = [...neededCanonicals].filter(
      (name) => !idsByName.has(name),
    );

    // Plan per-kind evidence additions.
    const perKindNew = new Map<string, number>();
    const evidencePlan: Array<{ restaurantId: string; canonical: string }> = [];
    const arrayGrowth = new Map<string, Set<string>>();
    const existingEvidence = new Set(
      (
        await prisma.restaurantAttributeEvidence.findMany({
          where: { sourceClass: 'places_api' },
          select: { restaurantId: true, attributeId: true },
        })
      ).map((r) => `${r.restaurantId}|${r.attributeId}`),
    );
    for (const row of rows) {
      const canonicals = new Set<string>();
      for (const type of row.types) {
        const canonical = GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP[type];
        if (canonical) canonicals.add(canonical);
      }
      for (const canonical of canonicals) {
        const attributeId = idsByName.get(canonical);
        const alreadyEvidenced =
          attributeId !== undefined &&
          existingEvidence.has(`${row.entity_id}|${attributeId}`);
        if (!alreadyEvidenced) {
          evidencePlan.push({ restaurantId: row.entity_id, canonical });
          perKindNew.set(canonical, (perKindNew.get(canonical) ?? 0) + 1);
        }
        if (
          attributeId === undefined ||
          !row.restaurant_attributes.includes(attributeId)
        ) {
          let set = arrayGrowth.get(row.entity_id);
          if (!set) arrayGrowth.set(row.entity_id, (set = new Set()));
          set.add(canonical);
        }
      }
    }

    out(`attribute entities to create: ${missing.length}`);
    out(`new places_api evidence rows: ${evidencePlan.length}`);
    out(`restaurants whose attribute array grows: ${arrayGrowth.size}`);
    out('per-kind new evidence counts:');
    for (const [kind, n] of [...perKindNew.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      out(`  ${kind}: ${n}`);
    }
    if (!apply) return;

    // Mint missing attribute entities with their vocabulary aliases — the
    // same shape as ensureRestaurantAttributeEntity (F363: aliases come from
    // the one vocabulary; surfaces are 'seed').
    for (const canonicalName of missing) {
      const created = await prisma.entity.create({
        data: {
          name: canonicalName,
          type: EntityType.restaurant_attribute,
          ...identityInsertData(canonicalName, EntityType.restaurant_attribute),
        },
        select: { entityId: true },
      });
      const seedAliases =
        RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME.get(canonicalName) ?? [];
      if (seedAliases.length) {
        await prisma.$transaction((tx) =>
          addSurfaces(
            tx,
            created.entityId,
            seedAliases.map((form) => ({ form, source: 'seed' as const })),
            { markEmbeddingStale: false },
          ),
        );
      }
      idsByName.set(canonicalName, created.entityId);
      out(`created attribute entity: ${canonicalName} (${created.entityId})`);
    }

    // Evidence rows (upsert-by-key, restating refreshes nothing here — pure
    // insert-if-absent, identical to recordAttributeEvidence).
    const evidenceData = evidencePlan
      .map(({ restaurantId, canonical }) => ({
        restaurantId,
        attributeId: idsByName.get(canonical)!,
        sourceClass: 'places_api',
        observations: 1,
      }))
      .filter((d) => d.attributeId);
    let inserted = 0;
    for (let i = 0; i < evidenceData.length; i += 5000) {
      const result = await prisma.restaurantAttributeEvidence.createMany({
        data: evidenceData.slice(i, i + 5000),
        skipDuplicates: true,
      });
      inserted += result.count;
    }
    out(`evidence rows inserted: ${inserted}`);

    // Merge-only array union, mirroring the live enrichment write.
    let arraysUpdated = 0;
    for (const [entityId, canonicals] of arrayGrowth) {
      const addIds = [...canonicals]
        .map((c) => idsByName.get(c))
        .filter((v): v is string => Boolean(v));
      if (!addIds.length) continue;
      await prisma.$executeRaw`
        UPDATE core_entities
           SET restaurant_attributes = (
             SELECT array_agg(DISTINCT v)
               FROM unnest(restaurant_attributes || ${addIds}::uuid[]) v
           )
         WHERE entity_id = ${entityId}::uuid
      `;
      arraysUpdated += 1;
    }
    out(`restaurant_attributes arrays updated: ${arraysUpdated}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
