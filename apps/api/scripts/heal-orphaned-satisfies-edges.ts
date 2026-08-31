/**
 * @script-class: operational
 * @runner: operator-run, ONE-SHOT (widening red team F1, 2026-08-31).
 *
 * REDIRECT-HEAL for entity_satisfies.
 *
 * The debt: merges rekeyed every substrate EXCEPT the satisfies edges, so
 * edges whose from- or to-entity was merged away still point at archived
 * losers (readers rescue the TO side with a one-hop redirect join; the FROM
 * side has no rescue at all — those edges are dark). The completion contract
 * now rekeys both sides in-transaction (rekeySatisfiesEdgesToCanonical in
 * extraction-scope.service.ts); this drains the edges orphaned before it.
 *
 * The heal calls THE SAME rekey implementation per redirected endpoint, so
 * the conflict rule is one derivation (stated on the function): on a PK
 * collision the higher prompt_version wins, ties keep the existing
 * winner-side row, and self-pairs after rewrite are dropped.
 *
 *   # dry-run (DEFAULT): full before table, zero writes
 *   yarn workspace api ts-node scripts/heal-orphaned-satisfies-edges.ts
 *   # the one-shot heal
 *   yarn workspace api ts-node scripts/heal-orphaned-satisfies-edges.ts --apply
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { PrismaClient, Prisma } from '@prisma/client';
import { rekeySatisfiesEdgesToCanonical } from '../src/modules/content-processing/reddit-collector/extraction-scope.service';
import { redirectJoinSql } from '../src/modules/signals/subject-identity';

const prisma = new PrismaClient();
const out = (msg = '') => process.stdout.write(`${msg}\n`);

interface AffectedEdge {
  from_id: string;
  from_name: string | null;
  to_id: string;
  to_name: string | null;
  relation: string;
  prompt_version: number;
  from_redirect: string | null;
  from_redirect_name: string | null;
  to_redirect: string | null;
  to_redirect_name: string | null;
}

/** Every satisfies edge with a redirected endpoint, plus where each side
 *  redirects (chains are flattened by the merge contract, one hop is the
 *  invariant). */
const AFFECTED_SQL = Prisma.sql`
  SELECT s.from_entity_id::text AS from_id, ef.name AS from_name,
         s.to_entity_id::text   AS to_id,   et.name AS to_name,
         s.relation, s.prompt_version,
         rf.to_entity_id::text  AS from_redirect, wf.name AS from_redirect_name,
         rt.to_entity_id::text  AS to_redirect,   wt.name AS to_redirect_name
    FROM entity_satisfies s
    ${redirectJoinSql('s', 'rf', 'from_entity_id')}
    ${redirectJoinSql('s', 'rt', 'to_entity_id')}
    LEFT JOIN core_entities ef ON ef.entity_id = s.from_entity_id
    LEFT JOIN core_entities et ON et.entity_id = s.to_entity_id
    LEFT JOIN core_entities wf ON wf.entity_id = rf.to_entity_id
    LEFT JOIN core_entities wt ON wt.entity_id = rt.to_entity_id
   WHERE rf.from_entity_id IS NOT NULL OR rt.from_entity_id IS NOT NULL
   ORDER BY s.from_entity_id, s.to_entity_id`;

function printTable(label: string, rows: AffectedEdge[]): void {
  out(`\n${label}: ${rows.length} edge(s)`);
  for (const row of rows) {
    const fromNote = row.from_redirect
      ? ` [redirected -> "${row.from_redirect_name ?? row.from_redirect}"]`
      : '';
    const toNote = row.to_redirect
      ? ` [redirected -> "${row.to_redirect_name ?? row.to_redirect}"]`
      : '';
    out(
      `  "${row.from_name ?? row.from_id}"${fromNote} -> ` +
        `"${row.to_name ?? row.to_id}"${toNote} ` +
        `(${row.relation}, v${row.prompt_version})`,
    );
  }
}

async function bootstrap(): Promise<void> {
  const apply = process.argv.includes('--apply');
  try {
    const affected = await prisma.$queryRaw<AffectedEdge[]>(AFFECTED_SQL);
    printTable('BEFORE — edges with a redirected endpoint', affected);
    if (!affected.length) {
      out('\nNothing to heal.');
      return;
    }

    // The distinct redirected (loser -> winner) endpoint pairs to rekey.
    const rekeys = new Map<string, string>();
    for (const row of affected) {
      if (row.from_redirect) rekeys.set(row.from_id, row.from_redirect);
      if (row.to_redirect) rekeys.set(row.to_id, row.to_redirect);
    }
    out(`\nRedirected endpoints to rekey: ${rekeys.size}`);
    for (const [loser, winner] of rekeys) {
      out(`  ${loser} -> ${winner}`);
    }

    if (!apply) {
      out('\nDRY-RUN — no writes. Re-run with --apply to heal.');
      return;
    }

    await prisma.$transaction(
      async (tx) => {
        for (const [loser, winner] of rekeys) {
          // THE one rekey implementation — same conflict rule as the merge
          // completion contract (higher prompt_version wins, tie keeps the
          // existing row, self-pairs dropped).
          await rekeySatisfiesEdgesToCanonical(tx, winner, loser);
        }
      },
      { timeout: 10 * 60 * 1000, maxWait: 30_000 },
    );

    const after = await prisma.$queryRaw<AffectedEdge[]>(AFFECTED_SQL);
    printTable('AFTER — edges still carrying a redirected endpoint', after);
    out(
      after.length
        ? '\nWARNING: residual redirected edges remain (multi-hop redirect ' +
            'or a redirect written mid-heal) — investigate before re-running.'
        : '\nHEALED: zero satisfies edges reference a redirected entity.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void bootstrap();
