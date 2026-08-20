/**
 * @script-class: probe
 * @finding: plans/prompt-fleet-audit.md — P3 consensus-scoring measurements.
 *
 * BOTH-WAYS RANKING DIFF for the consensus policy decisions (owner ruling
 * "consensus = opinions, not applause", 2026-08-14 walkthrough subject 3):
 *
 *   A. post-body claims floored to 1 upvote (creator = one ballot) vs
 *      today's whole-thread applause riding every post claim;
 *   B. praiseWeight 2.0 vs 1.0 (the 2026-06-19 dishless-restaurant dial).
 *
 * Runs the REAL scorer (PublicCraveScoreService.rebuildAllScores) under four
 * variants — baseline, floor-posts, praise1, floor+praise1 — snapshotting
 * top-N per city after each, then RESTORES the original upvote values and
 * rebuilds baseline, so the database ends exactly where it started. The
 * mutation is reversible by construction: original values are copied to
 * backup tables first and the restore UPDATEs from them.
 *
 * Read-only for the corpus in net effect; never run against prod.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PublicCraveScoreService } from '../src/modules/content-processing/public-crave-score/public-crave-score.service';

const TOP_N = 50;
const OUT =
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ??
  'consensus-policy-diff.result.json';

const consoleLogger = {
  setContext() {
    return this;
  },
  debug() {},
  info(...args: unknown[]) {
    console.log(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
  },
  error(...args: unknown[]) {
    console.error(...args);
  },
} as never;

type Row = {
  subject_type: string;
  subject_id: string;
  name: string;
  city: string | null;
  display_score: string;
  endorsement_raw: string;
};

async function snapshot(prisma: PrismaClient): Promise<Record<string, Row[]>> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    WITH ranked AS (
      SELECT s.subject_type, s.subject_id, e.name, e.city,
             s.display_score::text, s.endorsement_raw::text,
             ROW_NUMBER() OVER (
               PARTITION BY e.city, s.subject_type
               ORDER BY s.endorsement_raw DESC
             ) AS rn
      FROM core_public_entity_scores s
      JOIN core_entities e ON e.entity_id = s.subject_id
      WHERE e.city IS NOT NULL
    )
    SELECT subject_type, subject_id, name, city, display_score, endorsement_raw
    FROM ranked WHERE rn <= ${TOP_N}
    -- rn, NEVER the selected endorsement_raw: that column is a ::text cast,
    -- and text-DESC puts '9.9' above '14.3' — the bug that scrambled every
    -- board above score 10 (caught 2026-08-16 via the Uchi 'inversion').
    ORDER BY city, subject_type, rn
  `);
  const byKey: Record<string, Row[]> = {};
  for (const row of rows) {
    const key = `${row.city}::${row.subject_type}`;
    (byKey[key] ??= []).push(row);
  }
  return byKey;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const scorer = new PublicCraveScoreService(prisma as never, consoleLogger);

  const rebuild = async (config?: Record<string, unknown>) => {
    await scorer.rebuildAllScores(config ? { config } : undefined);
  };

  const results: Record<string, Record<string, Row[]>> = {};
  try {
    // CRASH MARKER (red team 2026-08-19): the permanent backup tables ARE
    // the crash-recovery mechanism (a TEMP table would die with the crashed
    // session) — so their prior existence means an earlier run died mid-
    // mutation and the corpus may still be floored. Refuse to stack a new
    // mutation on an unreconciled one; restore or drop the backups first.
    const priorBackup = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_name IN ('probe_upv_backup_m','probe_upv_backup_e')`,
    );
    if (priorBackup[0] && priorBackup[0].n > 0) {
      throw new Error(
        'probe_upv_backup_* tables already exist — a prior run crashed ' +
          'mid-mutation. Restore from them (UPDATE ... FROM backup) or drop ' +
          'them deliberately before running again.',
      );
    }
    console.log('backing up upvote columns…');
    await prisma.$executeRawUnsafe(
      `CREATE TABLE probe_upv_backup_m AS
         SELECT id, source_upvotes FROM core_restaurant_item_mentions`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TABLE probe_upv_backup_e AS
         SELECT event_id, source_upvotes FROM core_restaurant_events`,
    );

    console.log('variant: baseline (today, applause upvotes)…');
    await rebuild();
    results.baseline = await snapshot(prisma);

    console.log('flooring post-body claims to one ballot…');
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_item_mentions m
      SET source_upvotes = LEAST(m.source_upvotes, 1)
      FROM collection_source_documents d
      WHERE d.document_id = m.source_document_id AND d.source_type = 'post'
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_events ev
      SET source_upvotes = LEAST(ev.source_upvotes, 1)
      FROM collection_source_documents d
      WHERE d.document_id = ev.source_document_id AND d.source_type = 'post'
    `);

    // THE BAKE-OFF MATRIX (owner-tabled 2026-08-17, re-judged post-backfill):
    // every equation family stays one config away. All floored, 365d decay
    // unless the variant says otherwise.
    const variants: Array<[string, Record<string, unknown> | undefined]> = [
      ['floorPosts', undefined], // structured + log (current live shape)
      ['floorSqrt', { compression: 'sqrt' }],
      ['floorOnePool', { pooling: 'one-pool' }],
      ['floorThreadShare', { pooling: 'thread-share' }],
      ['floorThreadShareConf', { pooling: 'thread-share-confidence' }],
      ['floorPraise1', { praiseWeight: 1.0 }],
      ['floorDecay180', { endorsementHalfLifeDays: 180 }],
    ];
    for (const [name, cfg] of variants) {
      console.log(`variant: ${name}…`);
      await rebuild(cfg);
      results[name] = await snapshot(prisma);
    }
  } finally {
    console.log('restoring upvote columns…');
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_item_mentions m
      SET source_upvotes = b.source_upvotes
      FROM probe_upv_backup_m b WHERE b.id = m.id
        AND m.source_upvotes <> b.source_upvotes
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE core_restaurant_events ev
      SET source_upvotes = b.source_upvotes
      FROM probe_upv_backup_e b WHERE b.event_id = ev.event_id
        AND ev.source_upvotes <> b.source_upvotes
    `);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS probe_upv_backup_m`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS probe_upv_backup_e`);
    console.log('rebuilding baseline scores…');
    await scorer.rebuildAllScores();
    await prisma.$disconnect();
  }

  writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(`wrote ${OUT}`);
  writeFileSync(OUT.replace(/\.json$/, '.html'), renderBoards(results));
  console.log(`wrote ${OUT.replace(/\.json$/, '.html')} (boards)`);
}

/** Side-by-side top-50 boards per city, one column per variant, moves vs
 *  baseline. The bake-off's visual instrument — publish as the artifact. */
