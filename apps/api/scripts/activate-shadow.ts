/**
 * @script-class: operational
 * @runner: rig/reextract.sh
 *
 * Operational tooling: a runner invokes this. Classes assigned by the
 * F414 sweep (2026-08-02) from the actual reference census, not by guess.
 */
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
import {
  consumeActivationPlan,
  resolveActivationPlan,
} from '../src/modules/content-processing/reddit-collector/activation-plan';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CollectionEvidenceService } from '../src/modules/content-processing/reddit-collector/collection-evidence.service';
import { ProjectionRebuildService } from '../src/modules/content-processing/reddit-collector/projection-rebuild.service';
import { RehearsalGenerationService } from '../src/modules/content-processing/reddit-collector/rehearsal-generation.service';
import { ExtractionScopeService } from '../src/modules/content-processing/reddit-collector/extraction-scope.service';
import { PromptRegistryService } from '../src/modules/external-integrations/llm/prompt-registry.service';
import { RescoreCoordinatorService } from '../src/modules/content-processing/public-crave-score/rescore-coordinator.service';
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
  const rollback = process.argv.includes('--rollback');
  if (!communities.length || !Number.isFinite(promptVersion)) {
    console.error(
      'Usage: activate-shadow.ts --communities a,b --prompt-version N [--reviewed] [--execute]',
    );
    process.exit(1);
  }
  // --rollback is the RECOVERY path: never gate an urgent flip-back on the
  // shadow-diff attestation (that gate exists for forward activation).
  if (execute && !reviewed && !rollback) {
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
    // ONE HOME for "owned / affected" (foundational re-derivation): this
    // script hand-rolled both and got both wrong (D2, D7).
    const scope = app.get(ExtractionScopeService);
    const rescore = app.get(RescoreCoordinatorService);

    const prompt = await registry.getVersion(promptVersion);

    if (rollback) {
      // ROLLBACK (the point of retain): every document whose ACTIVE run is
      // one of version N's shadow runs flips back to the run that shadow
      // replayed (metadata.replayOfExtractionRunId — written by
      // replay.service at submit time). The superseded generation's events
      // were retained, so this restores the previous graph exactly; the
      // projection rebuild re-derives it. Refuses if the old version's
      // events were already discarded.
      const promptHashForRollback = createHash('sha256')
        .update(prompt.content)
        .digest('hex');
      const flips = await prisma.$queryRaw<
        Array<{ document_id: string; old_run_id: string }>
      >`
        SELECT d.document_id, (r.metadata->>'replayOfExtractionRunId')::uuid AS old_run_id
        FROM collection_source_documents d
        JOIN collection_extraction_runs r
          ON r.extraction_run_id = d.active_extraction_run_id
        WHERE r.system_prompt_hash = ${promptHashForRollback}
          AND r.metadata->>'replayOfExtractionRunId' IS NOT NULL
          AND d.platform <> 'poll_surface'
          AND d.community = ANY(${communities})`;
      // NOT-ROLLED-BACK honesty (final-final red team #3ii): docs live
      // collection re-extracted since activation sit on live runs with NO
      // replay lineage — they cannot flip and correctly keep their newest
      // extraction. Report them; a silent partial rollback advertised as an
      // "exact round trip" is how the last accident class started.
      const [{ unrollable }] = await prisma.$queryRaw<
        Array<{ unrollable: bigint }>
      >`
        SELECT count(*) AS unrollable
        FROM collection_source_documents d
        JOIN collection_extraction_runs r
          ON r.extraction_run_id = d.active_extraction_run_id
        WHERE r.system_prompt_hash = ${promptHashForRollback}
          AND r.metadata->>'replayOfExtractionRunId' IS NULL
          AND d.platform <> 'poll_surface'
          AND d.community = ANY(${communities})`;
      console.log(
        `Rollback of v${promptVersion}: ${flips.length} documents flip back; ${Number(unrollable)} stay on live re-extractions (no replay lineage — they keep their newest extraction).`,
      );
      if (!flips.length) return;
      const [{ orphaned }] = await prisma.$queryRaw<
        Array<{ orphaned: bigint }>
      >`
        SELECT count(*) AS orphaned FROM (
          SELECT DISTINCT (r.metadata->>'replayOfExtractionRunId')::uuid AS old_run
          FROM collection_source_documents d
          JOIN collection_extraction_runs r
            ON r.extraction_run_id = d.active_extraction_run_id
          WHERE r.system_prompt_hash = ${promptHashForRollback}
            AND r.metadata->>'replayOfExtractionRunId' IS NOT NULL
            AND d.community = ANY(${communities})
        ) o
        WHERE NOT EXISTS (
          SELECT 1 FROM collection_extraction_runs pr
          WHERE pr.extraction_run_id = o.old_run
        )`;
      if (Number(orphaned) > 0) {
        throw new Error(
          `REFUSED: ${Number(orphaned)} pre-activation runs no longer exist — the old generation was discarded. Rollback would activate nothing; recovery is a re-extraction.`,
        );
      }
      if (!execute) {
        console.log('DRY RUN — re-run with --rollback --execute to flip back.');
        return;
      }
      const byOldRun = new Map<string, string[]>();
      for (const flip of flips) {
        const list = byOldRun.get(flip.old_run_id) ?? [];
        list.push(flip.document_id);
        byOldRun.set(flip.old_run_id, list);
      }
      const affected = new Set<string>();
      for (const [oldRunId, docIds] of byOldRun) {
        for (const id of await scope.affectedPlacesForDocuments(docIds))
          affected.add(id);
        await evidence.activateRunForDocuments(oldRunId, docIds, {
          supersede: 'retain',
        });
      }
      console.log(
        `Flipped ${flips.length} documents back across ${byOldRun.size} runs. Rebuilding ${affected.size} restaurants…`,
      );
      await rebuild.rebuildForPlaces(Array.from(affected));
      // Scores must follow the graph (product red team F3): without this,
      // search serves generation-A ranking over generation-B filters until
      // an unrelated collection batch happens to dirty the flag.
      await rescore.markDirty(`shadow rollback v${promptVersion}`);
      console.log(
        'ROLLBACK DONE. Remember: if the prompt was already activated for live collection, run prompt-activate for the previous version too.',
      );
      return;
    }
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
    // The denominator is REPLAYABLE docs only (those with an active
    // extraction run) — a doc the gate rejected or that never reached
    // extraction has nothing to replay, and counting it made a 99.96%
    // shadow read as 97.5% (v7 campaign, 2026-08-10: 2,224 of a 2,258-doc
    // "gap" had no active run at all). The excluded count is printed so a
    // large unreplayable population is visible, never silent.
    const [{ shadowed, total, unreplayable }] = await prisma.$queryRaw<
      Array<{ shadowed: bigint; total: bigint; unreplayable: bigint }>
    >`
      SELECT
        count(*) FILTER (WHERE d.active_extraction_run_id IS NOT NULL AND EXISTS (
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
        count(*) FILTER (WHERE d.active_extraction_run_id IS NOT NULL) AS total,
        count(*) FILTER (WHERE d.active_extraction_run_id IS NULL) AS unreplayable
      FROM collection_source_documents d
      WHERE d.community = ANY(${communities})
        AND d.platform <> 'poll_surface'`;
    console.log(
      `Unreplayable docs excluded from coverage: ${Number(unreplayable)} (no active extraction run — gate-rejected or pre-extraction backlog)`,
    );
    const ratio = Number(total) > 0 ? Number(shadowed) / Number(total) : 0;
    const minRatioRaw = arg('allow-partial');
    // A3: arg() returns the NEXT argv token, so `--allow-partial --execute`
    // yielded NaN and `ratio < NaN` is false — the 99% floor silently
    // vanished. A malformed value must refuse, never open the gate.
    const minRatio = minRatioRaw ? Number(minRatioRaw) / 100 : 0.99;
    if (!Number.isFinite(minRatio) || minRatio <= 0 || minRatio > 1) {
      throw new Error(
        `REFUSED: --allow-partial needs a percentage 1-100, got '${String(minRatioRaw)}'.`,
      );
    }
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
      'Activation RETAINS the superseded generation (rollback is a pointer ' +
        'flip: --rollback). Space is reclaimed only when you explicitly ' +
        'discard the old version after you are confident.',
    );

    // PLAN BEFORE MUTATING (crash-consistency red team A1 — CRITICAL).
    // The affected-restaurant set used to be accumulated INSIDE the flip
    // loop from documentsOwnedByRun(), whose predicate is
    // "docs still pointing at the run I replayed" — a predicate ACTIVATION
    // ITSELF DESTROYS. So a crash-resume returned [] for every already-
    // flipped run, rebuilt only the tail, and left the first half serving
    // generation-A projections over a generation-B ledger FOREVER, while
    // printing success. The pointer flip is idempotent; the rebuild was not.
    //
    // Now: resolve the entire plan (documents + affected restaurants) up
    // front, persist it, and on a RESUME read the artifact back — never
    // recompute (F9976: activation destroys the predicate the plan is
    // computed from, so a recomputing resume skipped every already-flipped
    // run's rebuild AND clobbered the recovery file with the empty plan).
    const planPath = join(
      process.env.HOME ?? '.',
      `.crave-activation-plan-v${promptVersion}-${communities.join('+')}.json`,
    );
    const resolved = await resolveActivationPlan({
      planPath,
      promptVersion,
      communities,
      compute: async () => {
        const plan: Array<{ runId: string; documentIds: string[] }> = [];
        const affectedPlaces = new Set<string>();
        for (const run of runs) {
          const documentIds = await scope.documentsOwnedByRun(run.run_id);
          if (!documentIds.length) continue;
          plan.push({ runId: run.run_id, documentIds });
          for (const id of await scope.affectedPlacesForDocuments(documentIds))
            affectedPlaces.add(id);
        }
        return { plan, placeIds: Array.from(affectedPlaces) };
      },
    });
    const { plan, placeIds } = resolved.plan;
    console.log(
      `${resolved.resumed ? 'RESUMED plan' : 'Plan'}: ${plan.length} runs, ${plan.reduce((n, p) => n + p.documentIds.length, 0)} documents, ${placeIds.length} restaurants → ${planPath}`,
    );
    if (!plan.length) {
      console.log('Nothing to activate.');
      consumeActivationPlan(planPath);
      return;
    }

    // REHEARSAL FLIP FIRST (plans/shadow-sandbox.md): the shadow's mints
    // become real BEFORE any document pointer moves, so a reader never sees
    // an active generation whose entities are still invisible. Keyed by the
    // plan's run ids; idempotent (a resume re-runs it as a no-op).
    const rehearsal = app.get(RehearsalGenerationService);
    const flippedGeneration = await rehearsal.flip(plan.map((p) => p.runId));
    console.log(
      `Rehearsal flip: ${flippedGeneration.entities} entities, ${flippedGeneration.surfaces} surfaces, ${flippedGeneration.verdicts} verdicts -> live.`,
    );

    let flipped = 0;
    for (const step of plan) {
      // RETAIN (rollback re-derivation): a generation switch keeps the
      // superseded events — readers filter on the active run, so they are
      // inert, and rollback stays a pointer flip. Space is reclaimed only
      // by explicitly discarding the old version.
      await evidence.activateRunForDocuments(step.runId, step.documentIds, {
        supersede: 'retain',
      });
      flipped += step.documentIds.length;
      if (flipped % 500 === 0) console.log(`  flipped ${flipped} documents…`);
    }
    console.log(`Activated ${plan.length} runs / ${flipped} documents.`);

    // Mark dirty BEFORE the rebuild (A5): over-marking is free; a crash
    // between rebuild and mark would otherwise leave new filters with old
    // ranking — the exact window markDirty exists to close.
    await rescore.markDirty(`shadow activation v${promptVersion}`);
    // CHUNKED (A2): one transaction over every affected restaurant (2,631
    // for austinfood alone) risks the 15-min timeout AND holds the GLOBAL
    // food-category-edge advisory lock for its whole duration, stalling
    // live collection. The repair sweep already batches at 100; activation
    // now uses the same bound.
    const REBUILD_CHUNK = 100;
    console.log(
      `Rebuilding projections for ${placeIds.length} restaurants in chunks of ${REBUILD_CHUNK} (full surviving ledger — R5)…`,
    );
    for (let i = 0; i < placeIds.length; i += REBUILD_CHUNK) {
      await rebuild.rebuildForPlaces(placeIds.slice(i, i + REBUILD_CHUNK));
      if ((i / REBUILD_CHUNK) % 5 === 0 && i > 0) {
        console.log(`  rebuilt ${i}/${placeIds.length}…`);
      }
    }
    // The artifact is consumed only on FULL success — a crash anywhere above
    // leaves it in place as the authority for the resume.
    consumeActivationPlan(planPath);
    if (flippedGeneration.flippedPlaceIds.length) {
      console.log(
        `DEFERRED MACHINERY: ${flippedGeneration.flippedPlaceIds.length} newly-live restaurants need enrichment — the mention-driven queue re-attempts on next collection touch, or run the enrichment janitor now. Attribute adjudication fires on the next banked batch's debounce.`,
      );
    }
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
