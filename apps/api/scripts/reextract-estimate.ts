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
 * Re-extraction replays EXISTING documents, so already-grounded restaurants
 * are never re-bought — but THE SHADOW IS THE FULL PIPELINE (2026-09-04):
 * the places a candidate prompt newly mints are Places-grounded inside the
 * shadow, metered into this campaign. The Places line is therefore a
 * MEASURED forecast: the mint count of the previous shadow of the SAME
 * community set (staging's v23 Austin shadow minted 986 places) times the
 * published google_places.enrichment rate. With no comparable prior shadow
 * the line is declared UNKNOWN out loud and priced at zero mints — the
 * envelope tolerance is then the only cover, and the report says so.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpendCampaignService } from '../src/modules/external-integrations/shared/spend-campaign.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { campaignAttributableRates } from '../src/modules/external-integrations/shared/gemini-pricing';
import { replayPriorUsable } from './lib/replay-prior-guard';
import { LLMChunkingService } from '../src/modules/external-integrations/llm/llm-chunking.service';
import { activeExtractionInputsJoinSql } from '../src/modules/content-processing/reddit-collector/extraction-scope.service';
import type {
  LLMModelInput,
  LLMPost,
} from '../src/modules/external-integrations/llm/llm.types';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

/** The model-facing payload size the pipeline would send (llm.service's
 *  lightweight projection), chars/4 — the pipeline's own estimator. */
function payloadTokens(input: LLMModelInput): number {
  return Math.floor(
    JSON.stringify({
      posts: input.posts.map((post) => ({
        id: post.id,
        subreddit: post.subreddit,
        title: post.title,
        content: post.content,
        extract_from_post: Boolean(post.extract_from_post),
        comments: post.comments.map((comment) => ({
          id: comment.id,
          content: comment.content,
          parent_id: comment.parent_id ?? null,
          ...(comment.context_only === true ? { context_only: true } : {}),
        })),
      })),
    }).length / 4,
  );
}

/**
 * RE-CHUNK PRICING (reply-chain windows, 2026-09-04). A replay that
 * re-windows with the current chunker (--rechunk / REEXTRACT_RECHUNK) does
 * not send the stored payloads, so its extraction line cannot be the
 * per-document prior as-is: the ancestor context duplicated across windows
 * and the extra calls' cached-prompt reads change the input tokens.
 * Measured, not guessed: the stored inputs of the communities' active runs
 * are priced against the CURRENT chunker's windows over the same
 * documents, and the ratio of all-in input token-equivalents (payload +
 * cached system prompt at 0.1x per call) scales the extraction line.
 */
