/**
 * @script-class: operational
 *
 * THE RETRACTION FEED — how a MIS-BANKED word gets a hearing it could never
 * have had.
 *
 * A wrong surface is a wrong word→concept claim, so retraction is the CLAIMS
 * machinery, not a new mechanism: this script only decides WHICH claims are
 * offered, exactly like `rehear-word-claims.ts` (stale rule version) and the
 * vocabulary sweep (`--concepts`). Nothing here edits a row by hand; the judge
 * decides and its verdict is written by the adjudicator, with the rule version
 * stamped so the decision can itself be re-opened.
 *
 * THE PROBE — surface vs NAME collision. A surface whose `form_folded` equals
 * a DIFFERENT active entity's `identity_key`, of the SAME type, is a word that
 * two concepts answer to, where one of them holds it as its very identity. It
 * is the highest-yield shape for a mis-bank because the collision guard cannot
 * see it after the fact: the guard runs at WRITE time, so anything banked
 * before the guard existed, or banked while the twin did not yet exist, is
 * sitting in the corpus grounding mentions at 0.95 with nobody contesting it.
 * `bánh cuộn` on `wrap` is the case that named this class — and being
 * uncontested is precisely why the judge never met it, until the single-
 * claimant hearing (word-claim-adjudicator.service.ts).
 *
 * WHAT IS EXCLUDED, AND WHY:
 *   - JUDGE-UPHELD ROWS (`claim_judge_version IS NOT NULL AND status =
 *     'active'`). A hearing already ruled this pairing right. Re-offering it
 *     would pay for the same answer forever — the stamp IS the memory, on the
 *     upholding side as much as the losing side.
 *   - ROWS WHOSE OWNER IS THE NAMED ENTITY. An entity holding a surface that
 *     folds to its own name is not a collision, it is a spelling of itself.
 *   - TESTIMONY SOURCES. Only INFERRED claims are re-offered, the same set
 *     `staleVerdictClaims` selects: testimony is a real person's word, not a
 *     hearing anyone lost, and it is unevictable by law elsewhere in this
 *     machinery. Feeding it would ask the judge a question whose answer
 *     nothing may act on.
 *   - DISPLAY-ONLY AND DEPRECATED ROWS. They hold no recall claim, so there is
 *     nothing to take back.
 *
 * Run:
 *   npx ts-node -T scripts/feed-retraction-candidates.ts                 # dry run
 *   npx ts-node -T scripts/feed-retraction-candidates.ts --locale vi --limit 20
 *   npx ts-node -T scripts/feed-retraction-candidates.ts --limit 20 --apply
 *
 * --apply SPENDS REAL LLM CALLS and writes verdicts. The corpus-wide run is
 * sequenced AFTER the v8 dedupe (a merge removes twins, and a hearing held
 * against a duplicate that is about to disappear is a question about nothing).
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import {
  WordClaimAdjudicatorService,
  type ContestedClaim,
} from '../src/modules/content-processing/entity-resolver/word-claim-adjudicator.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface CandidateRow {
  form: string;
  locale: string;
  entity_id: string;
  source: string;
  owner: string;
  owner_type: string;
  named: string;
}

/** Claims per adjudicate() call — the adjudicator batches 10 per LLM call,
 *  so this only bounds how much work one transaction wave does. */
const BATCH = 20;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const locale = flag('locale');
  const limit = Number(flag('limit') ?? 50);
  const forms = (flag('forms') ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  const apply = argv.includes('--apply');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m: string) => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const judge = app.get(WordClaimAdjudicatorService);

    const rows = await prisma.$queryRaw<CandidateRow[]>`
      SELECT s.form, s.locale, s.entity_id::text, s.source,
             owner.name AS owner, owner.type::text AS owner_type,
             named.name  AS named
        FROM entity_surface s
        JOIN core_entities owner ON owner.entity_id = s.entity_id
        JOIN core_entities named
          ON named.identity_key = s.form_folded
         AND named.type = owner.type
         AND named.status = 'active'
         AND named.entity_id <> s.entity_id
       WHERE s.status = 'active'
         AND s.role <> 'display'
         AND owner.status = 'active'
         -- INFERRED ONLY (see the header): testimony is evidence, not a claim
         -- anyone judged.
         AND s.source IN ('vocabulary', 'sweep', 'knowledge_synthesis',
                          'seed', 'query_banking', 'synthesis')
         -- A hearing already upheld this pairing; the stamp is the memory.
         AND s.claim_judge_version IS NULL
         AND (${locale === null} OR s.locale = ${locale ?? ''})
         AND (${forms.length === 0} OR s.form = ANY(${forms}::text[]))
       ORDER BY s.updated_at ASC
       LIMIT ${limit}`;

    out(
      `candidates=${rows.length}${locale ? ` locale=${locale}` : ''}${
        forms.length ? ` forms=${forms.join(',')}` : ''
      }`,
    );
    for (const row of rows) {
      out(
        `  "${row.form}" (${row.locale}) banked on ${row.owner}[${row.owner_type}]` +
          ` — but "${row.named}" IS that word`,
      );
    }
    if (!apply) {
      out('\nDRY RUN — add --apply to feed these to the hearing.');
      return;
    }

    const claims: ContestedClaim[] = rows.map((row) => ({
      form: row.form,
      locale: row.locale,
      entityId: row.entity_id,
      source: row.source as ContestedClaim['source'],
      // THE RETAIN QUESTION: these rows are already banked and already
      // grounding mentions. The hearing asks whether they should be, which is
      // a real question even when nothing contests them — the whole reason a
      // mis-bank with no rival was previously uncorrectable.
      hearing: 'retain' as const,
    }));
    for (let i = 0; i < claims.length; i += BATCH) {
      const summary = await judge.adjudicate(claims.slice(i, i + BATCH));
      for (const c of summary.cases) {
        out(
          `${c.outcome.padEnd(17)} "${c.form}" → ${c.targetName}` +
            (c.evicted.length ? ` | evicted: ${c.evicted.join(', ')}` : '') +
            `\n    reason: ${c.reason}`,
        );
      }
      out(JSON.stringify({ ...summary, cases: summary.cases.length }));
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
