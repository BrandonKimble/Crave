import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import {
  bootstrap,
  loadFixture,
  out,
  makeRng,
  lengthBucket,
  BUCKET_LABEL,
  BUCKET_ORDER,
  DEFAULT_MARKET_KEY,
  type LengthBucket,
  type FixtureEntity,
} from './_shared';

/**
 * typo-replay.ts — the length-ladder baseline (Part C, row 1).
 *
 * Over the frozen fixture's entity names, generate synthetic typos per LENGTH
 * BUCKET (≤2 / 3-5 / 6-8 / 9+), run each through the ACTUAL recall SQL
 * (`retrieveCandidates`, dense OFF — same as the query-time linker), and measure
 * per bucket:
 *   - recall@10  : was the true entity in the top-10 shortlist?
 *   - junkAdmitted: candidates returned that are NOT the true entity (noise the
 *                   ladder lets through, averaged per query)
 *   - junkLinkRate on NO-TRUE-ENTITY queries: feed random gibberish and count how
 *                  often the CURRENT 0.82 linker still links something (the
 *                  false-link failure rate the plan wants to kill).
 *
 * This documents the CURRENT 0.7/0.55/0.45/0.35 length ladder + 0.82 linker —
 * the baseline every later REPLACE ships against.
 *
 *   yarn workspace api ts-node scripts/search-harness/typo-replay.ts
 *   SAMPLE_PER_BUCKET=80 yarn workspace api ts-node scripts/search-harness/typo-replay.ts
 */

const SHORTLIST_K = 10; // recall@10
const RECALL_POOL = 50; // retrieveCandidates poolSize (production default)
// Match the query-time linker's 0.82 sparse-similarity cutoff exactly.
const LINK_THRESHOLD_0_82 = 0.82;
const SAMPLE_PER_BUCKET = Number(process.env.SAMPLE_PER_BUCKET ?? 60);
const GIBBERISH_COUNT = Number(process.env.GIBBERISH_COUNT ?? 120);
const RNG = makeRng(Number(process.env.SEED ?? 1337));

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const pick = <T>(arr: T[]): T => arr[Math.floor(RNG() * arr.length)];
const randLetter = () => LETTERS[Math.floor(RNG() * LETTERS.length)];

type TypoKind =
  | 'substitution'
  | 'deletion'
  | 'transposition'
  | 'insertion'
  | 'prefix-truncation';

/** Apply a single-edit typo of the given kind to a word. Returns null when the
 *  edit can't apply (e.g. transposition needs ≥2 chars). */
function applyTypo(word: string, kind: TypoKind): string | null {
  const chars = word.split('');
  switch (kind) {
    case 'substitution': {
      if (chars.length === 0) return null;
      const i = Math.floor(RNG() * chars.length);
      let repl = randLetter();
      let guard = 0;
      while (repl === chars[i].toLowerCase() && guard++ < 5)
        repl = randLetter();
      chars[i] = repl;
      return chars.join('');
    }
    case 'deletion': {
      if (chars.length <= 1) return null;
      const i = Math.floor(RNG() * chars.length);
      chars.splice(i, 1);
      return chars.join('');
    }
    case 'transposition': {
      if (chars.length < 2) return null;
      const i = Math.floor(RNG() * (chars.length - 1));
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      const out2 = chars.join('');
      return out2 === word ? null : out2;
    }
    case 'insertion': {
      const i = Math.floor(RNG() * (chars.length + 1));
      chars.splice(i, 0, randLetter());
      return chars.join('');
    }
    case 'prefix-truncation': {
      // Simulate the user still typing: keep a leading prefix (~60%).
      if (chars.length < 3) return null;
      const keep = Math.max(2, Math.floor(chars.length * 0.6));
      if (keep >= chars.length) return null;
      return word.slice(0, keep);
    }
  }
}

const TYPO_KINDS: TypoKind[] = [
  'substitution',
  'deletion',
  'transposition',
  'insertion',
  'prefix-truncation',
];

interface BucketStat {
  bucket: LengthBucket;
  trials: number;
  recallHits: number; // true entity in top-K
  junkSum: number; // sum over trials of (returned candidates that aren't true)
  returnedSum: number; // sum of shortlist sizes
  emptySum: number; // trials where recall returned nothing at all
  byKind: Record<TypoKind, { trials: number; recallHits: number }>;
}

function emptyByKind(): Record<
  TypoKind,
  { trials: number; recallHits: number }
> {
  return TYPO_KINDS.reduce(
    (acc, k) => {
      acc[k] = { trials: 0, recallHits: 0 };
      return acc;
    },
    {} as Record<TypoKind, { trials: number; recallHits: number }>,
  );
}

/** Take the first whole word (fuzzy recall is per-token; whole-name typos on a
 *  multi-word name mostly measure trigram dilution, not typo tolerance). We type
 *  a typo into the FIRST token, which is the class the plan calls out. */
function firstToken(name: string): string {
  const t = name.trim().split(/\s+/)[0] ?? name.trim();
  return t.toLowerCase();
}

/** Uniform sample of n from arr (deterministic). */
function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const copy = arr.slice();
  const res: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const j = Math.floor(RNG() * copy.length);
    res.push(copy[j]);
    copy.splice(j, 1);
  }
  return res;
}

