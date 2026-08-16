/**
 * @script-class: operational
 *
 * THE REVERT — the rows the romanization INFERENCE took a language away from
 * (2026-08-13). Supersedes `retag-romanizations-to-und.ts`, which is deleted
 * along with the predicate it ran on.
 *
 * WHAT WAS WRONG. `isRomanizationOfMarkedSibling` read a PAIR of rows — an
 * accent-free form offered under a language, beside an accented spelling of the
 * same folded word on the same concept — and concluded the plain one was the
 * romanization OF the accented one, so it moved the plain one to 'und'. The
 * wave-2 measurement checked all 16 rows the rule's own `is_default` exemption
 * was protecting and found it pointed the WRONG WAY on every single one: es
 * `pudin`/`daiquiri`/`bisque`/`sake`/`shochu`, en `crepe`/`etouffee`/`cafe`/
 * `banh mi`, vi `kunefe`/`tom yum` are the BORROWING language's own standard
 * spelling. The sweep banks that plain label, the generator separately banks
 * the accented source spelling as a recall row, and the predicate then reads
 * the label as a romanization of the recall row.
 *
 * The direction of provenance is NOT IN THE PAIR. `cafe`+`café` and
 * `thit`+`thịt` are the same shape and opposite facts — English writes `cafe`,
 * Vietnamese never writes `thit` — and the difference is a property of the
 * language's orthography, not of the two rows. So the rule is deleted and the
 * writer declares instead (`SurfaceOrigin`, entity-surface.service.ts).
 *
 * WHICH ROWS MOVE BACK, and why only these. The applied run moved 176 rows
 * (all source='vocabulary', role='recall'; the `is_default` labels were exempt).
 * Re-audited under writer-knowledge, they split by LANGUAGE, and only one side
 * is provable:
 *
 *  - the 4 rows below are WRONG MOVERS, and move back. Each had an ACCENTED
 *    SIBLING BANKED UNDER `en` and is the standard English spelling of that
 *    word — English does not write those accents at all, so the plain form is
 *    not a romanization of anything, it is the word. Measured cost: ZERO
 *    admission changes over 58,451 common probes, 3 probes gained.
 *  - es `coctel` is ALSO a wrong mover — Spanish admits it beside `cóctel` —
 *    but giving its tag back costs 21 groundings, so it is HELD for an owner
 *    ruling rather than shipped. See HELD_FOR_RULING below.
 *  - the 52 vi movers STAY at 'und'. Vietnamese orthography writes its tone
 *    marks obligatorily; `thit`, `bun ca`, `nuoc dung pho bo` are spellings
 *    nobody makes in Vietnamese, which is exactly what 'und' is for.
 *  - the 114 remaining es movers STAY, but NOT because they were proven right —
 *    Spanish requires the tilde on `salmón`, `sándwich`, `plátano`, `maíz`, so
 *    the great majority are genuinely stripped spellings. `coctel` proves at
 *    least one es row is not, and its compounds (`cocteles`, `coctel de
 *    camarones`, `vuelo de cocteles`) are the same word. Splitting those needs
 *    a per-word orthographic ruling, which is a WRITER's knowledge, not a
 *    query's — the same fact this whole repair is about. They are left alone
 *    rather than moved on a rule that has already been shown to run backwards,
 *    and flagged for the owner instead.
 *
 * THE LOCALE IS PART OF THE CLAIM KEY, SO A LOCALE MOVE IS A LEDGER MOVE. A
 * word claim is keyed `locale|form|entity` in `claim_verdicts` — that is the
 * whole point of the locale being in the key: `chay` in vi and `chay` in es are
 * different questions. A verdict left behind under the old name reads as never
 * heard, `dueClaims` offers it again, and the corpus pays a second time for an
 * answer it already owns. So the verdicts move in the SAME TRANSACTION as the
 * row — key AND `subject.locale`, since the subject is what a resumed effect
 * replays. This is the law wave-1 wrote after the forward run orphaned 9 paid
 * verdicts; the revert obeys it in the opposite direction.
 *
 * IDEMPOTENT: re-running finds nothing to do. REPORT-THEN-APPLY: it prints the
 * full picture and changes nothing without `--apply`.
 *
 * Usage:
 *   npx ts-node -T scripts/data-fixes/revert-wrong-romanization-retags.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { Prisma, PrismaClient } from '@prisma/client';
import { surfaceClaimKey } from '../../src/modules/content-processing/entity-resolver/entity-surface.service';
import {
  WORD_CLAIM_LANE,
  wordClaimLane,
} from '../../src/modules/content-processing/entity-resolver/word-claim-lane';

const prisma = new PrismaClient();

/**
 * THE ROWS THAT SHIP, named by (concept name, form) and the language being GIVEN
 * BACK. Named one at a time, rather than re-derived by a query, because the
 * fact that puts a row on this list is an orthographic one about its language —
 * precisely the knowledge no predicate over the corpus can hold. A hand list is
 * the honest encoding of a hand ruling; the danger of a hand list is that it
 * cannot see its next member, and that danger is the reason this repair exists
 * at all rather than a reason to write another rule.
 */
