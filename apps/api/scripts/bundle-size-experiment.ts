/**
 * @script-class: probe
 *
 * BUNDLE-SIZE EXPERIMENT — plans/bundle-size-experiment.md (2026-08-30).
 *
 * Measures docs-per-chunk ∈ {10, 20, 30} on ONE fixed deterministic sample
 * of ~1,500 austinfood docs (posts taken in md5(source_id) order until the
 * cumulative comment count reaches the target; every arm replays the SAME
 * docs). Chunking runs through the REAL LLMChunkingService (per arm the
 * docs cap is set before constructing a fresh instance), extraction runs
 * through the REAL LLMService.processContent with the committed candidate
 * prompt (collection-prompt.candidate.md) as systemPromptOverride — the
 * production schema/model/config path, zero DB writes.
 *
 * Metrics per arm (design §Metrics):
 *   1. adoption panel hits (loop-3 sids present in the sample) + whole-sample
 *      short-reply emission rate (adoption-shaped heuristic)
 *   2. doc coverage (slots with ≥1 citing mention) + mention volume
 *   3. junk-shape rate (wild-A/B classifier) + error/refusal count
 *   4. first-vs-last-quintile emission delta within chunks (fatigue)
 *   5. tokens + priced cost (gemini-pricing) per arm / per 1k docs
 *
 *   DATABASE_URL=<staging> yarn workspace api ts-node \
 *     scripts/bundle-size-experiment.ts --sample-docs=1500 \
 *     --adoption-file=... --shared-file=... --out=/abs/results.json
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { LLMChunkingService } from '../src/modules/external-integrations/llm/llm-chunking.service';
import {
  LLMModelInput,
  LLMPost,
  LLMComment,
} from '../src/modules/external-integrations/llm/llm.types';
import { geminiCostMicros } from '../src/modules/external-integrations/shared/gemini-pricing';
import { LoggerService } from '../src/shared';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

type Mention = Record<string, unknown>;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same junk classifier as scripts/wild-ab-loop4.ts. */
const JUNK_ITEM_TERMS = new Set([
  'mexican',
  'italian',
  'japanese',
  'chinese',
  'thai',
  'indian',
  'korean',
  'vietnamese',
  'french',
  'greek',
  'mediterranean',
  'tex mex',
  'american',
  'bbq',
  'sicilian',
  'cajun',
  'peruvian',
  'halal',
  'vegan',
  'vegetarian',
  'gluten free',
  'lunch',
  'dinner',
  'late night',
  'happy hour',
  'takeout',
  'delivery',
  'dine in',
  'comfort food',
  'street food',
  'buffet',
  'tasting menu',
  'prix fixe',
  'special',
  'daily special',
  'plate',
  'menu',
  'food',
  'restaurant',
]);

function isJunkMention(m: Mention): boolean {
  const place =
    typeof m.place_observed === 'string' ? fold(m.place_observed) : '';
  const item = typeof m.item === 'string' ? fold(m.item) : '';
  return (
    !place ||
    JUNK_ITEM_TERMS.has(place) ||
    Boolean(item && JUNK_ITEM_TERMS.has(item))
  );
}

function citesSid(m: Mention, sid: string): boolean {
  return m.source_id === sid || m.place_source_id === sid;
}

type DocRow = {
  source_id: string;
  source_type: string;
  parent_source_id: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  score_snapshot: number | null;
  source_created_at: Date | null;
};

