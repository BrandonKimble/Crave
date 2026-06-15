import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';

/**
 * P1.4 increment 4.1 — embedding-recall A/B for entity search.
 *
 * Compares the current lexical matcher (EntityTextSearchService: prefix + FTS +
 * trigram + phonetic) against a semantic embedding kNN, side by side, on a set of
 * probe queries. Answers "do embeddings get us toward Google-level suggestions,
 * and for which query shapes?" before deciding whether to add a semantic lane.
 *
 * Non-disruptive: reads only, embeds the corpus in-memory (no new infra).
 *
 *   yarn workspace api ts-node scripts/entity-search-ab.ts "bacon egg and cheese" "BEC" "fried chicken sando"
 */
const DEFAULT_QUERIES = [
  'BEC',
  'bacon egg and cheese',
  'fried chicken sando',
  'pork bun',
  'soup dumplings',
  'spicy tuna roll',
  'matcha latte',
  'shake shack', // lexical proper-noun control
];

const LIMIT = 6;

interface Cand {
  entityId: string;
  name: string;
  type: string;
  lexRank?: number;
  lexSim?: number;
  lexEvidence?: string;
  embRank?: number;
  embScore?: number;
}

/**
 * Fuse the two ranked lists via Reciprocal Rank Fusion (robust to the different
 * score scales — lexical similarity vs embedding cosine). Exact lexical hits are
 * forced to the top; the embedding lane is down-weighted for restaurants (proper
 * nouns), where the A/B showed it injects conceptually-related but wrong entities.
 */
function merge(lexical: Cand[], semantic: Cand[], limit: number): Cand[] {
  const K = 10;
  const by = new Map<string, Cand>();
  const add = (c: Cand) => {
    const prev = by.get(c.entityId);
    by.set(c.entityId, prev ? { ...prev, ...c } : c);
  };
  lexical.forEach((c, i) => add({ ...c, lexRank: i }));
  semantic.forEach((c, i) => add({ ...c, embRank: i }));

  const scored = [...by.values()].map((c) => {
    const wEmb = c.type === 'restaurant' ? 0.3 : 1;
    // Weight each lane by match QUALITY, not just rank — otherwise a weak 0.44
    // fuzzy lexical hit ("mac and cheese" for "bacon egg and cheese") gets full
    // RRF credit and outranks a strong 0.70 semantic match.
    const lex = c.lexRank != null ? (c.lexSim ?? 0) / (K + c.lexRank) : 0;
    const emb =
      c.embRank != null ? ((c.embScore ?? 0) * wEmb) / (K + c.embRank) : 0;
    const exactBoost = c.lexEvidence === 'exact' ? 1 : 0;
    return { c, score: exactBoost + lex + emb };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

async function main(): Promise<void> {
  const queries = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_QUERIES;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const search = app.get(EntityTextSearchService);
    const types: EntityType[] = ['restaurant', 'food'] as EntityType[];

    for (const q of queries) {
      // Both lanes now from the live service: lexical (FTS/trigram/phonetic) and
      // the persistent pgvector semantic lane (searchByEmbedding).
      const [lexical, semantic] = await Promise.all([
        search.searchEntities(q, types, LIMIT, { allowPhonetic: true }),
        search.searchByEmbedding(q, types, 20),
      ]);
      const lexCands: Cand[] = lexical.map((l) => ({
        entityId: l.entityId,
        name: l.name,
        type: l.type,
        lexSim: l.similarity,
        lexEvidence: l.evidence,
      }));
      const semCands: Cand[] = semantic.map((s) => ({
        entityId: s.entityId,
        name: s.name,
        type: s.type,
        embScore: s.similarity,
      }));
      const merged = merge(lexCands, semCands, LIMIT);

      const col = (c?: Cand, side?: 'lex' | 'emb') => {
        if (!c) return '—';
        if (side === 'lex')
          return `${c.name} [${c.type[0]}] ${(c.lexSim ?? 0).toFixed(2)} ${c.lexEvidence}`;
        if (side === 'emb')
          return `${c.name} [${c.type[0]}] ${(c.embScore ?? 0).toFixed(3)}`;
        const src = `${c.lexRank != null ? 'L' : ''}${c.embRank != null ? 'E' : ''}`;
        return `${c.name} [${c.type[0]}] (${src})`;
      };

      out('');
      out(`════ "${q}" ════`);
      out(
        '  LEXICAL                          │  EMBEDDING                       │  MERGED',
      );
      for (let i = 0; i < LIMIT; i++) {
        out(
          `  ${col(lexCands[i], 'lex').padEnd(32).slice(0, 32)} │  ${col(semCands[i], 'emb').padEnd(32).slice(0, 32)} │  ${col(merged[i])}`,
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
