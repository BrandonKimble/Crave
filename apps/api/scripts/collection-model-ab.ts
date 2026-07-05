import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import type {
  LLMModelInput,
  LLMMention,
} from '../src/modules/external-integrations/llm/llm.types';

/**
 * collection-model-ab.ts — model A/B for the MAIN collection prompt, run through
 * the REAL processContent path (same prompt, schema, thinking config, caching —
 * only LLM_MODEL differs between runs). Deterministic sample of real source
 * posts + their comments, one output file per model tag; COMPARE=1 diffs two
 * tags with the checks that gate corpus quality (fabricated cuisine hubs,
 * surface fidelity, praise rates, mention counts) plus token cost.
 *
 *   LLM_MODEL=gemini-3-flash-preview   MODEL_TAG=g3   yarn ts-node scripts/collection-model-ab.ts
 *   LLM_MODEL=gemini-3.1-flash-preview MODEL_TAG=g31  yarn ts-node scripts/collection-model-ab.ts
 *   COMPARE=g3,g31 yarn ts-node scripts/collection-model-ab.ts
 */
const OUT_DIR = path.join(__dirname, '../scratchpad');
const SAMPLE = Number(process.env.SAMPLE ?? 6);
const MAX_COMMENTS = Number(process.env.MAX_COMMENTS ?? 15);

interface PostRow {
  source_id: string;
  title: string | null;
  body: string | null;
  community: string | null;
  url: string | null;
  source_created_at: Date | null;
  score_snapshot: unknown;
}

function toScore(snapshot: unknown): number {
  if (typeof snapshot === 'number') return snapshot;
  if (snapshot && typeof snapshot === 'object') {
    const s = (snapshot as Record<string, unknown>).score;
    if (typeof s === 'number') return s;
  }
  return 0;
}