async function main(): Promise<void> {
  const arg = (name: string, fallback?: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : fallback;
  };
  const sampleTarget = parseInt(arg('sample-docs', '1500') as string, 10);
  const arms = (arg('arms', '30,20,10') as string)
    .split(',')
    .map((a) => parseInt(a.trim(), 10));
  const community = arg('community', 'austinfood') as string;
  const adoptionFile = arg('adoption-file');
  const sharedFile = arg('shared-file');
  const outFile = arg('out');
  const concurrency = parseInt(arg('concurrency', '6') as string, 10);

  const candPrompt = readFileSync(
    join(PROMPT_DIR, 'collection-prompt.candidate.md'),
    'utf-8',
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const prisma = app.get(PrismaService);
  const llm = app.get(LLMService);
  const loggerService = app.get(LoggerService);

  // ---- fixed deterministic sample -------------------------------------
  // Posts in md5(source_id) order; take a prefix until the cumulative
  // comment count reaches the target. Same docs every arm by construction.
  const postRows = await prisma.$queryRawUnsafe<Array<{ source_id: string }>>(
    `SELECT d.source_id
       FROM collection_source_documents d
      WHERE d.community = $1 AND d.source_type = 'post'
      ORDER BY md5(d.source_id)`,
    community,
  );
  const samplePosts: string[] = [];
  const postInputs = new Map<string, LLMPost>();
  let totalComments = 0;

  for (const row of postRows) {
    if (totalComments >= sampleTarget) break;
    const post = (
      await prisma.$queryRawUnsafe<DocRow[]>(
        `SELECT source_id, source_type, parent_source_id, title, body, url,
                score_snapshot, source_created_at
           FROM collection_source_documents
          WHERE source_id = $1 AND source_type = 'post'`,
        row.source_id,
      )
    )[0];
    if (!post) continue;
    const comments = await prisma.$queryRawUnsafe<DocRow[]>(
      `WITH RECURSIVE thread AS (
         SELECT source_id, source_type, parent_source_id, title, body, url,
                score_snapshot, source_created_at
           FROM collection_source_documents
          WHERE parent_source_id = $1 AND source_type = 'comment'
         UNION ALL
         SELECT c.source_id, c.source_type, c.parent_source_id, c.title,
                c.body, c.url, c.score_snapshot, c.source_created_at
           FROM collection_source_documents c
           JOIN thread t ON c.parent_source_id = t.source_id
          WHERE c.source_type = 'comment')
       SELECT * FROM thread ORDER BY source_id`,
      post.source_id,
    );
    if (!comments.length) continue; // comment-less posts add no chunk variance
    const llmComments: LLMComment[] = comments.map((c) => ({
      id: c.source_id,
      content: c.body ?? '',
      author: null,
      score: c.score_snapshot ?? 0,
      created_at: c.source_created_at
        ? new Date(c.source_created_at).toISOString()
        : null,
      parent_id: c.parent_source_id,
      url: c.url ?? '',
    }));
    postInputs.set(post.source_id, {
      id: post.source_id,
      title: post.title ?? '',
      content: post.body ?? '',
      subreddit: community,
      author: null,
      url: post.url ?? '',
      score: post.score_snapshot ?? 0,
      created_at: post.source_created_at
        ? new Date(post.source_created_at).toISOString()
        : null,
      comments: llmComments,
      extract_from_post: true,
    });
    samplePosts.push(post.source_id);
    totalComments += comments.length;
  }

  const commentBodies = new Map<string, { body: string; parent: string }>();
  for (const p of postInputs.values())
    for (const c of p.comments)
      commentBodies.set(c.id, { body: c.content, parent: c.parent_id ?? '' });

  console.log(
    `SAMPLE: ${samplePosts.length} posts, ${totalComments} comments (target ${sampleTarget}), md5 order, community=${community}`,
  );

  const readSids = (file?: string): string[] =>
    file
      ? readFileSync(file, 'utf-8')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
  const sampleSidSet = new Set(commentBodies.keys());
  const adoptionSids = readSids(adoptionFile).filter((s) =>
    sampleSidSet.has(s),
  );
  const sharedSids = readSids(sharedFile).filter((s) => sampleSidSet.has(s));
  console.log(
    `PANEL OVERLAP: adoption ${adoptionSids.length}/${readSids(adoptionFile).length}, shared ${sharedSids.length}/${readSids(sharedFile).length}`,
  );

  // ---- arms -----------------------------------------------------------
  type ChunkRun = {
    slots: string[]; // ordered doc-slot sids (post id first when extractable)
    mentions: Mention[];
    error?: string;
    usage?: Record<string, number>;
  };
  const armResults: Record<string, unknown> = {};

  for (const armSize of arms) {
    process.env.LLM_CHUNK_MAX_DOCS = String(armSize);
    const chunker = new LLMChunkingService(loggerService);
    chunker.onModuleInit();

    // Build chunks per post (production is same-post packing only).
    const chunkRuns: ChunkRun[] = [];
    for (const postId of samplePosts) {
      const input: LLMModelInput = { posts: [postInputs.get(postId)!] };
      const { chunks } = chunker.createContextualChunks(input);
      for (const chunk of chunks) {
        const slots: string[] = [];
        for (const p of chunk.posts) {
          if (p.extract_from_post !== false) slots.push(p.id);
          for (const c of p.comments) slots.push(c.id);
        }
        chunkRuns.push({ slots, mentions: [] });
        (
          chunkRuns[chunkRuns.length - 1] as ChunkRun & { payload?: unknown }
        ).payload = //
          chunk;
      }
    }
    const docsPerChunk =
      chunkRuns.reduce((s, c) => s + c.slots.length, 0) / chunkRuns.length;
    console.log(
      `\nARM ${armSize}: ${chunkRuns.length} chunks, avg ${docsPerChunk.toFixed(1)} slots/chunk`,
    );

    // Run with bounded concurrency.
    let cursor = 0;
    let done = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        for (;;) {
          const idx = cursor++;
          const run = chunkRuns[idx] as
            | (ChunkRun & { payload?: unknown })
            | undefined;
          if (!run) return;
          try {
            const parsed = await llm.processContent(
              run.payload as never,
              candPrompt,
            );
            run.mentions = Array.isArray(parsed?.mentions)
              ? (parsed.mentions as unknown as Mention[])
              : [];
            const u = parsed.usageMetadata as Record<string, number> | null;
            if (u)
              run.usage = {
                input: u.promptTokenCount ?? 0,
                output:
                  (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
                cached: u.cachedContentTokenCount ?? 0,
              };
          } catch (error) {
            run.error = error instanceof Error ? error.message : String(error);
          }
          delete run.payload;
          done += 1;
          if (done % 20 === 0)
            console.log(`  arm ${armSize}: ${done}/${chunkRuns.length}`);
        }
      }),
    );

    // ---- score arm ----------------------------------------------------
    const okRuns = chunkRuns.filter((r) => !r.error);
    const citedBy = new Map<string, number>(); // sid -> mention count citing it
    let mentionTotal = 0;
    let junk = 0;
    for (const run of okRuns) {
      mentionTotal += run.mentions.length;
      for (const m of run.mentions) {
        if (isJunkMention(m)) junk += 1;
        for (const key of ['source_id', 'place_source_id']) {
          const sid = asStr(m[key]);
          if (sid) citedBy.set(sid, (citedBy.get(sid) ?? 0) + 1);
        }
      }
    }
    const okSlots = okRuns.flatMap((r) => r.slots);
    const covered = okSlots.filter((s) => citedBy.has(s)).length;

    // fatigue: quintile position within chunks of >=5 slots
    const quintiles = Array.from({ length: 5 }, () => ({ n: 0, hit: 0 }));
    for (const run of okRuns) {
      if (run.slots.length < 5) continue;
      run.slots.forEach((sid, i) => {
        const q = Math.min(4, Math.floor((i * 5) / run.slots.length));
        quintiles[q].n += 1;
        if (citedBy.has(sid)) quintiles[q].hit += 1;
      });
    }

    // adoption panel + adoption-shaped short replies
    const panelHits = adoptionSids.filter((s) => citedBy.has(s));
    const shortReplies = okSlots.filter((s) => {
      const c = commentBodies.get(s);
      return c && c.parent.startsWith('t1_') && c.body.length <= 120;
    });
    const shortReplyHits = shortReplies.filter((s) => citedBy.has(s)).length;

    const usage = okRuns.reduce(
      (acc, r) => {
        acc.input += r.usage?.input ?? 0;
        acc.output += r.usage?.output ?? 0;
        acc.cached += r.usage?.cached ?? 0;
        return acc;
      },
      { input: 0, output: 0, cached: 0 },
    );
    const costUsd =
      geminiCostMicros({
        model: 'gemini-3-flash-preview',
        mode: 'interactive',
        inputTokens: usage.input,
        outputTokens: usage.output,
        cachedTokens: usage.cached,
      }) / 1_000_000;

    const arm = {
      armSize,
      chunks: chunkRuns.length,
      chunksOk: okRuns.length,
      errors: chunkRuns.filter((r) => r.error).map((r) => r.error),
      avgSlotsPerChunk: docsPerChunk,
      slotsScored: okSlots.length,
      docCoverage: covered / okSlots.length,
      coveredSlots: covered,
      mentionTotal,
      junk,
      junkRate: mentionTotal ? junk / mentionTotal : 0,
      quintiles: quintiles.map((q) => ({
        n: q.n,
        rate: q.n ? q.hit / q.n : 0,
      })),
      fatigueDelta:
        quintiles[0].n && quintiles[4].n
          ? quintiles[4].hit / quintiles[4].n -
            quintiles[0].hit / quintiles[0].n
          : null,
      adoptionPanel: {
        inSample: adoptionSids.length,
        hits: panelHits.length,
        hitSids: panelHits,
      },
      shortReplies: {
        n: shortReplies.length,
        hits: shortReplyHits,
        rate: shortReplies.length ? shortReplyHits / shortReplies.length : 0,
      },
      tokens: usage,
      costUsd,
      costPer1kDocsUsd: (costUsd / okSlots.length) * 1000,
      slotHits: Array.from(citedBy.keys()).filter(
        (s) => sampleSidSet.has(s) || postInputs.has(s),
      ),
    };
    armResults[String(armSize)] = arm;
    console.log(
      `ARM ${armSize} DONE: coverage ${(arm.docCoverage * 100).toFixed(1)}%, mentions ${mentionTotal}, junk ${(arm.junkRate * 100).toFixed(1)}%, fatigueΔ ${arm.fatigueDelta === null ? 'n/a' : (arm.fatigueDelta * 100).toFixed(1) + 'pp'}, shortReply ${(arm.shortReplies.rate * 100).toFixed(1)}%, cost $${costUsd.toFixed(2)}, errors ${arm.errors.length}`,
    );
    if (outFile)
      writeFileSync(
        outFile,
        JSON.stringify(
          {
            sample: { posts: samplePosts.length, comments: totalComments },
            adoptionSids,
            sharedSids,
            arms: armResults,
          },
          null,
          2,
        ),
      );
  }

  console.log('\n=== ALL ARMS COMPLETE ===');
  if (outFile) console.log(`wrote ${outFile}`);
  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