function renderBoards(results: Record<string, Record<string, Row[]>>): string {
  const CITIES = ['Austin', 'Manhattan', 'Brooklyn', 'Queens'];
  const esc = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const variantNames = Object.keys(results);
  const boardOf = (variant: string, city: string): Row[] =>
    results[variant]?.[`${city}::place`] ??
    results[variant]?.[`${city}::restaurant`] ??
    [];
  const sections = CITIES.map((city) => {
    const baseRank = new Map(
      boardOf('baseline', city).map((row, i) => [row.name, i + 1]),
    );
    const columns = variantNames
      .map((variant) => {
        const rows = boardOf(variant, city)
          .map((row, i) => {
            const old = baseRank.get(row.name);
            const chip =
              variant === 'baseline'
                ? ''
                : old === undefined
                  ? '<span class="chip new">new</span>'
                  : old - (i + 1) > 0
                    ? `<span class="chip up">▲ ${old - (i + 1)}</span>`
                    : old - (i + 1) < 0
                      ? `<span class="chip down">▼ ${i + 1 - old}</span>`
                      : '<span class="chip flat">=</span>';
            const tail =
              variant === 'baseline'
                ? ''
                : `<td class="mv">${chip}</td><td class="old">${old ?? '—'}</td>`;
            return `<tr><td class="rk">${i + 1}</td><td>${esc(row.name)}</td>${tail}</tr>`;
          })
          .join('');
        const head =
          '<th class="rk">#</th><th>Restaurant</th>' +
          (variant === 'baseline'
            ? ''
            : '<th class="mv">Move</th><th class="old">Was</th>');
        return `<div class="board"><h3>${esc(variant)}</h3><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      })
      .join('');
    return `<section><h2>${city}</h2><div class="row">${columns}</div></section>`;
  }).join('');
  return `<title>Crave score bake-off boards</title>
<style>
:root{--paper:#fbfaf8;--ink:#22211d;--mut:#8a867c;--line:#e5e1d8;--up:#0f6b62;--down:#a33b2e;}
@media (prefers-color-scheme: dark){:root{--paper:#191816;--ink:#e9e6df;--mut:#8f8b81;--line:#33312c;--up:#4fb3a5;--down:#d97f6d;}}
:root[data-theme="dark"]{--paper:#191816;--ink:#e9e6df;--mut:#8f8b81;--line:#33312c;--up:#4fb3a5;--down:#d97f6d;}
:root[data-theme="light"]{--paper:#fbfaf8;--ink:#22211d;--mut:#8a867c;--line:#e5e1d8;--up:#0f6b62;--down:#a33b2e;}
body{background:var(--paper);color:var(--ink);font:14px/1.45 -apple-system,'Segoe UI',sans-serif;margin:0;padding:2rem 1.2rem;}
h2{border-bottom:2px solid var(--ink);padding-bottom:.25rem;}
h3{font-size:.72rem;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;}
.row{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(230px,1fr);gap:1rem;overflow-x:auto;}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;}
th{text-align:left;font-size:.66rem;color:var(--mut);text-transform:uppercase;padding:.2rem .4rem;border-bottom:1px solid var(--line);}
td{padding:.22rem .4rem;border-bottom:1px solid var(--line);}
.rk{width:2rem;color:var(--mut);}.old{width:2.6rem;color:var(--mut);text-align:right;}.mv{width:3.6rem;white-space:nowrap;}
.chip{font-size:.68rem;padding:.04rem .34rem;border-radius:3px;}
.chip.up{color:var(--up);}.chip.down{color:var(--down);}.chip.new{color:var(--up);font-weight:600;}.chip.flat{color:var(--mut);}
</style><main><h1>Crave score bake-off</h1>${sections}</main>`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