async function main(): Promise<void> {
  const fixture = loadFixture();
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);

    // Group entities by the length bucket of their FIRST token, then sample.
    const byBucket = new Map<LengthBucket, FixtureEntity[]>();
    for (const e of fixture.entities) {
      const tok = firstToken(e.name);
      if (!tok) continue;
      const b = lengthBucket(tok);
      const arr = byBucket.get(b) ?? [];
      arr.push(e);
      byBucket.set(b, arr);
    }

    const stats: Record<LengthBucket, BucketStat> = {} as never;
    for (const b of BUCKET_ORDER) {
      stats[b] = {
        bucket: b,
        trials: 0,
        recallHits: 0,
        junkSum: 0,
        returnedSum: 0,
        emptySum: 0,
        byKind: emptyByKind(),
      };
    }

    out(
      '=== TYPO-REPLAY BASELINE (current length ladder 0.7/0.55/0.45/0.35) ===',
    );
    out(`fixture v${fixture.fixtureVersion} @ ${fixture.generatedAt}`);
    out(
      `market=${DEFAULT_MARKET_KEY}  recall@${SHORTLIST_K}  poolSize=${RECALL_POOL}  sample/bucket=${SAMPLE_PER_BUCKET}`,
    );
    out('');

    for (const b of BUCKET_ORDER) {
      const pool = byBucket.get(b) ?? [];
      const chosen = sample(pool, SAMPLE_PER_BUCKET);
      for (const e of chosen) {
        const token = firstToken(e.name);
        for (const kind of TYPO_KINDS) {
          const typo = applyTypo(token, kind);
          if (!typo || typo === token) continue;

          const candidates = await search.retrieveCandidates(
            typo,
            [e.type],
            SHORTLIST_K,
            {
              marketKey:
                e.type === 'restaurant' ? DEFAULT_MARKET_KEY : undefined,
              denseMode: 'none', // same as the query-time linker
              poolSize: RECALL_POOL,
            },
          );

          const st = stats[b];
          st.trials++;
          st.byKind[kind].trials++;
          st.returnedSum += candidates.length;
          if (candidates.length === 0) st.emptySum++;

          const hit = candidates.some((c) => c.entityId === e.entityId);
          if (hit) {
            st.recallHits++;
            st.byKind[kind].recallHits++;
          }
          // "junk" = returned candidates that aren't the true entity.
          st.junkSum += candidates.filter(
            (c) => c.entityId !== e.entityId,
          ).length;
        }
      }
      const st = stats[b];
      out(
        `[${BUCKET_LABEL[b].padEnd(9)}] trials=${String(st.trials).padStart(4)}  ` +
          `recall@${SHORTLIST_K}=${pct(st.recallHits, st.trials)}  ` +
          `avgJunk=${(st.junkSum / Math.max(1, st.trials)).toFixed(1)}  ` +
          `emptyRecall=${pct(st.emptySum, st.trials)}`,
      );
      for (const k of TYPO_KINDS) {
        const bk = st.byKind[k];
        if (bk.trials === 0) continue;
        out(
          `             · ${k.padEnd(18)} recall=${pct(bk.recallHits, bk.trials)}  (n=${bk.trials})`,
        );
      }
    }

    // ---- junk-link rate on NO-TRUE-ENTITY (gibberish) queries -------------
    out('');
    out('=== JUNK-LINK RATE on no-true-entity (gibberish) queries ===');
    out(
      `Feeds random gibberish through retrieveCandidates + the CURRENT 0.82 linker rule;`,
    );
    out(
      `counts how often it still (wrongly) links an entity. n=${GIBBERISH_COUNT}/type`,
    );
    out('');

    const gibberishTypes: EntityType[] = ['restaurant', 'food'] as EntityType[];
    for (const type of gibberishTypes) {
      let linked = 0;
      let nonEmpty = 0;
      const examples: string[] = [];
      for (let i = 0; i < GIBBERISH_COUNT; i++) {
        const g = gibberish();
        const candidates = await search.retrieveCandidates(g, [type], 5, {
          marketKey: type === 'restaurant' ? DEFAULT_MARKET_KEY : undefined,
          denseMode: 'none',
          poolSize: RECALL_POOL,
        });
        if (candidates.length > 0) nonEmpty++;
        // Replicate the linker's decision (exact OR best sparse ≥ 0.82).
        const norm = g.toLowerCase();
        const exact = candidates.find(
          (c) => c.name.trim().toLowerCase() === norm,
        );
        let didLink = false;
        if (exact) {
          didLink = true;
        } else if (candidates.length > 0) {
          const best = candidates.reduce((a, c) =>
            (c.sparseSimilarity ?? 0) > (a.sparseSimilarity ?? 0) ? c : a,
          );
          if ((best.sparseSimilarity ?? 0) >= LINK_THRESHOLD_0_82) {
            didLink = true;
            if (examples.length < 5)
              examples.push(
                `${g} → ${best.name} (${(best.sparseSimilarity ?? 0).toFixed(2)})`,
              );
          }
        }
        if (didLink) linked++;
      }
      out(
        `[${type.padEnd(10)}] junkLinkRate=${pct(linked, GIBBERISH_COUNT)}  ` +
          `(recall returned something on ${pct(nonEmpty, GIBBERISH_COUNT)})`,
      );
      for (const ex of examples) out(`             wrong-link e.g. ${ex}`);
    }

    out('');
    out('Baseline captured. Later REPLACE steps must beat these numbers.');
  } finally {
    await app.close();
  }
}

function pct(n: number, d: number): string {
  if (d === 0) return '  n/a';
  return `${((100 * n) / d).toFixed(1).padStart(5)}%`;
}

/** Pronounceable-ish gibberish unlikely to match any real name, length 6-10. */
function gibberish(): string {
  const cons = 'bcdfghjklmnpqrstvwxz';
  const vow = 'aeiou';
  const len = 6 + Math.floor(RNG() * 5);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += i % 2 === 0 ? pick(cons.split('')) : pick(vow.split(''));
  }
  return s;
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