async function rechunkMultiplier(
  prisma: PrismaService,
  chunker: LLMChunkingService,
  communities: string[],
  promptChars: number,
): Promise<{
  storedChunks: number;
  newChunks: number;
  storedTokens: number;
  newTokens: number;
  multiplier: number;
}> {
  // THE ACTIVE GENERATION HAS ONE DEFINITION (ExtractionScopeService):
  // both reads go through its exported join fragment, so this script never
  // spells the activation pointer itself.
  const activeInputs = `SELECT DISTINCT i.input_id ${activeExtractionInputsJoinSql()}
    WHERE d.community = ANY($1::text[]) AND d.platform <> 'poll_surface'`;
  const stored = await prisma.$queryRawUnsafe<
    Array<{ chunks: bigint; chars: bigint }>
  >(
    `SELECT count(*) AS chunks,
            coalesce(sum(length(ei.input_payload::text)), 0) AS chars
     FROM collection_extraction_inputs ei
     WHERE ei.input_id IN (${activeInputs})`,
    communities,
  );
  const docs = await prisma.$queryRawUnsafe<
    Array<{
      sourceType: 'post' | 'comment';
      sourceId: string;
      parentSourceId: string | null;
      title: string | null;
      body: string | null;
      scoreSnapshot: number | null;
      sourceCreatedAt: Date;
      community: string | null;
      rawPayload: Record<string, unknown> | null;
    }>
  >(
    `SELECT DISTINCT ON (d.document_id)
            d.source_type AS "sourceType", d.source_id AS "sourceId",
            d.parent_source_id AS "parentSourceId", d.title, d.body,
            d.score_snapshot AS "scoreSnapshot",
            d.source_created_at AS "sourceCreatedAt", d.community,
            d.raw_payload AS "rawPayload"
     ${activeExtractionInputsJoinSql()}
     WHERE d.community = ANY($1::text[]) AND d.platform = 'reddit'
     ORDER BY d.document_id`,
    communities,
  );
  docs.sort(
    (left, right) =>
      new Date(left.sourceCreatedAt).getTime() -
      new Date(right.sourceCreatedAt).getTime(),
  );
  const posts = new Map<string, LLMPost>();
  for (const doc of docs) {
    if (doc.sourceType !== 'post') continue;
    posts.set(doc.sourceId, {
      id: doc.sourceId,
      title: doc.title ?? '',
      content: doc.body ?? '',
      subreddit: doc.community ?? '',
      author: null,
      url: '',
      score: doc.scoreSnapshot ?? 0,
      created_at: new Date(doc.sourceCreatedAt).toISOString(),
      comments: [],
    });
  }
  for (const doc of docs) {
    if (doc.sourceType !== 'comment') continue;
    const raw = doc.rawPayload ?? {};
    const postId =
      (typeof raw.post_id === 'string' ? raw.post_id : null) ??
      doc.parentSourceId;
    const post = postId ? posts.get(postId) : undefined;
    if (!post) continue;
    post.comments.push({
      id: doc.sourceId,
      content: doc.body ?? '',
      author: null,
      score: doc.scoreSnapshot ?? 0,
      created_at: new Date(doc.sourceCreatedAt).toISOString(),
      parent_id:
        (typeof raw.parent_id === 'string' ? raw.parent_id : null) ??
        doc.parentSourceId,
      url: '',
    });
  }
  const { chunks } = chunker.createContextualChunks({
    posts: Array.from(posts.values()),
  });
  const promptReadTokens = Math.floor(promptChars / 4) * 0.1;
  const storedChunks = Number(stored[0]?.chunks ?? 0);
  const storedTokens =
    Math.floor(Number(stored[0]?.chars ?? 0) / 4) +
    storedChunks * promptReadTokens;
  const newTokens =
    chunks.reduce((sum, chunk) => sum + payloadTokens(chunk), 0) +
    chunks.length * promptReadTokens;
  return {
    storedChunks,
    newChunks: chunks.length,
    storedTokens: Math.round(storedTokens),
    newTokens: Math.round(newTokens),
    multiplier: storedTokens > 0 ? newTokens / storedTokens : 1,
  };
}

