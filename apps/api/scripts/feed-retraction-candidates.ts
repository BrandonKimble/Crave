/**
 * @script-class: operational
 *
 * THE RETRACTION FEED — how a MIS-BANKED word gets a hearing it could never
 * have had.
 *
 * A wrong surface is a wrong word→concept claim, so retraction is the CLAIMS
 * machinery, not a new mechanism: this script only decides WHICH claims are
 * offered. Since H5 (2026-08-12) it does not even own that — the due-predicate
 * lives in the adjudicator (`dueClaims`), and this script asks it for the
 * COLLISION-SHAPED subset. That is the difference between the two drivers:
 * `rehear-word-claims.ts` offers everything due in a locale, this one offers
 * the highest-yield shape first when a budget will only reach some of it.
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
 * WHAT IS EXCLUDED, AND WHY (all of it now enforced by the due-predicate, not
 * by a query copy that could drift from it):
 *   - CLAIMS ALREADY DECIDED AT THE CURRENT RULE. A hearing ruled on this
 *     pairing; re-offering it would pay for the same answer forever. A rule
 *     bump re-opens it — that is the ONLY thing that does.
 *   - TESTIMONY SOURCES. Only INFERRED claims are offered: testimony is a real
 *     person's word, not a hearing anyone lost, and it is unevictable by law
 *     elsewhere in this machinery.
 *
 * The HEARING KIND is no longer asserted here. A live recall row can only be
 * asked "should this still hold?" and a lost row can only be asked "may this
 * be taken?" — the row's state decides, so the feed cannot mis-state the
 * question and pay for an answer that cannot act.
 *
 * Run:
 *   npx ts-node -T scripts/feed-retraction-candidates.ts                 # dry run
 *   npx ts-node -T scripts/feed-retraction-candidates.ts --locale vi --limit 20
 *   npx ts-node -T scripts/feed-retraction-candidates.ts --locale vi --limit 20 --apply
 *
 * --apply SPENDS REAL LLM CALLS and writes verdicts; beyond the standing cap
 * it refuses with an estimate to approve (--approve-drain <hash>).
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WordClaimAdjudicatorService } from '../src/modules/content-processing/entity-resolver/word-claim-adjudicator.service';
import { CLAIM_JUDGE_PROMPT_VERSION } from '../src/modules/content-processing/entity-resolver/claim-judge-rule';
import {
  ClaimRehearingBudgetService,
  DrainExceedsStandingCapError,
  StaleDrainApprovalError,
} from '../src/modules/content-processing/entity-resolver/claim-rehearing-budget.service';
import { WORD_CLAIM_LANE } from '../src/modules/content-processing/entity-resolver/word-claim-lane';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/** Claims per adjudicate() call — the adjudicator batches 10 per LLM call,
 *  so this only bounds how much work one transaction wave does. */
const BATCH = 20;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const locale = flag('locale') ?? 'vi';
  const limit = Number(flag('limit') ?? 50);
  const approvedHash = flag('approve-drain');
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
    const judge = app.get(WordClaimAdjudicatorService);
    const budget = app.get(ClaimRehearingBudgetService);

    const resumed = await judge.resumePendingEffects();
    if (resumed) out(`resumed=${resumed} decided-but-unexecuted verdicts`);

    const selection = { forms, collisionsOnly: true } as const;
    const dueTotal = await judge.countDue(locale, selection);
    out(
      `candidates=${dueTotal} locale=${locale} rule=v${CLAIM_JUDGE_PROMPT_VERSION}` +
        (forms.length ? ` forms=${forms.join(',')}` : ''),
    );

    let allowed = limit;
    try {
      const authorized = await budget.authorizeDrain({
        lane: WORD_CLAIM_LANE,
        ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
        dueCount: dueTotal,
        requested: limit,
        approvedHash,
      });
      allowed = authorized.allowed;
    } catch (error) {
      if (
        error instanceof DrainExceedsStandingCapError ||
        error instanceof StaleDrainApprovalError
      ) {
        out(`REFUSED — ${error.message}`);
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    const claims = await judge.dueClaims(locale, {
      ...selection,
      limit: allowed,
    });
    for (const claim of claims) {
      out(
        `  [${claim.hearing ?? 'grant'}] "${claim.form}" (${claim.locale}) on ${claim.entityId}`,
      );
    }
    if (!apply) {
      out('\nDRY RUN — add --apply to feed these to the hearing.');
      return;
    }

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
