import 'dotenv/config';
process.env.PROCESS_ROLE = 'all';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { AppModule } from '../../src/app.module';
import { ArchiveIngestionService } from '../../src/modules/content-processing/reddit-collector/archive/archive-ingestion.service';
import { RelevanceGateService } from '../../src/modules/content-processing/reddit-collector/relevance-gate.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { LLMPost } from '../../src/modules/external-integrations/llm/llm.types';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';

/**
 * Step-4 measurement (plans/archive-prefilter-pipeline.md): run Stage-0 +
 * the REAL relevance gate over full archives and report keep-rates, projected
 * extraction-token deltas, and a false-drop audit sample. Verdicts persist —
 * the eventual real load reuses every one of them (measurement is not wasted).
 *
 *   MEASURE_SUBS=austinfood,JapanTravel,Atlanta MEASURE_CAP=3000 \
 *     yarn ts-node scripts/relevance-gate/measure.ts
 */
async function main(): Promise<void> {
  const subs = (process.env.MEASURE_SUBS ?? 'austinfood').split(',');
  const cap = Number(process.env.MEASURE_CAP ?? 0); // 0 = no cap
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m: string) => process.stdout.write(`${m}\n`);
  try {
    const ingestion = app.get(ArchiveIngestionService, { strict: false });
    const gate = app.get(RelevanceGateService, { strict: false });
    const prisma = app.get(PrismaService);

    const report: Record<string, unknown>[] = [];
    for (const sub of subs) {
      const loader = ingestion as unknown as {
        loadArchivePosts(s: string, cid: string): Promise<{ posts: LLMPost[] }>;
      };
      const { posts: all } = await loader.loadArchivePosts(
        sub.trim(),
        `relevance-measure-${sub}`,
      );
      const posts = cap > 0 && all.length > cap ? all.slice(-cap) : all;
      const tokens = (list: LLMPost[]) =>
        Math.round(
          list.reduce(
            (sum, post) =>
              sum +
              post.title.length +
              post.content.length +
              post.comments.reduce(
                (cs, comment) => cs + comment.content.length,
                0,
              ),
            0,
          ) / 4,
        );
      const started = Date.now();
      const gated = await gate.filterPosts('reddit', posts);
      const keptTokens = tokens(gated.kept);
      const allTokens = tokens(posts);
      const row = {
        sub,
        stage0Posts: all.length,
        measured: posts.length,
        kept: gated.kept.length,
        dropped: gated.dropped,
        keepRate: Number((gated.kept.length / posts.length).toFixed(3)),
        fromCache: gated.fromCache,
        contentTokensAll: allTokens,
        contentTokensKept: keptTokens,
        tokenSavingsPct: Number((1 - keptTokens / allTokens).toFixed(3)),
        gateMinutes: Number(((Date.now() - started) / 60000).toFixed(1)),
      };
      report.push(row);
      out(JSON.stringify(row));

      // False-drop audit sample: 30 random dropped posts with reasons.
      const keptIds = new Set(gated.kept.map((post) => post.id));
      const droppedPosts = posts.filter((post) => !keptIds.has(post.id));
      const sample = droppedPosts
        .sort(() => 0.5 - Math.random())
        .slice(0, 30)
        .map((post) => post.id);
      const verdicts = await prisma.collectionRelevanceVerdict.findMany({
        where: { platform: 'reddit', postId: { in: sample } },
        select: { postId: true, reason: true },
      });
      const reasonById = new Map(verdicts.map((v) => [v.postId, v.reason]));
      out(`--- DROP AUDIT ${sub} (30 random) ---`);
      for (const post of droppedPosts.filter((p) => sample.includes(p.id))) {
        out(
          `  [${post.id}] ${post.title.slice(0, 70)} || ${reasonById.get(post.id) ?? ''}`,
        );
      }
    }
    fs.writeFileSync(
      'scripts/relevance-gate/measurement-report.json',
      JSON.stringify(report, null, 2),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