const REVERTS: ReadonlyArray<{
  entityName: string;
  form: string;
  locale: string;
  why: string;
}> = [
  {
    entityName: 'coffee shop',
    form: 'cafe',
    locale: 'en',
    why: "English writes 'cafe'; the accented 'café' beside it is the French/Spanish spelling, not the source this is stripped from",
  },
  {
    entityName: 'cafe',
    form: 'cafes',
    locale: 'en',
    why: "plural of the same English word; sibling 'cafés' is banked en by the generator",
  },
  {
    entityName: 'crepe',
    form: 'crepes',
    locale: 'en',
    why: "English writes 'crepes'; 'crêpes' is the French spelling the generator banked as en",
  },
  {
    entityName: 'jalapeno',
    form: 'jalapenos',
    locale: 'en',
    why: "the naturalized English plural; English does not write the tilde in 'jalapeños'",
  },
];

/**
 * HELD FOR AN OWNER RULING — es `coctel`, the one revert that COSTS SOMETHING.
 *
 * Spanish admits `coctel` beside `cóctel`, so the tag `es` is the honest one
 * and the forward run was wrong to take it away. But giving it back was
 * measured, and it is not free: the accent-admission sweep over the live corpus
 * (58,451 common probes) moved 21 claims, ALL of them this one row, ALL in the
 * same direction —
 *
 *   food|es|coctel de camarones mexicano   alias -> unmatched
 *   food|es|coctel sin alcohol             alias -> unmatched
 *   ingredient|es|salsa coctel             alias -> unmatched      (+18 more)
 *
 * The mechanism is `admitsAtExactTier`: a language-tagged accent-free form is
 * read as a word the speaker spelled IN FULL, so once `coctel` is a complete es
 * word, `coctel de camarones` stops being an under-accented spelling of `cóctel
 * de camarones` and must agree on accents — which it does not. A Spanish
 * speaker who types the tilde-less form, as most do, loses the dish.
 *
 * That is the SAME trade the owner already ruled on in wave-2, when the red
 * team's "strict arm universal" was refused on data (vi 90.42 -> 86.23; 'ca
 * phe' must still reach 'cà phê'). The four rows above are pure tag honesty —
 * zero admission changes, four probes gained — so they ship. This one is a
 * recall decision wearing a tagging decision's clothes, and it is the owner's.
 *
 * If it is ruled IN, move the entry back into REVERTS above; the 21 losses are
 * the price, and the real fix is in the discriminator, not the tag.
 */
// RULING LANDED (2026-08-13): coctel stays KEEP-UND — the owner ruled the 21
// de-accented compound groundings outweigh the es tag's honesty; the entry
// does NOT move into REVERTS. Kept here as the record of what was held and how
// it was decided.
const HELD_FOR_RULING = {
  entityName: 'cocktail',
  form: 'coctel',
  locale: 'es',
  why: "Spanish admits 'coctel' beside 'cóctel', but tagging it es costs 21 de-accented compound groundings",
} as const;
void HELD_FOR_RULING;

interface Target {
  surface_id: string;
  entity_id: string;
  form: string;
  entity_name: string;
  locale: string;
  why: string;
}

/**
 * MOVE A CLAIM'S VERDICTS TO ITS NEW NAME. A rename, not a re-hearing: the
 * ruling, its ground and its executed state all survive intact, under the key
 * the claim is now called by.
 *
 * `subject.locale` moves with the key because the subject is what a resumed
 * effect replays — a verdict whose key says 'en' and whose subject still says
 * 'und' would, on replay, write the row this script just moved back where it
 * came from.
 *
 * A verdict may ALREADY exist at the destination (both tags were heard before
 * and after the forward run). The destination's is the one about the claim as
 * it is now named, so it stands and the old row is dropped: two verdicts cannot
 * share one claim, and inventing a merge rule between them would be this script
 * deciding a case no judge heard.
 *
 * Carried from `retag-romanizations-to-und.ts` with the destination locale made
 * a PARAMETER — that script hardcoded `'"und"'::jsonb` because it only ever
 * moved one way, and a reverse move that wrote 'und' into the subject would
 * silently re-create the orphan it is repairing.
 */
