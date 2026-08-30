/**
 * @script-class: operational
 * @runner: .claude/SKILL.md
 *
 * GHOST RE-GROUNDING SWEEP (data-audit round 2, ghost attribution 2026-08-07;
 * plans/data-audit-2026-08.md "GHOST RESTAURANT ATTRIBUTION").
 *
 * 1,626 active restaurants are suggestible by name but invisible in search
 * and on the map (no grounded location). Attribution found three causes, all
 * now fixed upstream of this script: the type-gate veto on the LLM chooser is
 * removed, the chooser prompt judges store-typed candidates by the source
 * text's mode of consumption, and enrichment failures are retryable.
 *
 * This script is the RECOVERY arm plus the TOMBSTONE arm:
 *
 *   --limit=N (default 100)  Re-run real grounding, SYNCHRONOUSLY, for N
 *     ghosts, deriving each ghost's locale+bias from its own majority
 *     community via the ONE dispatch-context builder (unified-processing).
 *     Prints matched / no_match / error counts — the measured recovery rate
 *     that decides whether the remaining tranche runs (act, then measure).
 *
 *   --tombstone-closed  Archives ghosts whose last enrichment attempt was
 *     Google's own CLOSED_PERMANENTLY verdict, so autocomplete stops
 *     suggesting corpses. NEVER touches user-anchored entities (anything a
 *     user list points at) and never deletes anything — archived entities
 *     keep every event and can be revived.
 *
 *   --dry-run  Print what would happen, spend nothing, change nothing.
 *
 *   yarn workspace api ts-node scripts/reground-ghosts.ts --limit=100
 *   yarn workspace api ts-node scripts/reground-ghosts.ts --tombstone-closed
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlaceLocationEnrichmentService } from '../src/modules/restaurant-enrichment';
import { UnifiedProcessingService } from '../src/modules/content-processing/reddit-collector/unified-processing.service';
import {
  GroundingSweepHaltError,
  GroundingSweepTripwire,
} from '../src/modules/restaurant-enrichment/grounding-sweep-tripwire';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface GhostRow {
  entity_id: string;
  name: string;
  community: string | null;
  last_reason: string | null;
  user_anchored: boolean;
}

/** Ghosts, each with its majority community and whether any user list
 *  points at it (directly or through a connection). */
const GHOSTS_SQL = `
  SELECT
    c.entity_id,
    c.name,
    (SELECT d.community
       FROM core_restaurant_entity_events e
       JOIN collection_source_documents d ON d.document_id = e.source_document_id
      WHERE e.restaurant_id = c.entity_id AND d.community IS NOT NULL
      GROUP BY d.community ORDER BY count(*) DESC LIMIT 1) AS community,
    c.restaurant_metadata->'lastEnrichmentAttempt'->>'reason' AS last_reason,
    EXISTS (
      SELECT 1 FROM user_list_items uli
       WHERE uli.restaurant_id = c.entity_id
          OR uli.connection_id IN (
              SELECT ri.connection_id FROM core_restaurant_items ri
               WHERE ri.restaurant_id = c.entity_id)
    ) AS user_anchored
  FROM core_entities c
  WHERE c.type = 'place' AND c.status = 'active'
    AND c.restaurant_metadata->'googlePlaces'->>'placeId' IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM core_restaurant_locations l
       WHERE l.restaurant_id = c.entity_id AND l.google_place_id IS NOT NULL)
`;