async function main(): Promise<void> {
  const communities = (arg('communities') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const promptVersion = arg('prompt-version');
  const approveHash = arg('approve-estimate');
  const rechunk = process.argv.includes('--rechunk');
  // --extraction-multiplier <x> --measured-from "<provenance>": a MEASURED
  // per-doc extraction cost multiplier for a candidate whose output shape
  // differs from the version the published rate was measured under (v24's
  // worksheet). Both halves are required together — a multiplier with no
  // stated measurement is a guess, and the no-fake-estimates law refuses it.
  const multiplierRaw = arg('extraction-multiplier');
  const multiplierProvenance = arg('measured-from');
  if ((multiplierRaw === undefined) !== (multiplierProvenance === undefined)) {
    throw new Error(
      '--extraction-multiplier and --measured-from must be given together (a multiplier states its measurement)',
    );
  }
  const extractionMultiplier =
    multiplierRaw !== undefined
      ? { value: Number(multiplierRaw), provenance: multiplierProvenance! }
      : null;
  if (
    extractionMultiplier &&
    (!Number.isFinite(extractionMultiplier.value) ||
      extractionMultiplier.value <= 0)
  ) {
    throw new Error(
      `--extraction-multiplier must be a positive number, got '${multiplierRaw}'`,
    );
  }
  if (!communities.length || !promptVersion) {
    console.error(
      'Usage: reextract-estimate.ts --communities a,b --prompt-version N [--rechunk] [--extraction-multiplier <x> --measured-from "<provenance>"] [--approve-estimate <hash>]',
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
    // The re-chunk measurement prints FIRST — it is a fact about the corpus
    // and the current chunker, worth seeing even when the quote below
    // refuses for want of a measured rate window.
    let rechunkMeasured: Awaited<ReturnType<typeof rechunkMultiplier>> | null =
      null;
    if (rechunk) {
      const prompt = await prisma.llmPrompt.findFirst({
        where: { kind: 'collection_system', version: Number(promptVersion) },
        select: { content: true },
      });
      if (!prompt) {
        throw new Error(`No prompt v${promptVersion} registered`);
      }
      rechunkMeasured = await rechunkMultiplier(
        prisma,
        app.get(LLMChunkingService),
        resolvedCommunities,
        prompt.content.length,
      );
      console.log(
        `RE-CHUNK: stored inputs ${rechunkMeasured.storedChunks} chunks / ${rechunkMeasured.storedTokens.toLocaleString()} input token-eq -> ` +
          `current chunker ${rechunkMeasured.newChunks} windows / ${rechunkMeasured.newTokens.toLocaleString()} input token-eq ` +
          `(x${rechunkMeasured.multiplier.toFixed(3)} on the extraction line).`,
      );
    }
    const name = `reextract:${resolvedCommunities.join('+')}:v${promptVersion}${rechunk ? ':rechunk' : ''}${extractionMultiplier ? `:x${extractionMultiplier.value}` : ''}`;

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
    // ONE RATE AUTHORITY (campaignAttributableRates): the priced-row
    // projection lives beside pricedGeminiRow so `mode` can never be dropped
    // from a hand-rolled GROUP BY here (batch rows would price 2x).
    const windowRates = await campaignAttributableRates(prisma, {
      kind: 'window',
      callers: REPLAY_INTERACTIVE_CALLERS,
      windowDays: WINDOW_DAYS,
    });
    const [{ count: windowDocs }] = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT count(*) AS count FROM collection_source_documents
      WHERE collected_at > now() - make_interval(days => ${WINDOW_DAYS}::int)`;
    const interactiveMicros = windowRates.geminiMicros;
    const perCaller = windowRates.byCaller;
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
    const [priorCampaign] = await prisma.$queryRaw<
      Array<{ campaign_id: string; unit_count: number | null; name: string }>
    >`
      SELECT campaign_id, unit_count, name FROM spend_campaigns
      WHERE name LIKE 'reextract:%' AND state = 'completed'
      ORDER BY completed_at DESC NULLS LAST LIMIT 1`;
    let interactivePerDocMicros = trailingInteractivePerDoc;
    let replayPriorOverrides: Record<string, number> | null = null;

    // THE PRIOR MUST BE COMPARABLE (scale/community guard, 2026-08-12): a
    // per-doc rate from a 200-doc single-community pilot does not transfer
    // to a 60k-doc all-corpus replay — fixed per-run costs amortize
    // differently and community mix changes doc size. The prior is used only
    // when the last completed replay covered the SAME community set, or its
    // scale is within 2x of this quote's doc count. Otherwise fall back to
    // the trailing window, loudly.
    let priorUsable = false;
    if (priorCampaign) {
      const verdict = replayPriorUsable({
        priorName: priorCampaign.name,
        priorDocs: Number(priorCampaign.unit_count ?? 0),
        thisCommunities: resolvedCommunities,
        docCount,
      });
      priorUsable = verdict.usable;
      if (!verdict.usable) {
        console.warn(
          `REPLAY-PRIOR SKIPPED: ${verdict.reason} — falling back to the ` +
            `trailing ${WINDOW_DAYS}d window rates.`,
        );
      }
    }
    if (priorUsable && priorCampaign) {
      const priorDocs = Number(priorCampaign.unit_count);
      // Same rate authority as the call plan — campaign-scoped this time.
      const priorRates = await campaignAttributableRates(prisma, {
        kind: 'campaign',
        campaignId: priorCampaign.campaign_id,
      });
      const byClass = { extraction: 0, interactive: 0, embedding: 0 };
      for (const row of priorRates.rows) {
        if (!row.priced) continue;
        if (row.caller.includes('collection_extraction'))
          byClass.extraction += row.micros;
        else if (row.caller.startsWith('embedding'))
          byClass.embedding += row.micros;
        else byClass.interactive += row.micros;
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
    // The window is the FALLBACK rate authority; when a comparable completed
    // replay priced every gemini line, an empty trailing window is expected
    // (staging idles between replays) and is not "quoting from nothing".
    if (
      !replayPriorOverrides &&
      (windowDocCount === 0 || perCaller.size === 0)
    ) {
      throw new Error(
        'call plan has no measured window (no docs or no tagged caller rows) — refusing to quote from nothing',
      );
    }

    // THE PLACES FORECAST (shadow grounding, 2026-09-04): places born under
    // the most recent prior shadow of these communities. A prior shadow that
    // covered only a subset of the requested communities is not a
    // measurement of this set and is reported as UNKNOWN, never scaled.
    const placesForecast = await forecastShadowPlaceMints(
      prisma,
      resolvedCommunities,
      Number.parseInt(promptVersion, 10),
    );
    if (placesForecast.kind === 'measured') {
      console.log(
        `PLACES forecast: MEASURED — the v${placesForecast.priorVersion} shadow of ` +
          `${placesForecast.communities.join(',')} minted ${placesForecast.mints} places; ` +
          `each is Places-grounded inside the shadow at the published google_places.enrichment rate.`,
      );
    } else {
      console.warn(
        `PLACES forecast: UNKNOWN — ${placesForecast.reason}. The Places line is priced at ` +
          `0 mints; the envelope tolerance is the only cover for shadow grounding spend. ` +
          `Report the ledger's Places line beside Gemini when this shadow closes.`,
      );
    }

    const perDocRateOverrides: Record<string, number> =
      replayPriorOverrides ?? {
        'gemini.interactive_pipeline': interactivePerDocMicros,
      };
    if (rechunkMeasured) {
      const publishedExtraction = await prisma.spendUnitCost.findUnique({
        where: {
          workClass_unit: {
            workClass: 'gemini.reddit_extraction',
            unit: 'document',
          },
        },
      });
      const baseExtractionRate =
        perDocRateOverrides['gemini.reddit_extraction'] ??
        publishedExtraction?.microUsdPerUnit;
      if (baseExtractionRate === undefined) {
        throw new Error(
          'no extraction rate to scale for --rechunk (no replay prior and no published gemini.reddit_extraction/document rate)',
        );
      }
      perDocRateOverrides['gemini.reddit_extraction'] =
        baseExtractionRate * rechunkMeasured.multiplier;
      console.log(
        `RE-CHUNK: extraction line scaled from $${(baseExtractionRate / 1e6).toFixed(6)}/doc ` +
          `to $${(perDocRateOverrides['gemini.reddit_extraction'] / 1e6).toFixed(6)}/doc.`,
      );
    }
    // THE FORECAST PRICES THE LINE (2026-09-05): the measured mint count was
    // printed and then the manifest was built with expectedNewPlaces: 0 —
    // a $0.00 Places line beside a "MEASURED — 986 mints" sentence. The v24
    // Austin manifest would have breached its envelope on the first
    // grounding call.
    const expectedNewPlaces =
      placesForecast.kind === 'measured' ? placesForecast.mints : 0;
    if (extractionMultiplier) {
      // A prompt version that changes OUTPUT shape changes the extraction
      // rate (v24's per-source worksheet: output tokens ×2.5, input ×1.15 on
      // 608 audit chunks). The published per-doc rate was measured under the
      // previous shape; the multiplier is the operator's measurement, stated
      // with its provenance in the manifest so it is never a guess.
      const base =
        perDocRateOverrides['gemini.reddit_extraction'] ??
        (
          await prisma.spendUnitCost.findUnique({
            where: {
              workClass_unit: {
                workClass: 'gemini.reddit_extraction',
                unit: 'document',
              },
            },
          })
        )?.microUsdPerUnit;
      if (base === undefined) {
        throw new Error(
          'no extraction rate to scale for --extraction-multiplier (no replay prior and no published gemini.reddit_extraction/document rate)',
        );
      }
      perDocRateOverrides['gemini.reddit_extraction'] =
        base * extractionMultiplier.value;
      console.log(
        `EXTRACTION MULTIPLIER x${extractionMultiplier.value} (${extractionMultiplier.provenance}): ` +
          `$${(base / 1e6).toFixed(6)}/doc -> $${(perDocRateOverrides['gemini.reddit_extraction'] / 1e6).toFixed(6)}/doc.`,
      );
    }
    const estimate = await campaigns.prepareManifestEstimate({
      name,
      docCount,
      expectedNewPlaces,
      perDocRateOverrides,
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

/**
 * Places born under the newest prior shadow of the SAME community set — the
 * measured input for the manifest's Places line. Rehearsal-born rows keep
 * their born run whatever happened to them since (flipped, rejected, merged
 * away), so the count is the shadow's true mint count, not its survivors.
 */
export async function forecastShadowPlaceMints(
  prisma: PrismaService,
  communities: string[],
  promptVersion: number,
): Promise<
  | {
      kind: 'measured';
      priorVersion: number;
      communities: string[];
      mints: number;
    }
  | { kind: 'unknown'; reason: string }
> {
  const rows = await prisma.$queryRaw<
    Array<{ version: number; communities: string[]; mints: number }>
  >`
    SELECT p.version,
           array_agg(DISTINCT r.metadata->>'subreddit') AS communities,
           count(*)::int AS mints
    FROM core_entities e
    JOIN collection_extraction_runs r ON r.extraction_run_id = e.born_extraction_run_id
    JOIN llm_prompts p ON p.content_hash = r.system_prompt_hash
    WHERE e.type = 'place'
      AND p.kind = 'collection_system'
      AND p.version <> ${promptVersion}
      AND r.metadata->>'subreddit' = ANY(${communities})
    GROUP BY p.version
    ORDER BY p.version DESC
    LIMIT 1`;
  const prior = rows[0];
  if (!prior) {
    return {
      kind: 'unknown',
      reason: `no prior shadow has minted places for ${communities.join(',')}`,
    };
  }
  const covered = new Set(prior.communities);
  const missing = communities.filter((community) => !covered.has(community));
  if (missing.length) {
    return {
      kind: 'unknown',
      reason: `the newest prior shadow (v${prior.version}) covered ${prior.communities.join(',')} but not ${missing.join(',')} — a partial set is not a measurement of this one`,
    };
  }
  return {
    kind: 'measured',
    priorVersion: prior.version,
    communities: prior.communities,
    mints: prior.mints,
  };
}

void main().catch((error: unknown) => {
  // LOUD FAILURE (final red team): `void main()` swallowed a thrown query
  // error and exited 0 with no output — activate-shadow silently no-opped
  // while reporting success, the worst possible outcome for the one
  // irreversible step. Never let a spend/mutation script exit 0 on error.
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
