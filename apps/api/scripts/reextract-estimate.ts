/**
 * @script-class: operational
 * @runner: rig/reextract.sh
 *
 * Operational tooling: a runner invokes this. Classes assigned by the
 * F414 sweep (2026-08-02) from the actual reference census, not by guess.
 */
/**
 * Create + approve the spend campaign for a shadow re-extraction —
 * the same manifest/approve-by-hash law as onboarding (§24.3).
 *
 *   npx ts-node scripts/reextract-estimate.ts --communities a,b --prompt-version N
 *   npx ts-node scripts/reextract-estimate.ts --communities a,b --prompt-version N \
 *        --approve-estimate <hash>
 *
 * Re-extraction replays EXISTING documents: no Places line (place-grounded
 * restaurants are never re-created — expectedNewRestaurants=0); the spend
 * is extraction/interactive/embedding over the doc count.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpendCampaignService } from '../src/modules/external-integrations/shared/spend-campaign.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { pricedGeminiRow } from '../src/modules/external-integrations/shared/gemini-pricing';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const communities = (arg('communities') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const promptVersion = arg('prompt-version');
  const approveHash = arg('approve-estimate');
  if (!communities.length || !promptVersion) {
    console.error(
      'Usage: reextract-estimate.ts --communities a,b --prompt-version N [--approve-estimate <hash>]',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const campaigns = app.get(SpendCampaignService);

    // 'all' expands to every community that actually has documents — the verb
    // list always promised `<communities|all>`, but this script used to pass
    // the literal string into `community = ANY(['all'])` and estimate a
    // $0.00 / 0-doc campaign (shakedown finding #3, first full-corpus run
    // 2026-08-10). A wrong-but-plausible small estimate would have been far
    // worse than the loud zero we got.
    let resolvedCommunities = communities;
    if (communities.length === 1 && communities[0].toLowerCase() === 'all') {
      const rows = await prisma.$queryRaw<Array<{ community: string }>>`
        SELECT DISTINCT community FROM collection_source_documents
        WHERE community IS NOT NULL ORDER BY community`;
      resolvedCommunities = rows.map((row) => row.community);
      if (!resolvedCommunities.length) {
        throw new Error('no communities found in collection_source_documents');
      }
      console.log(`'all' -> ${resolvedCommunities.join(', ')}`);
    }

    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM collection_source_documents
      WHERE community = ANY(${resolvedCommunities})`;
    const docCount = Number(count);
    const name = `reextract:${resolvedCommunities.join('+')}:v${promptVersion}`;

    // APPROVE THE EXISTING ROW (round-six cost red team #8): calling
    // prepareManifestEstimate again on the --approve-estimate pass minted a
    // SECOND campaign row and approved that one, stranding the first as
    // awaiting_approval forever — prod's single stranded row is exactly
    // this. If an awaiting row with this hash already exists, approve it.
    if (approveHash) {
      const existing = await prisma.spendCampaign.findFirst({
        where: {
          name,
          state: 'awaiting_approval',
          estimateHash: approveHash,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        await campaigns.approve(existing.campaignId, approveHash);
        console.log(
          `APPROVED existing campaign ${existing.campaignId}. Arm the shadow: ./scripts/rig/reextract.sh shadow ${resolvedCommunities.join(',')} ${promptVersion} ${existing.campaignId}`,
        );
        return;
      }
    }
    // THE CALL PLAN (owner ruling 2026-08-10): a re-extraction's quote is
    // built from CAMPAIGN-ATTRIBUTABLE rates — the callers THIS campaign
    // actually fires, priced from their own tagged ledger rows — never the
    // trailing umbrella (which inherited dead pre-taxonomy traffic, foreign
    // crons, and other lanes' untagged spend; first quote came out ~3x).
    // Extraction/gate/embedding keep their published rates (already
    // caller-scoped and batch-priced); only the interactive line is rebuilt.
    const REPLAY_INTERACTIVE_CALLERS = [
      'entity-resolution.match',
      'entity-resolution.match_batch',
      'attribute.place',
      'attribute.canonicalize_name',
      'aliases.claim_judge',
    ];
    const WINDOW_DAYS = 30;
    const callerRows = await prisma.$queryRaw<
      Array<{
        caller: string;
        model: string;
        mode: string | null;
        input_tokens: bigint;
        output_tokens: bigint;
        cached_tokens: bigint;
        calls: bigint;
      }>
    >`
      SELECT caller, model, mode,
             sum(input_tokens)  AS input_tokens,
             sum(output_tokens) AS output_tokens,
             sum(cached_tokens) AS cached_tokens,
             count(*)           AS calls
      FROM api_usage_ledger
      WHERE service = 'gemini'
        AND caller = ANY(${REPLAY_INTERACTIVE_CALLERS})
        AND created_at > now() - make_interval(days => ${WINDOW_DAYS}::int)
      GROUP BY caller, model, mode`;
    const [{ count: windowDocs }] = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT count(*) AS count FROM collection_source_documents
      WHERE collected_at > now() - make_interval(days => ${WINDOW_DAYS}::int)`;
    let interactiveMicros = 0;
    const perCaller = new Map<string, number>();
    for (const row of callerRows) {
      const micros = pricedGeminiRow({
        model: row.model,
        mode: row.mode,
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
        cachedTokens: Number(row.cached_tokens),
      });
      interactiveMicros += micros;
      perCaller.set(row.caller, (perCaller.get(row.caller) ?? 0) + micros);
    }
    const windowDocCount = Number(windowDocs);
    const trailingInteractivePerDoc =
      windowDocCount > 0 ? interactiveMicros / windowDocCount : 0;

    // REPLAY-PRIOR RATES (owner ruling 2026-08-12): a replay's best predictor
    // is the LAST COMPLETED replay's campaign-scoped actuals, not the trailing
    // window (which is polluted by non-replay traffic and modeled the gate as
    // if it re-fires — replays REUSE gate verdicts, so that line is $0 real).
    // The v7 campaign quoted $108 and cost $30 for exactly these two reasons.
    // When a completed reextract campaign exists, its per-doc actuals override
    // every gemini line; the gate line is pinned $0 with the reason printed.
    const priorRows = await prisma.$queryRaw<
      Array<{
        caller: string;
        model: string | null;
        mode: string | null;
        input_tokens: bigint;
        output_tokens: bigint;
        cached_tokens: bigint;
        docs: bigint | null;
      }>
    >`
      WITH last_replay AS (
        SELECT campaign_id, unit_count FROM spend_campaigns
        WHERE name LIKE 'reextract:%' AND state = 'completed'
        ORDER BY completed_at DESC NULLS LAST LIMIT 1)
      SELECT l.caller, l.model, l.mode,
             sum(l.input_tokens) AS input_tokens,
             sum(l.output_tokens) AS output_tokens,
             sum(l.cached_tokens) AS cached_tokens,
             (SELECT unit_count FROM last_replay) AS docs
      FROM api_usage_ledger l JOIN last_replay r ON l.campaign_id = r.campaign_id
      WHERE l.service = 'gemini' GROUP BY l.caller, l.model, l.mode`;
    let interactivePerDocMicros = trailingInteractivePerDoc;
    let replayPriorOverrides: Record<string, number> | null = null;
    if (priorRows.length && Number(priorRows[0].docs ?? 0) > 0) {
      const priorDocs = Number(priorRows[0].docs);
      const byClass = { extraction: 0, interactive: 0, embedding: 0 };
      for (const row of priorRows) {
        const micros = pricedGeminiRow({
          model: row.model,
          mode: row.mode,
          inputTokens: Number(row.input_tokens),
          outputTokens: Number(row.output_tokens),
          cachedTokens: Number(row.cached_tokens),
        });
        if (row.caller.includes('collection_extraction'))
          byClass.extraction += micros;
        else if (row.caller.startsWith('embedding'))
          byClass.embedding += micros;
        else byClass.interactive += micros;
      }
      interactivePerDocMicros = byClass.interactive / priorDocs;
      replayPriorOverrides = {
        'gemini.reddit_extraction': byClass.extraction / priorDocs,
        // Replays REUSE relevance-gate verdicts — this line is REAL $0, not
        // missing (printed explicitly, the $118-lesson discipline).
        'gemini.relevance_gate': 0,
        'gemini.interactive_pipeline': interactivePerDocMicros,
        'gemini.embedding': byClass.embedding / priorDocs,
      };
      console.log(
        `REPLAY-PRIOR rates: last completed replay campaign, ${priorDocs} docs ` +
          `(extraction $${(byClass.extraction / 1e6).toFixed(2)}, interactive $${(byClass.interactive / 1e6).toFixed(2)}, ` +
          `embedding $${(byClass.embedding / 1e6).toFixed(2)}; gate $0 — replays reuse verdicts). ` +
          `Trailing-window interactive would have been $${((trailingInteractivePerDoc * docCount) / 1e6).toFixed(2)}.`,
      );
    }
    console.log(
      `Call plan (interactive, per ${WINDOW_DAYS}d window of ${windowDocCount} docs):`,
    );
    for (const [caller, micros] of Array.from(perCaller.entries()).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${caller.padEnd(34)} $${(micros / 1e6).toFixed(2)}`);
    }
    if (windowDocCount === 0 || perCaller.size === 0) {
      throw new Error(
        'call plan has no measured window (no docs or no tagged caller rows) — refusing to quote from nothing',
      );
    }

    const estimate = await campaigns.prepareManifestEstimate({
      name,
      docCount,
      expectedNewRestaurants: 0,
      perDocRateOverrides: replayPriorOverrides ?? {
        'gemini.interactive_pipeline': interactivePerDocMicros,
      },
    });
    console.log(`Campaign: ${estimate.campaignId} (${name})`);
    console.log(`Docs: ${docCount}`);
    for (const line of estimate.lines) {
      console.log(
        `  ${line.workClass.padEnd(28)} $${(line.estimateMicros / 1e6).toFixed(2)}`,
      );
    }
    console.log(
      `TOTAL $${(estimate.totalEstimateMicros / 1e6).toFixed(2)}  tolerance ${(estimate.toleranceFraction * 100).toFixed(0)}%  envelope $${(estimate.envelopeMicros / 1e6).toFixed(2)}`,
    );
    console.log(`Estimate hash: ${estimate.estimateHash}`);

    if (!approveHash) {
      console.log(
        `\nNOT approved. Re-run with --approve-estimate ${estimate.estimateHash} after owner sign-off.`,
      );
      return;
    }
    await campaigns.approve(estimate.campaignId, approveHash);
    console.log(
      `APPROVED. Arm the shadow: ./scripts/rig/reextract.sh shadow ${resolvedCommunities.join(',')} ${promptVersion} ${estimate.campaignId}`,
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
