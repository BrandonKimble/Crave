/**
 * @script-class: operational
 *
 * THE REPAIR FOR THE EXTRACTION WRITE FLIP (2026-08-11).
 *
 * For one day (4d839ef3c -> 73a3b7228) the three extraction banking sites
 * stamped every form they learned with the CONFIGURED LANGUAGE OF THE
 * SUBREDDIT it was read out of. That is reader context asserted as word
 * identity: r/austinfood is configured `en` and is full of `birria`, `phở`
 * and `camarones`, so 10,670 rows were minted claiming, at confidence 1.0,
 * that those are English words — and the language detector takes an exact
 * surface hit as DIRECT EVIDENCE, so the claim fed straight back in as
 * ground truth ('bún đậu mắm tôm' -> en@1.00; 'cat' -> vi@1.00).
 *
 * WHAT THIS TOUCHES, AND WHY THE PREDICATE IS THE COORDINATION MECHANISM.
 * `source = 'extraction'` and nothing else. Extraction is the ONE writer that
 * observes a string without being told its language; every other writer that
 * puts a tag on a row was ASKED a per-language question (the vocabulary
 * generator: 'vocabulary'/'sweep'/'seed'/'manual'/'synthesis') or SETTLED a
 * word claim (the judge, `claim_judge_version`). Those rows are
 * language-knowledge and are left exactly as they are — including an English
 * vocabulary sweep running concurrently with this repair, whose `en` rows are
 * legitimate. Criteria, never timing: nothing here reads created_at.
 *
 * COLLISIONS FOLD INTO THE und ROW, WHICH IS A DELETE.
 * `entity_surface` is unique on (entity_id, locale, form), so a flipped row
 * whose entity already holds the same form at 'und' cannot simply be
 * re-tagged. The und row IS the merged result, byte-for-byte: had the flip
 * never happened, `addSurfaces` would have hit `ON CONFLICT (entity_id,
 * locale, form) DO UPDATE` on that very row, and for an extraction write
 * (source='extraction', role='recall', status='active') that clause changes
 * NOTHING — `source` is not in the update set at all, a pure recall re-offer
 * lifts neither status ('deprecated' stays, 'candidate' stays) nor role (a
 * 'display' row stays display, which is the memory that its recall claim
 * lost). So the stronger status and role are kept by keeping the und row and
 * dropping its language-tagged twin. Measured: 93 of 10,670.
 *
 * WHAT THE DELETE MAY HAVE COST, SAID PLAINLY (A0 R6, 2026-08-11). The
 * paragraph above argues the und row is the merged result "byte-for-byte",
 * and for role, status, source and confidence that is exactly right. There is
 * ONE column it is not right about: `claim_judge_version`. The word-claim
 * judge stamps that column on whatever surface row it settled or evicted,
 * WITHOUT regard to source — so a flipped extraction row could have carried a
 * verdict stamp that its und twin did not, and those 93 deletes would have
 * taken the stamp with them. The effect is bounded and self-healing rather
 * than silent corruption: a claim with no stamp is re-offered by
 * `staleVerdictClaims` and re-judged, so at most 93 claims were re-heard at
 * one LLM call each.
 *
 * IT CANNOT BE CHECKED NOW, AND THAT IS THE FINDING. There is no verdict
 * ledger — the stamp lives only on the row it stamps — so nothing recorded
 * which of the 93 carried one, and the rows are gone. This note exists
 * because "we cannot know" is a fact worth writing down, and because it is
 * the reason the two remaining fold paths (the addSurfaces conflict clause
 * and foldSurfacesFromMerge) now preserve the stamp in BOTH directions by
 * GREATEST, pinned by judge-stamp-survives-folds.integration.spec.ts. A
 * future repair that must delete a row should either carry the stamp forward
 * onto the survivor or record what it dropped.
 *
 * IDEMPOTENT: re-running finds nothing to do. REPORT-THEN-APPLY: it prints
 * the full before/after picture and changes nothing without `--apply`.
 *
 * Usage:
 *   yarn workspace api ts-node scripts/data-fixes/repair-extraction-surface-locale.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface LocaleCount {
  locale: string;
  n: bigint;
}

async function report(label: string): Promise<number> {
  const rows = await prisma.$queryRaw<LocaleCount[]>`
    SELECT lower(locale) AS locale, count(*)::bigint AS n
      FROM entity_surface
     WHERE source = 'extraction'
     GROUP BY 1
     ORDER BY 2 DESC`;
  console.log(`\n--- ${label}: extraction rows by locale ---`);
  let tagged = 0;
  for (const row of rows) {
    const n = Number(row.n);
    if (row.locale !== 'und') tagged += n;
    console.log(`  ${row.locale.padEnd(10)} ${n}`);
  }
  console.log(`  => carrying a LANGUAGE (must be 0): ${tagged}`);

  // The rows every other writer owns — printed so it is visible that the
  // repair does not touch them, and that a concurrent generator sweep is
  // landing rows while this runs.
  const others = await prisma.$queryRaw<
    Array<{ source: string; locale: string; n: bigint }>
  >`
    SELECT source, lower(locale) AS locale, count(*)::bigint AS n
      FROM entity_surface
     WHERE source <> 'extraction' AND lower(locale) <> 'und'
     GROUP BY 1, 2
     ORDER BY 3 DESC`;
  console.log(
    `--- ${label}: language-tagged rows of OTHER provenance (untouched) ---`,
  );
  for (const row of others) {
    console.log(
      `  ${row.source.padEnd(22)} ${row.locale.padEnd(8)} ${Number(row.n)}`,
    );
  }
  return tagged;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const before = await report('BEFORE');

  const [{ n: collisions }] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n
      FROM entity_surface e
     WHERE e.source = 'extraction'
       AND lower(e.locale) <> 'und'
       AND EXISTS (SELECT 1
                     FROM entity_surface u
                    WHERE u.entity_id = e.entity_id
                      AND u.locale = 'und'
                      AND u.form = e.form)`;
  console.log(
    `\ncollisions that fold into an existing und row (deleted): ${Number(collisions)}`,
  );
  console.log(
    `plain re-tags (locale -> 'und'): ${before - Number(collisions)}`,
  );

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.\n');
    await prisma.$disconnect();
    return;
  }

  const [deleted, retagged] = await prisma.$transaction([
    prisma.$executeRaw`
      DELETE FROM entity_surface e
       WHERE e.source = 'extraction'
         AND lower(e.locale) <> 'und'
         AND EXISTS (SELECT 1
                       FROM entity_surface u
                      WHERE u.entity_id = e.entity_id
                        AND u.locale = 'und'
                        AND u.form = e.form)`,
    prisma.$executeRaw`
      UPDATE entity_surface
         SET locale = 'und', updated_at = now()
       WHERE source = 'extraction'
         AND lower(locale) <> 'und'`,
  ]);
  console.log(
    `\nAPPLIED: ${deleted} folded (deleted), ${retagged} re-tagged to 'und'.`,
  );

  const after = await report('AFTER');
  console.log(
    `\n${after === 0 ? 'GREEN' : `RED — ${after} extraction rows still carry a language`}\n`,
  );
  await prisma.$disconnect();
  if (after !== 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