async function generate(tag: string): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const llm = app.get(LLMService);

    out(`model=${process.env.LLM_MODEL} tag=${tag}`);
    const ping = await llm.testConnection();
    out(`ping: ${JSON.stringify(ping).slice(0, 120)}`);

    // Deterministic sample: real posts (no synthetic poll docs) with the most
    // comments, stable order.
    const posts = await prisma.$queryRawUnsafe<PostRow[]>(
      `SELECT d.source_id, d.title, d.body, d.community, d.url,
              d.source_created_at, d.score_snapshot
       FROM collection_source_documents d
       WHERE d.source_type='post' AND d.source_id NOT LIKE 'poll-%'
       ORDER BY (SELECT count(*) FROM collection_source_documents c
                 WHERE c.parent_source_id = d.source_id) DESC, d.source_id ASC
       LIMIT ${SAMPLE}`,
    );

    const results: {
      postId: string;
      mentions: LLMMention[];
      tokens: unknown;
    }[] = [];
    for (const post of posts) {
      const comments = await prisma.$queryRawUnsafe<
        {
          source_id: string;
          body: string | null;
          score_snapshot: unknown;
          source_created_at: Date | null;
          url: string | null;
        }[]
      >(
        `SELECT source_id, body, score_snapshot, source_created_at, url
         FROM collection_source_documents
         WHERE parent_source_id = $1 AND source_type='comment'
         ORDER BY source_id ASC
         LIMIT ${MAX_COMMENTS}`,
        post.source_id,
      );
      const input: LLMModelInput = {
        posts: [
          {
            id: post.source_id,
            title: post.title ?? '',
            content: post.body ?? '',
            subreddit: post.community ?? 'unknown',
            author: 'redacted',
            url: post.url ?? '',
            score: toScore(post.score_snapshot),
            created_at: (post.source_created_at ?? new Date(0)).toISOString(),
            comments: comments.map((c) => ({
              id: c.source_id,
              content: c.body ?? '',
              author: 'redacted',
              score: toScore(c.score_snapshot),
              created_at: (c.source_created_at ?? new Date(0)).toISOString(),
              parent_id: post.source_id,
              url: c.url ?? '',
            })),
          },
        ],
      };
      const started = Date.now();
      const output = await llm.processContent(input);
      out(
        `  ${post.source_id}: ${output.mentions.length} mentions in ${Date.now() - started}ms (tokens: ${JSON.stringify(
          output.usageMetadata ?? null,
        ).slice(0, 140)})`,
      );
      results.push({
        postId: post.source_id,
        mentions: output.mentions,
        tokens: output.usageMetadata ?? null,
      });
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `model-ab-${tag}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({ model: process.env.LLM_MODEL, results }, null, 2),
    );
    out(`wrote ${file}`);
  } finally {
    await app.close();
  }
}

function compare(tagA: string, tagB: string): void {
  const out = (m = '') => process.stdout.write(`${m}\n`);
  const load = (tag: string) =>
    JSON.parse(
      fs.readFileSync(path.join(OUT_DIR, `model-ab-${tag}.json`), 'utf8'),
    ) as {
      model: string;
      results: { postId: string; mentions: LLMMention[]; tokens: any }[];
    };
  const A = load(tagA);
  const B = load(tagB);
  out(`A=${A.model}  B=${B.model}`);

  const stats = (r: { mentions: LLMMention[] }[]) => {
    const mentions = r.flatMap((x) => x.mentions);
    const foods = mentions
      .map((m) => (m.food ?? '').toLowerCase())
      .filter(Boolean);
    const hubs = foods.filter((f) => / (food|meal|dish(es)?)$/.test(f));
    return {
      mentions: mentions.length,
      foods: foods.length,
      uniqueFoods: new Set(foods).size,
      hubSuspects: hubs,
      praise: mentions.filter((m) => m.general_praise === true).length,
      restaurants: new Set(
        mentions.map((m) => (m.restaurant ?? '').toLowerCase()).filter(Boolean),
      ).size,
      totalTokens: r.reduce(
        (s, x: any) => s + (x.tokens?.totalTokenCount ?? 0),
        0,
      ),
      thoughtTokens: r.reduce(
        (s, x: any) => s + (x.tokens?.thoughtsTokenCount ?? 0),
        0,
      ),
    };
  };
  const sa = stats(A.results);
  const sb = stats(B.results);
  out('');
  out(`${'metric'.padEnd(16)}${tagA.padStart(10)}${tagB.padStart(10)}`);
  for (const k of [
    'mentions',
    'foods',
    'uniqueFoods',
    'praise',
    'restaurants',
    'totalTokens',
    'thoughtTokens',
  ] as const) {
    out(
      `${k.padEnd(16)}${String(sa[k]).padStart(10)}${String(sb[k]).padStart(10)}`,
    );
  }
  out(`hubSuspects A: ${JSON.stringify(sa.hubSuspects)}`);
  out(`hubSuspects B: ${JSON.stringify(sb.hubSuspects)}`);
  out('');
  for (const ra of A.results) {
    const rb = B.results.find((x) => x.postId === ra.postId);
    if (!rb) continue;
    const fa = new Set(
      ra.mentions.map((m) => (m.food ?? '').toLowerCase()).filter(Boolean),
    );
    const fb = new Set(
      rb.mentions.map((m) => (m.food ?? '').toLowerCase()).filter(Boolean),
    );
    const onlyA = [...fa].filter((f) => !fb.has(f));
    const onlyB = [...fb].filter((f) => !fa.has(f));
    out(
      `--- ${ra.postId} (A:${ra.mentions.length} B:${rb.mentions.length}) ---`,
    );
    if (onlyA.length) out(`  only-${tagA}: ${onlyA.join(', ')}`);
    if (onlyB.length) out(`  only-${tagB}: ${onlyB.join(', ')}`);
  }
}

async function main(): Promise<void> {
  const compareTags = process.env.COMPARE;
  if (compareTags) {
    const [a, b] = compareTags.split(',').map((s) => s.trim());
    compare(a, b);
    return;
  }
  const tag = process.env.MODEL_TAG ?? 'default';
  await generate(tag);
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
