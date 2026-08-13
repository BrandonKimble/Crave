/**
 * @script-class: data-fix
 *
 * MIGRATE THE EXISTING MEMORY into the hearing ledger (H5, 2026-08-12).
 *
 * Before the ledger, a word-claim verdict was remembered as a STAMP on the
 * row it affected (`entity_surface.claim_judge_version`). Those verdicts are
 * real decisions that real money was paid for, and the moment the due-
 * predicate starts reading `claim_verdicts` instead, an unmigrated corpus
 * looks like one where nothing was ever judged — every stamped claim would be
 * offered again, and the whole judged backlog would be re-bought.
 *
 * So each stamped row becomes a verdict at the version it was stamped with.
 * The outcome is INFERRED FROM THE STATE THE VERDICT LEFT, which is exactly
 * what the old memory was: a deprecated row is a refusal, a display row on an
 * inferred source is an eviction (the encoding that takes the word and keeps
 * the label), and a live recall row is a grant that was upheld. That last one
 * is the class the stamp could never distinguish from an unjudged row — the
 * stamp is the ONLY evidence it was ever heard, which is why this runs before
 * the column is retired rather than after.
 *
 * The reason is 'backfilled-pre-ledger' verbatim: these rulings predate the
 * requirement that a judge state its ground, and inventing a plausible reason
 * for a decision nobody recorded would be worse than admitting the gap.
 * `executed_at` is set, because the effect demonstrably already happened —
 * the row this was read from IS the effect.
 *
 * THE COLUMN STAYS. Other readers (surface-locale-index, the label sweep's
 * qualification) still consult it and the adjudicator still dual-writes it;
 * retirement is a separate, ledgered step once those readers move.
 *
 * Run:
 *   npx ts-node -T scripts/data-fixes/backfill-claim-verdicts.ts          # count only
 *   npx ts-node -T scripts/data-fixes/backfill-claim-verdicts.ts --apply
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  WORD_CLAIM_LANE,
  wordClaimLane,
} from '../../src/modules/content-processing/entity-resolver/word-claim-lane';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';

const PAGE = 1000;

interface StampedRow {
  form: string;
  locale: string;
  entity_id: string;
  source: string;
  status: string;
  role: string;
  claim_judge_version: number;
}

/** What the stamp's row state says the verdict WAS. */
function inferOutcome(row: StampedRow): string {
  if (row.status === 'deprecated') return 'newcomerRefused';
  if (row.role === 'display') return 'incumbentEvicted';
  return 'bothUpheld';
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m: string) => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const counts: Record<string, number> = {};
    let scanned = 0;
    let written = 0;

    for (let offset = 0; ; offset += PAGE) {
      const rows = await prisma.$queryRaw<StampedRow[]>`
        SELECT s.form, s.locale, s.entity_id::text, s.source,
               s.status::text, s.role::text, s.claim_judge_version
          FROM entity_surface s
         WHERE s.claim_judge_version IS NOT NULL
         ORDER BY s.surface_id
         LIMIT ${PAGE} OFFSET ${offset}`;
      if (!rows.length) break;
      scanned += rows.length;
      for (const row of rows) {
        const outcome = inferOutcome(row);
        counts[outcome] = (counts[outcome] ?? 0) + 1;
        if (!apply) continue;
        const claimKey = wordClaimLane.canonicalClaimKey({
          form: row.form,
          locale: row.locale,
          entityId: row.entity_id,
        });
        const affected = await prisma.$executeRaw`
          INSERT INTO claim_verdicts
            (lane, claim_key, rule_version, outcome, reason, rule_fingerprint,
             subject, decided_at, executed_at)
          VALUES (${WORD_CLAIM_LANE}, ${claimKey}, ${row.claim_judge_version},
                  ${outcome}, 'backfilled-pre-ledger', NULL,
                  ${JSON.stringify({
                    form: row.form,
                    locale: row.locale,
                    entityId: row.entity_id,
                    source: row.source,
                    takeWordFrom: [],
                    bank: false,
                    refuse: false,
                  })}::jsonb,
                  now(), now())
          ON CONFLICT (lane, claim_key, rule_version) DO NOTHING`;
        written += Number(affected);
      }
      if (rows.length < PAGE) break;
    }

    out(
      JSON.stringify(
        { apply, scanned, written, byInferredOutcome: counts },
        null,
        2,
      ),
    );
    if (!apply) out('\nDRY RUN — add --apply to write the verdicts.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
