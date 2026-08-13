/**
 * @script-class: operational
 *
 * THE BACKFILL FOR THE ROMANIZATION TAG (2026-08-12).
 *
 * The vocabulary generator banked DE-ACCENTED ROMANIZATIONS under a LANGUAGE
 * tag — 'thit', 'vit', 'buoi' as `vi`, sitting beside the very rows they are
 * the stripped spelling OF. A language tag is a claim that somebody spells it
 * that way in that language; a romanization is the universal convenience
 * spelling and belongs at 'und'. The write ingress refuses to mint another
 * one (`isRomanizationOfMarkedSibling`, entity-surface.service.ts, where the
 * rule and its reasoning are stated in full). This re-tags the rows already
 * banked.
 *
 * WHY IT MATTERS, in one line: `admitsAtExactTier` reads a language-tagged
 * accent-free form as a word the user spelled IN FULL, so a mis-tagged
 * romanization makes 'salad vit' stop claiming 'salad vịt'.
 *
 * THE PREDICATE IS THE APP'S, NOT SQL's. `isAccented`/`canonicalFold` are the
 * one implementation (the fold law: no SQL fold expression, ever), so the
 * candidate rows are FETCHED broadly and JUDGED here, row by row, by the same
 * function the ingress calls. A row moves only when its own concept already
 * spells that same folded word WITH accents in that same language — a plain
 * vi word with no marked sibling anywhere on the concept is a real vi
 * spelling ('chay', vegetarian) and is left alone. That split is measured and
 * printed, because it is the whole risk of this repair.
 *
 * TWO EXEMPTIONS, both to avoid trading one lie for a worse one:
 *  - a row ELECTED as its locale's default label (`is_default`) stays: moving
 *    it leaves that language with no label at all;
 *  - a row whose concept already holds the identical form at 'und' cannot be
 *    re-tagged (unique on entity_id, locale, form) — it FOLDS into the und
 *    row, carrying `prompt_version` and `claim_judge_version` forward by
 *    GREATEST first so a settled hearing is not forgotten (the stamp the
 *    extraction-locale repair had to admit it may have dropped), then the
 *    language-tagged twin is deleted.
 *
 * THE LOCALE IS PART OF THE CLAIM KEY, SO A LOCALE MOVE IS A LEDGER MOVE
 * (2026-08-13, after this script orphaned 9 paid verdicts). A word claim is
 * keyed `locale|form|entity` in `claim_verdicts` — that is the whole point of
 * the locale being in the key: `chay` in vi and `chay` in es are different
 * questions. Re-tagging a surface vi -> und therefore RENAMES the claim, and a
 * verdict left behind under the old name is not merely untidy: the claim reads
 * as never heard, `dueClaims('und')` offers it again, and the corpus pays a
 * second time for an answer it already owns — with the first verdict's reason
 * stranded where nothing will ever read it.
 *
 * THE RULE, for this script and any future one: **anything that moves a
 * surface's locale, form or entity moves its verdicts in the SAME
 * TRANSACTION** — key AND `subject.locale`, since the subject is what a
 * resumed effect replays. A move is a RENAME, never a re-hearing: the ruling
 * did not change, only the name of the thing it ruled on.
 *
 * It also REPAIRS the orphans an earlier run already made, by the same rule
 * (a verdict whose language-tagged claim no longer has a surface, whose
 * concept holds that exact word at 'und', belongs to the und claim). Nine
 * rows, all paid for.
 *
 * IDEMPOTENT: re-running finds nothing to do. REPORT-THEN-APPLY: it prints
 * the full picture and changes nothing without `--apply`.
 *
 * Usage:
 *   npx ts-node -T scripts/data-fixes/retag-romanizations-to-und.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { Prisma, PrismaClient } from '@prisma/client';
import {
  isRomanizationOfMarkedSibling,
  surfaceClaimKey,
} from '../../src/modules/content-processing/entity-resolver/entity-surface.service';
import { isAccented } from '../../src/modules/content-processing/entity-resolver/entity-identity';
import {
  WORD_CLAIM_LANE,
  wordClaimLane,
} from '../../src/modules/content-processing/entity-resolver/word-claim-lane';

const prisma = new PrismaClient();

/**
 * MOVE A CLAIM'S VERDICTS TO ITS NEW NAME. A rename, not a re-hearing: the
 * ruling, its ground and its executed state all survive intact, under the key
 * the claim is now called by.
 *
 * `subject.locale` moves with the key because the subject is what a resumed
 * effect replays — a verdict whose key says 'und' and whose subject still
 * says 'vi' would, on replay, write the row this script just moved back where
 * it came from.
 *
 * A verdict may ALREADY exist at the destination (both spellings were heard
 * before the tags were fixed). The destination's is the one about the claim
 * as it is now named, so it stands and the old row is dropped: two verdicts
 * cannot share one claim, and inventing a merge rule between them would be
 * this script deciding a case no judge heard.
 */