async function main(): Promise<void> {
  const arg = (name: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=')[1] : undefined;
  };
  const flag = (name: string): boolean => process.argv.includes(`--${name}`);

  const limit = parseInt(arg('limit') ?? '100', 10);
  const tombstoneClosed = flag('tombstone-closed');
  const dryRun = flag('dry-run');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const prisma = app.get(PrismaService);
  const enrichment = app.get(PlaceLocationEnrichmentService);
  const unified = app.get(UnifiedProcessingService);

  if (tombstoneClosed) {
    const closed = await prisma.$queryRawUnsafe<GhostRow[]>(
      `${GHOSTS_SQL} AND c.restaurant_metadata->'lastEnrichmentAttempt'->>'reason' = 'place permanently closed'`,
    );
    const anchored = closed.filter((g) => g.user_anchored);
    const archivable = closed.filter((g) => !g.user_anchored);
    console.log(
      `permanently-closed ghosts: ${closed.length} (user-anchored, KEPT: ${anchored.length}; archivable: ${archivable.length})`,
    );
    anchored.forEach((g) => console.log(`  kept (user-anchored): ${g.name}`));
    if (!dryRun && archivable.length) {
      const result = await prisma.entity.updateMany({
        where: { entityId: { in: archivable.map((g) => g.entity_id) } },
        data: { status: 'archived' },
      });
      console.log(
        `archived ${result.count} — Google's own CLOSED_PERMANENTLY verdict; events retained, revivable`,
      );
    } else if (dryRun) {
      archivable
        .slice(0, 20)
        .forEach((g) => console.log(`  would archive: ${g.name}`));
    }
    await app.close();
    return;
  }

  const ghosts = await prisma.$queryRawUnsafe<GhostRow[]>(
    `${GHOSTS_SQL}
      AND coalesce(c.restaurant_metadata->'lastEnrichmentAttempt'->>'reason','')
          <> 'place permanently closed'
      ORDER BY (
        SELECT count(*) FROM core_restaurant_entity_events e
         WHERE e.restaurant_id = c.entity_id) DESC
      LIMIT ${Math.max(1, limit)}`,
  );
  console.log(
    `re-grounding ${ghosts.length} ghosts (evidence-heavy first)${dryRun ? ' [DRY RUN]' : ''}`,
  );

  const tally = { updated: 0, no_match: 0, error: 0, skipped: 0 } as Record<
    string,
    number
  >;
  // R1's alarm: a run declining >90% after 20+ judged attempts is a broken
  // judge, not that many correct rejections — halt before spending strikes.
  const tripwire = new GroundingSweepTripwire();
  const contextCache = new Map<
    string,
    Awaited<
      ReturnType<
        UnifiedProcessingService['resolvePlaceEnrichmentDispatchContext']
      >
    >
  >();

  for (const ghost of ghosts) {
    const communityKey = ghost.community ?? '';
    if (!contextCache.has(communityKey)) {
      contextCache.set(
        communityKey,
        await unified.resolvePlaceEnrichmentDispatchContext(ghost.community),
      );
    }
    const context = contextCache.get(communityKey)!;

    if (dryRun) {
      console.log(
        `  would enrich: ${ghost.name} [${ghost.community ?? 'no community'}] bias=${context.locationBias ? 'yes' : 'NO'}`,
      );
      continue;
    }

    const result = await enrichment.enrichPlaceById(ghost.entity_id, {
      sourceLocale: context.sourceLocale ?? undefined,
      countryCode: context.countryCode ?? undefined,
      locationBias: context.locationBias ?? undefined,
      // Re-attempting known failures after a root-cause fix is this
      // script's entire purpose — bypass the terminal-failure money guard.
      retryTerminal: true,
      // sourceText intentionally omitted: the service derives the
      // highest-upvote mention snippet itself now — one implementation
      // for every lane, not a script-local copy.
    });
    tally[result.status] = (tally[result.status] ?? 0) + 1;
    console.log(
      `  ${result.status.padEnd(8)} ${ghost.name}${result.status !== 'updated' ? ` (${result.reason ?? ''})` : ''}`,
    );
    try {
      tripwire.record(result.status);
    } catch (error) {
      if (error instanceof GroundingSweepHaltError) {
        console.error(`\n!!! ${error.message}`);
        console.error(`tally so far: ${JSON.stringify(tally)}`);
        await app.close();
        process.exit(2);
      }
      throw error;
    }
  }

  if (!dryRun) {
    const attempted = ghosts.length || 1;
    console.log(`\n--- RECOVERY RATE ---`);
    Object.entries(tally).forEach(([status, count]) =>
      console.log(
        `${status.padEnd(8)} ${count}  (${((100 * count) / attempted).toFixed(1)}%)`,
      ),
    );
    console.log(
      `\nDecision input: 'updated' is the recovery rate for the remaining tranche.`,
    );
  }

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
