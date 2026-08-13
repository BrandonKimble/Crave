/**
 * @script-class: operational
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
 * So each stamped row becomes a verdict at the version it was stamped with —
 * carrying the ONE fact the stamp actually proves: THIS CLAIM WAS HEARD. That
 * is enough to stop the whole judged backlog being re-bought, and it is all
 * the evidence there is.
 *
 * THE OUTCOME IS 'unknown-pre-ledger', NOT AN INFERENCE (corrected
 * 2026-08-13). It used to be reconstructed from the state the verdict left —
 * deprecated means refused, display means evicted, live recall means upheld —
 * and the reconstruction is WRONG for any row something else touched
 * afterwards, which is a great many of them: measured on the corpus this
 * backfill wrote, 37 rows labelled `bothUpheld` and 25 labelled
 * `newcomerRefused` cannot have been either. The state a row is in today is
 * evidence about TODAY; the stamp says a hearing happened, and nothing in the
 * corpus says what it decided. Naming that honestly costs nothing —
 * `outcome` has no behavioural reader anywhere; the due-predicate keys on
 * (lane, claim, rule version, fold version) — while a confident wrong label
 * would be read by the next person as a finding.
 *
 * The reason is 'backfilled-pre-ledger' verbatim, for the same reason: these
 * rulings predate the requirement that a judge state its ground, and
 * inventing a plausible one would be worse than admitting the gap.
 * `executed_at` is set, because the effect demonstrably already happened —
 * the row this was read from IS the effect.
 *
 * THE COLUMN STAYS: `surface-locale-index.service.ts` still reads
 * `claim_judge_version` (it is what qualifies an inferred surface for the
 * locale projection) and the adjudicator still dual-writes it. Retirement is
 * a separate, ledgered step once that reader moves. (This note used to cite
 * "the label sweep's qualification" as a second reader — the label sweep
 * qualifies on `prompt_version` and has no reference to the stamp at all.)
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

/**
 * WHAT THE STAMP PROVES: that this claim was heard, at this rule version.
 * Not what was decided — see the header. The value is a real outcome string
 * rather than NULL so the row reads as a deliberate statement of ignorance
 * rather than as data someone forgot to write.
 */
const PRE_LEDGER_OUTCOME = 'unknown-pre-ledger';

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
        const outcome = PRE_LEDGER_OUTCOME;
        counts[outcome] = (counts[outcome] ?? 0) + 1;
        if (!apply) continue;
        const claimKey = wordClaimLane.canonicalClaimKey({
          form: row.form,
          locale: row.locale,
          entityId: row.entity_id,
        });
        const affected = await prisma.$executeRaw`
          INSERT INTO claim_verdicts
            (lane, claim_key, rule_version, fold_version, outcome, reason,
             rule_fingerprint, subject, decided_at, executed_at)
          VALUES (${WORD_CLAIM_LANE}, ${claimKey}, ${row.claim_judge_version},
                  ${wordClaimLane.keyFoldVersion},
                  ${outcome}, 'backfilled-pre-ledger', NULL,
                  ${JSON.stringify({
                    form: row.form,
                    locale: row.locale,
                    entityId: row.entity_id,
                    source: row.source,
                    takeWord: [],
                    bank: false,
                    refuse: false,
                  })}::jsonb,
                  now(), now())
          ON CONFLICT (lane, claim_key, rule_version, fold_version)
            DO NOTHING`;
        written += Number(affected);
      }
      if (rows.length < PAGE) break;
    }

    // THE STORED EFFECT SPEAKS THE CURRENT SHAPE. `WordClaimEffect` carries
    // ABSOLUTE target states (`takeWord`) rather than a bare id list
    // (`takeWordFrom`) since 2026-08-13, and a subject in the old shape would
    // fail on replay. Every row this script wrote orders NO surface move —
    // the stamp it was read from names the claim, not a victim — so the
    // rename is exact rather than a reconstruction, and a row that still
    // carries a non-empty legacy list is left alone and reported, because
    // inventing target states for a move that already happened would be
    // guessing at what the corpus looked like before it did.
    let reshaped = 0;
    let unreshapable = 0;
    if (apply) {
      reshaped = Number(
        await prisma.$executeRaw`
        UPDATE claim_verdicts
           SET subject = (subject - 'takeWordFrom')
                         || jsonb_build_object('takeWord', '[]'::jsonb)
         WHERE lane = ${WORD_CLAIM_LANE}
           AND subject ? 'takeWordFrom'
           AND jsonb_array_length(subject->'takeWordFrom') = 0`,
      );
      const stuck = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM claim_verdicts
         WHERE lane = ${WORD_CLAIM_LANE} AND subject ? 'takeWordFrom'`;
      unreshapable = Number(stuck[0]?.count ?? 0);
    }

    // RE-LABEL THE ROWS AN EARLIER RUN INFERRED. Idempotent, and scoped by
    // the reason string, which is the one marker that says "this row came
    // from this script and not from a judge".
    let relabelled = 0;
    if (apply) {
      relabelled = Number(
        await prisma.$executeRaw`
        UPDATE claim_verdicts
           SET outcome = ${PRE_LEDGER_OUTCOME}
         WHERE lane = ${WORD_CLAIM_LANE}
           AND reason = 'backfilled-pre-ledger'
           AND outcome <> ${PRE_LEDGER_OUTCOME}`,
      );
    }

    out(
      JSON.stringify(
        {
          apply,
          scanned,
          written,
          relabelled,
          reshaped,
          unreshapable,
          byOutcome: counts,
        },
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