async function moveClaimVerdicts(
  tx: Prisma.TransactionClient,
  moves: ReadonlyArray<{ from: string; to: string; locale: string }>,
): Promise<{ moved: number; superseded: number }> {
  let moved = 0;
  let superseded = 0;
  for (const move of moves) {
    moved += await tx.$executeRaw`
      UPDATE claim_verdicts v
         SET claim_key = ${move.to},
             subject   = jsonb_set(v.subject, '{locale}',
                                   to_jsonb(${move.locale}::text), true)
       WHERE v.lane = ${WORD_CLAIM_LANE}
         AND v.claim_key = ${move.from}
         AND NOT EXISTS (
           SELECT 1 FROM claim_verdicts d
            WHERE d.lane = v.lane AND d.claim_key = ${move.to}
              AND d.rule_version = v.rule_version
              AND d.fold_version = v.fold_version)`;
    superseded += await tx.$executeRaw`
      DELETE FROM claim_verdicts
       WHERE lane = ${WORD_CLAIM_LANE} AND claim_key = ${move.from}`;
  }
  return { moved, superseded };
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const targets: Target[] = [];
  const missing: string[] = [];
  for (const revert of REVERTS) {
    // Matched on the row as it stands NOW: at 'und', the vocabulary-sourced
    // recall row the forward run moved. A row already back at its language
    // (a second run) matches nothing and is reported as done, not re-moved.
    const found = await prisma.$queryRaw<
      Array<{ surface_id: string; entity_id: string; entity_name: string }>
    >`
      SELECT s.surface_id::text AS surface_id, s.entity_id::text AS entity_id,
             e.name AS entity_name
        FROM entity_surface s
        JOIN core_entities e ON e.entity_id = s.entity_id
       WHERE s.form = ${revert.form}
         AND LOWER(s.locale) = 'und'
         AND s.source = 'vocabulary'
         AND s.role = 'recall'
         AND e.name = ${revert.entityName}`;
    if (found.length !== 1) {
      missing.push(
        `${revert.form} [${revert.entityName}] -> ${revert.locale}: ${found.length} matching rows (expected 1)`,
      );
      continue;
    }
    targets.push({
      ...found[0],
      form: revert.form,
      locale: revert.locale,
      why: revert.why,
    });
  }

  console.log(
    `\nrows to give a language back: ${targets.length} of ${REVERTS.length}`,
  );
  for (const target of targets) {
    console.log(
      `  ${pad(target.form, 12)} und -> ${pad(target.locale, 4)}  [${target.entity_name}]`,
    );
    console.log(`      ${target.why}`);
  }
  if (missing.length) {
    console.log(`\n  NOT FOUND (already reverted, or the row moved on):`);
    for (const line of missing) console.log(`    ${line}`);
  }

  // A row cannot move to a locale where its concept already holds that exact
  // form — the unique is (entity_id, locale, form). Checked and reported
  // rather than caught: a collision here means the corpus is not the one this
  // ruling was made against, and silently folding two rows would destroy the
  // very distinction being restored.
  const blocked: Target[] = [];
  for (const target of targets) {
    const clash = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM entity_surface
       WHERE entity_id = ${target.entity_id}::uuid
         AND LOWER(locale) = ${target.locale}
         AND form = ${target.form}`;
    if (Number(clash[0]?.n ?? 0) > 0) blocked.push(target);
  }
  if (blocked.length) {
    console.log(
      `\n  BLOCKED — the concept already holds this exact form at the destination locale:`,
    );
    for (const target of blocked) {
      console.log(
        `    ${target.form} -> ${target.locale} [${target.entity_name}]`,
      );
    }
  }
  const movable = targets.filter((t) => !blocked.includes(t));

  const verdictMoves = movable.map((target) => ({
    from: wordClaimLane.canonicalClaimKey({
      form: target.form,
      locale: 'und',
      entityId: target.entity_id,
    }),
    to: `${target.locale}|${surfaceClaimKey(target.form)}|${target.entity_id}`,
    locale: target.locale,
  }));
  const heldKeys = new Set(
    (
      await prisma.$queryRaw<Array<{ claim_key: string }>>`
        SELECT DISTINCT claim_key FROM claim_verdicts
         WHERE lane = ${WORD_CLAIM_LANE}`
    ).map((row) => row.claim_key),
  );
  const withVerdicts = verdictMoves.filter((move) => heldKeys.has(move.from));
  console.log(
    `\n  paid verdicts riding along (re-keyed und -> language): ${withVerdicts.length}`,
  );
  for (const move of withVerdicts) {
    console.log(`    ${move.from}  ->  ${move.to}`);
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.\n');
    await prisma.$disconnect();
    return;
  }

  let moved = 0;
  let verdictsMoved = 0;
  let verdictsSuperseded = 0;
  // ONE TRANSACTION for the whole repair: five rows and their verdicts are one
  // ruling, and a partial application would leave the corpus in a state no
  // reasoning covers.
  await prisma.$transaction(async (tx) => {
    for (const target of movable) {
      moved += await tx.$executeRaw`
        UPDATE entity_surface SET locale = ${target.locale}, updated_at = now()
         WHERE surface_id = ${target.surface_id}::uuid`;
    }
    const result = await moveClaimVerdicts(tx, verdictMoves);
    verdictsMoved += result.moved;
    verdictsSuperseded += result.superseded;
  });
  console.log(
    `\nAPPLIED: ${moved} rows given their language back.` +
      `\n         ${verdictsMoved} verdicts re-keyed, ` +
      `${verdictsSuperseded} dropped as superseded by a verdict already at the destination.\n`,
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
