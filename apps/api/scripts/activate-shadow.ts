/**
 * ACTIVATE a completed shadow re-extract: flip every target document's
 * active_extraction_run_id to its shadow run (no LLM re-spend — the shadow
 * outputs already exist), then rebuild projections for every affected
 * restaurant from the full surviving ledger (red team R5: cross-community
 * counters must rebuild too).
 *
 *   npx ts-node scripts/activate-shadow.ts --communities a,b --prompt-version N [--reviewed] [--execute]
 *
 * Dry-run by default: prints run/document counts and refuses to write.
 * --execute additionally requires --reviewed: the operator's attestation
 * that reload/shadow-diff.sql ran and its anchored LOST-SUPPORT rows got
 * owner decisions (big-one red team, gap 1b — activation is the one
 * irreversible step; the diff is its gate, not a suggestion).
 * Close with reload/anchor-audit.sql + gc-unsupported-entities.sql, then
 * prompt-activate.ts <N> so LIVE collection extracts under the new prompt.
 */
import { NestFactory } from '@nestjs/core';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CollectionEvidenceService } from '../src/modules/content-processing/reddit-collector/collection-evidence.service';
import { ProjectionRebuildService } from '../src/modules/content-processing/reddit-collector/projection-rebuild.service';
import { PromptRegistryService } from '../src/modules/external-integrations/llm/prompt-registry.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const communities = (arg('communities') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const promptVersion = Number.parseInt(arg('prompt-version') ?? '', 10);
  const execute = process.argv.includes('--execute');
  const reviewed = process.argv.includes('--reviewed');
  if (!communities.length || !Number.isFinite(promptVersion)) {
    console.error(
      'Usage: activate-shadow.ts --communities a,b --prompt-version N [--reviewed] [--execute]',
    );
    process.exit(1);
  }
  if (execute && !reviewed) {
    console.error(
      'REFUSED: --execute requires --reviewed. Run reload/shadow-diff.sql, resolve anchored LOST-SUPPORT rows with the owner, then re-run with --reviewed.',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const registry = app.get(PromptRegistryService);
    const evidence = app.get(CollectionEvidenceService);
    const rebuild = app.get(ProjectionRebuildService);

    const prompt = await registry.getVersion(promptVersion);
    // ONLY A CANDIDATE IS ACTIVATABLE (final red team): pointed at the
    // ACTIVE version this selects every historical run under that hash
    // (measured: 46 runs / 50,804 docs for v1) and would silently reshuffle
    // which run each document points at — a one-keystroke corpus mutation.
    if (prompt.status !== 'candidate') {
      throw new Error(
        `REFUSED: prompt v${promptVersion} is '${prompt.status}', not 'candidate'. ` +
          `activate-shadow only flips documents onto a candidate's shadow runs.`,
      );
    }
    const promptHash = createHash('sha256')
      .update(prompt.content)
      .digest('hex');

    // Shadow runs for these communities: completed runs under the candidate
    // hash whose input documents belong to the target communities.
    const runs = await prisma.$queryRaw<
      Array<{ run_id: string; doc_count: bigint }>
    >`
      SELECT r.extraction_run_id AS run_id, count(DISTINCT eid.document_id) AS doc_count
      FROM collection_extraction_runs r
      JOIN collection_extraction_inputs ei ON ei.extraction_run_id = r.extraction_run_id
      JOIN collection_extraction_input_documents eid ON eid.input_id = ei.input_id
      JOIN collection_source_documents d ON d.document_id = eid.document_id
      WHERE r.system_prompt_hash = ${promptHash}
        AND r.status = 'completed'
        AND d.community = ANY(${communities})
        AND d.platform <> 'poll_surface'
      GROUP BY r.extraction_run_id
      ORDER BY min(r.started_at)`;

    const totalDocs = runs.reduce((sum, run) => sum + Number(run.doc_count), 0);
    console.log(
      `Shadow runs for v${promptVersion} (${promptHash.slice(0, 12)}…): ${runs.length} runs, ${totalDocs} documents across ${communities.join(', ')}`,
    );

    // COMPLETENESS GATE (final red team D8): a breached campaign or failed
    // batches leave the shadow partially drained. The runner logs per-run
    // failures and still prints DONE, so a 60%-complete shadow looks
    // finished. Activating it yields a corpus half-extracted under each
    // prompt — and per D1 there is no way back.
    const [{ shadowed, total }] = await prisma.$queryRaw<
      Array<{ shadowed: bigint; total: bigint }>
    >`
      SELECT
        count(*) FILTER (WHERE EXISTS (
          SELECT 1
          FROM collection_extraction_input_documents eid
          JOIN collection_extraction_inputs ei ON ei.input_id = eid.input_id
          JOIN collection_extraction_runs r
            ON r.extraction_run_id = ei.extraction_run_id
          WHERE eid.document_id = d.document_id
            AND r.system_prompt_hash = ${promptHash}
            AND r.status = 'completed'
            AND ei.raw_output IS NOT NULL
        )) AS shadowed,
        count(*) AS total
      FROM collection_source_documents d
      WHERE d.community = ANY(${communities})
        AND d.platform <> 'poll_surface'`;
    const ratio = Number(total) > 0 ? Number(shadowed) / Number(total) : 0;
    const minRatioRaw = arg('allow-partial');
    const minRatio = minRatioRaw ? Number(minRatioRaw) / 100 : 0.99;
    console.log(
      `Shadow coverage: ${Number(shadowed)}/${Number(total)} docs (${(ratio * 100).toFixed(1)}%), floor ${(minRatio * 100).toFixed(1)}%`,
    );
    if (ratio < minRatio) {
      throw new Error(
        `REFUSED: shadow is only ${(ratio * 100).toFixed(1)}% complete. Let the batch queue drain, or accept explicitly with --allow-partial <pct>.`,
      );
    }

    if (!execute) {
      console.log('DRY RUN — re-run with --execute to flip activation.');
      return;
    }
    console.log(
      'WARNING: activation is ONE-WAY. activateRunForDocuments deletes the ' +
        "superseded runs' events for these documents, and compaction removes " +
        'the emptied runs within the hour — "flip back" would activate EMPTY ' +
        'runs. Rolling back means re-paying the full extraction.',
    );

    const affectedRestaurants = new Set<string>();
    let flipped = 0;
    for (const run of runs) {
      // OWNERSHIP PREDICATE (final red team D2): a document rides in MORE
      // THAN ONE run's inputs whenever it was pulled in as thread context
      // (extract_from_post=false) or by an overlapping keyword lane —
      // measured on prod: 13,912 docs (15.5%) have a non-owner run link.
      // Without this, whichever replay is processed LAST wins the pointer,
      // so a context-only replay (which extracted nothing) could take
      // ownership and the supersede-delete would destroy the real mentions.
      // Only flip docs whose CURRENT active run is the run we replayed.
      const docs = await prisma.$queryRaw<Array<{ document_id: string }>>`
        SELECT DISTINCT eid.document_id
        FROM collection_extraction_inputs ei
        JOIN collection_extraction_input_documents eid ON eid.input_id = ei.input_id
        JOIN collection_source_documents d ON d.document_id = eid.document_id
        JOIN collection_extraction_runs r
          ON r.extraction_run_id = ei.extraction_run_id
        WHERE ei.extraction_run_id = ${run.run_id}::uuid
          AND d.platform <> 'poll_surface'
          AND d.active_extraction_run_id
              = (r.metadata->>'replayOfExtractionRunId')::uuid`;
      const documentIds = docs.map((doc) => doc.document_id);
      const restaurants = await prisma.$queryRaw<
        Array<{ restaurant_id: string }>
      >`
        SELECT DISTINCT restaurant_id FROM core_restaurant_entity_events
        WHERE source_document_id = ANY(${documentIds}::uuid[])
        UNION
        SELECT DISTINCT restaurant_id FROM core_restaurant_events
        WHERE source_document_id = ANY(${documentIds}::uuid[])`;
      for (const row of restaurants) affectedRestaurants.add(row.restaurant_id);
      await evidence.activateRunForDocuments(run.run_id, documentIds);
      flipped += documentIds.length;
      if (flipped % 500 === 0) console.log(`  flipped ${flipped} documents…`);
    }
    console.log(`Activated ${runs.length} runs / ${flipped} documents.`);

    const restaurantIds = Array.from(affectedRestaurants);
    console.log(
      `Rebuilding projections for ${restaurantIds.length} restaurants (full surviving ledger — R5)…`,
    );
    await rebuild.rebuildForRestaurants(restaurantIds);
    console.log(
      'DONE. Close with: reload/anchor-audit.sql, reload/gc-unsupported-entities.sql, prompt-activate.ts, cost-reconcile.sh',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  // LOUD FAILURE (final red team): `void main()` swallowed a thrown query
  // error and exited 0 with no output — activate-shadow silently no-opped
  // while reporting success, the worst possible outcome for the one
  // irreversible step. Never let a spend/mutation script exit 0 on error.
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
