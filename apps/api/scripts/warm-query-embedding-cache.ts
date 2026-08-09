/**
 * @script-class: operational
 * @runner: none yet — the docblock below says it is "ideal to run on deploy
 *   + on a periodic refresh", which is a runner this repo has not wired up.
 *
 * NOT a probe: it pre-warms the query-embedding cache that the always-on
 * dense autocomplete lane reads. A file cannot be both a deploy step and a
 * deletion candidate.
 *
 * STAMP CORRECTED (F4939, 2026-08-06). The F414 sweep (2026-08-02) marked
 * this file `@script-class: probe` / `@finding: NOT YET BANKED — deletion
 * candidate`. The sweep's own header admits it could establish the CLASS
 * mechanically "but not the second" fact — and it then defaulted that
 * unknown to the most destructive available value on a file it had not
 * read. THE RULE: a sweep emits only the fact it established. What it
 * actually knew is its reference census result — no runner invokes this
 * file — which is recorded above. Banking status was never checked, so no
 * `@finding` is claimed.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/modules/external-integrations/llm/embedding.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Pre-warm the query-embedding cache so the always-on dense autocomplete lane is
 * instant for real traffic from the first keystroke. Sources (bounded, the part
 * that matters): every active entity name + its aliases, plus the top historical
 * search queries. Embeddings are immutable, so this is safe to re-run (already-
 * cached terms are skipped) and ideal to run on deploy + on a periodic refresh.
 *
 *   yarn workspace api ts-node scripts/warm-query-embedding-cache.ts [topQueries=2000]
 */
async function main(): Promise<void> {
  const topQueries = Number(process.argv[2] ?? 2000);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const embeddings = app.get(EmbeddingService);
    const prisma = app.get(PrismaService);

    const entityRows = await prisma.$queryRawUnsafe<
      { name: string; aliases: string[] }[]
    >(
      `SELECT e.name,
              COALESCE((SELECT array_agg(s.form)
                          FROM entity_surface s
                         WHERE s.entity_id = e.entity_id
                           AND s.status = 'active'
                           AND s.locale = 'und'
                           AND s.role <> 'display'), '{}') AS aliases
       FROM core_entities e
       WHERE e.status = 'active' AND e.name_embedding IS NOT NULL`,
    );
    // Phase C: search history lives on the signals ledger (kind='search',
    // subject_text = the normalized query term).
    //
    // THROUGH signal_emittable_terms, NOT the raw column (2026-08-03). This
    // read is cross-person AND outbound: the terms are shipped to a
    // third-party embedding API. It previously read `signals.subject_text`
    // directly, so a term exactly one person had ever typed left the system.
    // The k-floor view is the eligibility authority; joining it is what makes
    // that impossible rather than merely unlikely.
    const queryRows = await prisma.$queryRawUnsafe<{ query_text: string }[]>(
      `SELECT s.subject_text AS query_text
       FROM signals s
       JOIN signal_emittable_terms _emit ON _emit.term = s.subject_text
       WHERE s.kind = 'search'
         AND s.subject_text IS NOT NULL
         AND length(trim(s.subject_text)) >= 3
       GROUP BY s.subject_text
       ORDER BY count(*) DESC
       LIMIT $1`,
      topQueries,
    );

    const terms = [
      ...entityRows.flatMap((r) => [r.name, ...(r.aliases ?? [])]),
      ...queryRows.map((r) => r.query_text),
    ];
    out(
      `warming ${terms.length} terms (${entityRows.length} entities + aliases, ${queryRows.length} top queries)…`,
    );

    const result = await embeddings.warmQueryCache(terms);
    out(
      `done: ${result.embedded} embedded, ${result.alreadyCached} already cached.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
