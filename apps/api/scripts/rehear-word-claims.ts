/**
 * @script-class: operational
 *
 * THE RE-HEARING — how a wrong CLASS of word-claim verdicts is corrected.
 *
 * A verdict is remembered forever (a refused newcomer is status='deprecated';
 * an evicted incumbent is role='display'), which is right: without memory the
 * same losing claim is re-proposed every night. But it made a wrong JUDGING
 * RULE uncorrectable except by editing rows by hand — which is what happened
 * to `chả giò` and `chảy` on 2026-08-09, does not scale, and leaves no reason
 * on the record.
 *
 * So every verdict now carries the judge's rule version
 * (`entity_surface.claim_judge_version`), and this script re-offers the claims
 * that an older rule settled. Same judge, same writer, same memory — only the
 * SELECTION differs, exactly like the vocabulary sweep's `--concepts`. Nothing
 * here banks a verdict by hand; the machinery decides, and this prints what it
 * decided and why.
 *
 * Run:
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale vi            # count only
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale vi --words "tôm,chè" --apply
 *   npx ts-node -T scripts/rehear-word-claims.ts --locale vi --limit 30 --apply
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WordClaimAdjudicatorService } from '../src/modules/content-processing/entity-resolver/word-claim-adjudicator.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const locale = flag('locale') ?? 'vi';
  const limit = Number(flag('limit') ?? 50);
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
    const due = await judge.staleVerdictClaims(locale, {
      limit,
      forms: words,
    });
    out(
      `due=${due.length} locale=${locale}${words.length ? ` words=${words.join(',')}` : ''}`,
    );
    if (!apply) {
      out('DRY RUN — add --apply to re-hear. Claims due:');
      for (const claim of due) out(`  ${claim.form} (${claim.entityId})`);
      return;
    }
    const summary = await judge.adjudicate(due);
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
