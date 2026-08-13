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
 * IDEMPOTENT: re-running finds nothing to do. REPORT-THEN-APPLY: it prints
 * the full picture and changes nothing without `--apply`.
 *
 * Usage:
 *   npx ts-node -T scripts/data-fixes/retag-romanizations-to-und.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { PrismaClient } from '@prisma/client';
import { isRomanizationOfMarkedSibling } from '../../src/modules/content-processing/entity-resolver/entity-surface.service';
import { isAccented } from '../../src/modules/content-processing/entity-resolver/entity-identity';

const prisma = new PrismaClient();

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

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.\n');
    await prisma.$disconnect();
    return;
  }

  const foldIds = folding.map((r) => r.surface_id);
  const retagIds = retagging.map((r) => r.surface_id);
  const CHUNK = 2000;
  let carried = 0;
  let deleted = 0;
  let moved = 0;
  for (let i = 0; i < foldIds.length; i += CHUNK) {
    const ids = foldIds.slice(i, i + CHUNK);
    carried += await prisma.$executeRaw`
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
    deleted += await prisma.$executeRaw`
      DELETE FROM entity_surface WHERE surface_id = ANY(${ids}::uuid[])`;
  }
  for (let i = 0; i < retagIds.length; i += CHUNK) {
    const ids = retagIds.slice(i, i + CHUNK);
    moved += await prisma.$executeRaw`
      UPDATE entity_surface SET locale = 'und', updated_at = now()
       WHERE surface_id = ANY(${ids}::uuid[])`;
  }
  console.log(
    `\nAPPLIED: ${moved} re-tagged to 'und', ${deleted} folded into an existing und row (${carried} stamp carries).\n`,
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
