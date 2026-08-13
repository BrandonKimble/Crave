/**
 * @script-class: operational
 *
 * THE RE-HEARING — how a wrong CLASS of word-claim verdicts is corrected.
 *
 * A verdict is remembered forever, which is right: without memory the same
 * losing claim is re-proposed every night. But it made a wrong JUDGING RULE
 * uncorrectable except by editing rows by hand — which is what happened to
 * `chả giò` and `chảy` on 2026-08-09, does not scale, and leaves no reason on
 * the record.
 *
 * So every verdict is a row in `claim_verdicts` carrying the rule version that
 * reached it, and this script offers the claims with NO VERDICT AT THE CURRENT
 * RULE. Same judge, same writer, same memory — only the SELECTION differs,
 * exactly like the vocabulary sweep's `--concepts`. Nothing here banks a
 * verdict by hand; the machinery decides, and this prints what it decided
 * and why.
 *
 * SYMMETRIC NOW (H5, 2026-08-12). The predicate this used to read could only
 * see claims that LOST, because only a loss left a row to stamp. A bump
 * re-opens grants too — including the uncontested banks nobody ever contested.
 *
 * AND CAPPED. A rule bump can make a large population due at once, and
 * draining it is a spend event: beyond the standing cap this REFUSES with an
 * estimate, and prints the hash to approve.
 *
 * Run:
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale vi            # count only
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale vi --words "tôm,chè" --apply
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale vi --limit 30 --apply
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale vi --limit 900 --apply \
 *        --approve-drain <hash>
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale all          # every docket
 *
 * `--locale all` opens EVERY BANKABLE DOCKET (`CLAIMABLE_LOCALES`), which is
 * the serve list PLUS `und`. Naming the four served languages by hand is how
 * 321 `und` rows stayed permanently unheard: they were never judged wrong,
 * they were never enumerated. Each row is still keyed by its OWN locale, so
 * widening the scan cannot merge two languages' claims.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import {
  WordClaimAdjudicatorService,
  type AdjudicationSummary,
} from '../src/modules/content-processing/entity-resolver/word-claim-adjudicator.service';
import { CLAIM_JUDGE_PROMPT_VERSION } from '../src/modules/content-processing/entity-resolver/claim-judge-rule';
import {
  DrainExceedsStandingCapError,
  StaleDrainApprovalError,
} from '../src/modules/content-processing/entity-resolver/claim-rehearing-budget.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { CLAIMABLE_LOCALES } from '../src/shared/locale';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const localeArg = flag('locale') ?? 'vi';
  const locale: string | readonly string[] =
    localeArg === 'all' ? CLAIMABLE_LOCALES : localeArg;
  /** what the run PRINTS as its docket — a set renders as its members, so the
   *  log names every docket actually opened rather than the word "all". */
  const localeLabel = typeof locale === 'string' ? locale : locale.join(',');
  const limit = Number(flag('limit') ?? 50);
  const approvedHash = flag('approve-drain');
  const words = (flag('words') ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
  const apply = argv.includes('--apply');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m: string) => process.stdout.write(`${m}\n`);
  try {
    const judge = app.get(WordClaimAdjudicatorService);

    // FINISH FIRST. A previous run may have died between a verdict and its
    // effect; those decisions are already paid for and must be obeyed before
    // anything new is decided.
    const resumed = await judge.resumePendingEffects();
    if (resumed) out(`resumed=${resumed} decided-but-unexecuted verdicts`);

    const dueTotal = await judge.countDue(locale, { forms: words });
    out(
      `due=${dueTotal} locale=${localeLabel} rule=v${CLAIM_JUDGE_PROMPT_VERSION}${
        words.length ? ` words=${words.join(',')}` : ''
      }`,
    );

    // NO SECOND GATE HERE (2026-08-13). `adjudicate` authorizes the drain it
    // is about to run; quoting a different population up here and approving
    // THAT is how an approval hash comes to name work nobody performed.
    const due = await judge.dueClaims(locale, { limit, forms: words });
    out(`offering=${due.length}`);
    if (!apply) {
      out('DRY RUN — add --apply to re-hear. Claims due:');
      for (const claim of due) {
        out(
          `  [${claim.hearing ?? 'grant'}] ${claim.form} (${claim.entityId})`,
        );
      }
      return;
    }
    let summary: AdjudicationSummary;
    try {
      summary = await judge.adjudicate(due, { approvedHash });
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
    for (const c of summary.cases) {
      out(
        `${c.outcome.padEnd(17)} "${c.form}" → ${c.targetName}` +
          (c.evicted.length ? ` | evicted: ${c.evicted.join(', ')}` : '') +
          (c.upheld.length ? ` | upheld: ${c.upheld.join(', ')}` : '') +
          `\n    reason: ${c.reason}`,
      );
    }
    out(
      JSON.stringify({
        ...summary,
        cases: summary.cases.length,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