async function moveClaimVerdicts(
  tx: Prisma.TransactionClient,
  moves: ReadonlyArray<{ from: string; to: string }>,
): Promise<{ moved: number; superseded: number }> {
  let moved = 0;
  let superseded = 0;
  for (const move of moves) {
    moved += await tx.$executeRaw`
      UPDATE claim_verdicts v
         SET claim_key = ${move.to},
             subject   = jsonb_set(v.subject, '{locale}', '"und"'::jsonb, true)
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

interface SurfaceRow {
  surface_id: string;
  entity_id: string;
  form: string;
  locale: string;
  is_default: boolean;
  status: string;
  source: string;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  // EVERY language-tagged row, of every status and provenance. The judgment
  // below is about what a tag CLAIMS, and a candidate/deprecated row claims
  // it just as loudly as an active one; the sibling evidence likewise counts
  // whatever spelling the concept holds.
  const rows = await prisma.$queryRaw<SurfaceRow[]>`
    SELECT surface_id::text AS surface_id, entity_id::text AS entity_id,
           form, LOWER(locale) AS locale, is_default, status, source
      FROM entity_surface
     WHERE LOWER(locale) <> 'und'`;

  // Concept + language -> its spellings. This IS the sibling evidence.
  const byConcept = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.entity_id}\0${row.locale}`;
    const held = byConcept.get(key);
    if (held) held.push(row.form);
    else byConcept.set(key, [row.form]);
  }

  const romanizations: SurfaceRow[] = [];
  const genuinePlain: SurfaceRow[] = [];
  const exemptDefaults: SurfaceRow[] = [];
  for (const row of rows) {
    if (isAccented(row.form)) continue;
    const siblings = byConcept.get(`${row.entity_id}\0${row.locale}`) ?? [];
    if (!isRomanizationOfMarkedSibling(row.form, siblings)) {
      genuinePlain.push(row);
      continue;
    }
    if (row.is_default) exemptDefaults.push(row);
    else romanizations.push(row);
  }

  const tally = (set: SurfaceRow[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const row of set)
      counts.set(row.locale, (counts.get(row.locale) ?? 0) + 1);
    return counts;
  };
  const locales = Array.from(
    new Set(rows.filter((r) => !isAccented(r.form)).map((r) => r.locale)),
  ).sort();
  const moves = tally(romanizations);
  const keeps = tally(genuinePlain);
  const defaults = tally(exemptDefaults);

  console.log(
    `\nlanguage-tagged surface rows: ${rows.length} (accent-free: ${
      romanizations.length + genuinePlain.length + exemptDefaults.length
    })`,
  );
  console.log(
    `\n  ${pad('locale', 8)}${pad('-> und', 10)}${pad('genuine', 10)}default-exempt`,
  );
  for (const locale of locales) {
    console.log(
      `  ${pad(locale, 8)}${pad(String(moves.get(locale) ?? 0), 10)}${pad(
        String(keeps.get(locale) ?? 0),
        10,
      )}${defaults.get(locale) ?? 0}`,
    );
  }
  console.log(
    `  ${pad('TOTAL', 8)}${pad(String(romanizations.length), 10)}${pad(
      String(genuinePlain.length),
      10,
    )}${exemptDefaults.length}`,
  );

  // A sample of BOTH verdicts, so the split can be eyeballed rather than
  // trusted — the genuine column is where a wrong call would be silent.
  const sample = (label: string, set: SurfaceRow[]): void => {
    console.log(
      `\n  ${label}: ${set
        .slice(0, 12)
        .map((r) => `${r.form}[${r.locale}]`)
        .join(', ')}`,
    );
  };
  sample('sample RE-TAGGED (romanizations)', romanizations);
  sample('sample KEPT (real unaccented words)', genuinePlain);

  // Which of the movers collide with an und row their concept already holds.
  const undHeld = new Set(
    (
      await prisma.$queryRaw<Array<{ entity_id: string; form: string }>>`
        SELECT entity_id::text AS entity_id, form
          FROM entity_surface WHERE LOWER(locale) = 'und'`
    ).map((r) => `${r.entity_id}\0${r.form}`),
  );
  const folding = romanizations.filter((r) =>
    undHeld.has(`${r.entity_id}\0${r.form}`),
  );
  const retagging = romanizations.filter(
    (r) => !undHeld.has(`${r.entity_id}\0${r.form}`),
  );
  console.log(
    `\n  fold into an existing und row (stamps carried, then deleted): ${folding.length}`,
  );
  console.log(
    `  plain re-tags (locale -> 'und'):                              ${retagging.length}`,
  );

  // THE ORPHANS AN EARLIER RUN ALREADY MADE. Same rule as the move below,
  // applied to verdicts whose surface has ALREADY gone to 'und' — a
  // language-tagged claim with no surface left, on a concept that holds that
  // exact word at 'und'. Detected here rather than in SQL because the claim
  // key is canonicalized in TypeScript and re-deriving it in SQL would mint a
  // second definition of what one claim is.
  const claimKeyOf = (row: SurfaceRow): string =>
    wordClaimLane.canonicalClaimKey({
      form: row.form,
      locale: row.locale,
      entityId: row.entity_id,
    });
  const claimKeys = new Set(rows.map(claimKeyOf));
  const undRows = await prisma.$queryRaw<
    Array<{ entity_id: string; form: string }>
  >`SELECT entity_id::text AS entity_id, form
      FROM entity_surface WHERE LOWER(locale) = 'und'`;
  const undClaims = new Set(
    undRows.map((r) => `${r.entity_id}\0${surfaceClaimKey(r.form)}`),
  );
  const verdictKeys = await prisma.$queryRaw<Array<{ claim_key: string }>>`
    SELECT DISTINCT claim_key FROM claim_verdicts WHERE lane = ${WORD_CLAIM_LANE}`;
  const orphanMoves: Array<{ from: string; to: string }> = [];
  for (const { claim_key: key } of verdictKeys) {
    const first = key.indexOf('|');
    const last = key.lastIndexOf('|');
    if (first < 0 || last <= first) continue;
    const locale = key.slice(0, first);
    const form = key.slice(first + 1, last);
    const entityId = key.slice(last + 1);
    if (locale === 'und') continue;
    // Still has its own surface? Then it is not an orphan, whatever else
    // the concept holds.
    if (claimKeys.has(key)) continue;
    if (!undClaims.has(`${entityId}\0${form}`)) continue;
    orphanMoves.push({ from: key, to: `und|${form}|${entityId}` });
  }
  console.log(
    `\n  orphaned verdicts to re-key onto their 'und' claim: ${orphanMoves.length}`,
  );
  for (const move of orphanMoves.slice(0, 12)) {
    console.log(`    ${move.from}  ->  ${move.to}`);
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.\n');
    await prisma.$disconnect();
    return;
  }

  const CHUNK = 2000;
  let carried = 0;
  let deleted = 0;
  let moved = 0;
  let verdictsMoved = 0;
  let verdictsSuperseded = 0;

  // The verdict move rides in the SAME TRANSACTION as the locale move, in
  // both arms: a crash between them is exactly the orphan this repairs.
  const verdictMovesFor = (
    set: readonly SurfaceRow[],
  ): Array<{ from: string; to: string }> =>
    set.map((row) => ({
      from: claimKeyOf(row),
      to: `und|${surfaceClaimKey(row.form)}|${row.entity_id}`,
    }));

  for (let i = 0; i < folding.length; i += CHUNK) {
    const chunk = folding.slice(i, i + CHUNK);
    const ids = chunk.map((r) => r.surface_id);
    await prisma.$transaction(async (tx) => {
      carried += await tx.$executeRaw`
        UPDATE entity_surface u
           SET prompt_version = GREATEST(u.prompt_version, s.prompt_version),
               claim_judge_version = GREATEST(u.claim_judge_version,
                                              s.claim_judge_version),
               updated_at = now()
          FROM entity_surface s
         WHERE s.surface_id = ANY(${ids}::uuid[])
           AND u.entity_id = s.entity_id
           AND u.form = s.form
           AND LOWER(u.locale) = 'und'`;
      deleted += await tx.$executeRaw`
        DELETE FROM entity_surface WHERE surface_id = ANY(${ids}::uuid[])`;
      const result = await moveClaimVerdicts(tx, verdictMovesFor(chunk));
      verdictsMoved += result.moved;
      verdictsSuperseded += result.superseded;
    });
  }
  for (let i = 0; i < retagging.length; i += CHUNK) {
    const chunk = retagging.slice(i, i + CHUNK);
    const ids = chunk.map((r) => r.surface_id);
    await prisma.$transaction(async (tx) => {
      moved += await tx.$executeRaw`
        UPDATE entity_surface SET locale = 'und', updated_at = now()
         WHERE surface_id = ANY(${ids}::uuid[])`;
      const result = await moveClaimVerdicts(tx, verdictMovesFor(chunk));
      verdictsMoved += result.moved;
      verdictsSuperseded += result.superseded;
    });
  }
  if (orphanMoves.length) {
    const result = await prisma.$transaction((tx) =>
      moveClaimVerdicts(tx, orphanMoves),
    );
    verdictsMoved += result.moved;
    verdictsSuperseded += result.superseded;
  }
  console.log(
    `\nAPPLIED: ${moved} re-tagged to 'und', ${deleted} folded into an existing und row (${carried} stamp carries).` +
      `\n         ${verdictsMoved} verdicts re-keyed onto the moved claim, ` +
      `${verdictsSuperseded} dropped as superseded by a verdict already at the destination.\n`,
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
