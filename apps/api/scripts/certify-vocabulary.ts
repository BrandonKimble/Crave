/**
 * @script-class: operational
 *
 * CERTIFY THE VOCABULARY — buy, once, the two answers the query path used to
 * carry as hand-typed word lists.
 *
 * THE POPULATION is every distinct word in every banked surface, asked in the
 * locale that surface carries AND in `und`. Both, deliberately:
 *
 *   - IN ITS OWN LOCALE, because that is where the answer is true. `no` is a
 *     negator in Spanish and in English and the two are separate rulings.
 *   - IN `und`, because that is the tag most asks actually arrive under. The
 *     language detector declines on one- and two-word queries — which is most
 *     of them — and a term nobody could place reaches the door as `und`. If
 *     `und` were not certified, the door would read a miss on nearly every
 *     real ask and behave as if nothing had ever been judged.
 *
 * THE SPEND IS QUOTED BEFORE IT IS PAID, by the same budget gate every hearing
 * lane uses: a drain beyond the standing allowance refuses and prints an
 * estimate hash to approve. The rate is measured from THIS lane's own metered
 * spend — never seeded — so the first run must be a small one within the
 * allowance, which is what publishes the rate. `--head N` exists for exactly
 * that: certify a slice, read the real cost, then quote the rest.
 *
 * Run:
 *   npx ts-node -T scripts/certify-vocabulary.ts                    # count only
 *   npx ts-node -T scripts/certify-vocabulary.ts --head 200 --apply # measure the rate
 *   npx ts-node -T scripts/certify-vocabulary.ts --apply --approve-drain <hash>
 *   npx ts-node -T scripts/certify-vocabulary.ts --lane word-negation --apply
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  WordVocabularyJudgeService,
  type VocabularyCertificationSummary,
} from '../src/modules/content-processing/entity-resolver/word-vocabulary-judge.service';
import {
  WORD_GENERICNESS_LANE,
  WORD_GENERICNESS_RULE_VERSION,
  WORD_NEGATION_LANE,
  WORD_NEGATION_RULE_VERSION,
  normalizeClaimLocale,
  wordGenericnessLane,
  type WordVocabularyClaim,
} from '../src/modules/content-processing/entity-resolver/word-vocabulary-lanes';
import {
  ClaimRehearingBudgetService,
  DrainExceedsStandingCapError,
  NoMeasuredHearingRateError,
  StaleDrainApprovalError,
} from '../src/modules/content-processing/entity-resolver/claim-rehearing-budget.service';
import { segmentWords } from '../src/modules/entity-text-search/query-analyzer';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * THE CANDIDATE WORDS. Read from `entity_surface` because that is the corpus's
 * own vocabulary — every string the app has ever decided is a way to say
 * something. The SQL splits nothing: segmentation happens in TypeScript, using
 * the analyzer's own word boundaries, so the words a hearing is bought for are
 * byte-identical to the words the door will later look up. A Postgres
 * `regexp_split_to_table` would have cut 好吃的 as one word and quietly left
 * every Mandarin particle uncertified.
 */
async function candidateWords(
  prisma: PrismaService,
): Promise<WordVocabularyClaim[]> {
  const rows = await prisma.$queryRaw<Array<{ form: string; locale: string }>>`
    SELECT DISTINCT form, locale FROM entity_surface`;
  const byKey = new Map<string, WordVocabularyClaim>();
  for (const row of rows) {
    const locale = normalizeClaimLocale(row.locale);
    for (const span of segmentWords(row.form)) {
      for (const tag of locale === 'und' ? ['und'] : [locale, 'und']) {
        const claim = { word: span.word, locale: tag };
        byKey.set(wordGenericnessLane.canonicalClaimKey(claim), claim);
      }
    }
  }
  return [...byKey.values()];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const laneArg = flag('lane');
  const lanes = laneArg
    ? [laneArg]
    : [WORD_GENERICNESS_LANE, WORD_NEGATION_LANE];
  const head = flag('head') ? Number(flag('head')) : null;
  const approvedHash = flag('approve-drain');
  const apply = argv.includes('--apply');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m: string) => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const judge = app.get(WordVocabularyJudgeService);
    const budget = app.get(ClaimRehearingBudgetService);

    const all = await candidateWords(prisma);
    const words = head ? all.slice(0, head) : all;
    out(
      `population=${all.length} offering=${words.length} ` +
        `rules=genericness:v${WORD_GENERICNESS_RULE_VERSION},negation:v${WORD_NEGATION_RULE_VERSION}`,
    );

    for (const lane of lanes) {
      // FINISH FIRST. A previous run may have died between a verdict and the
      // cache learning it; those decisions are paid for already.
      const resumed = await judge.resumePendingEffects(lane);
      if (resumed) out(`${lane}: resumed=${resumed}`);

      const decided = await judge.decidedOutcomes(lane, words);
      const due = words.length - decided.size;
      out(`${lane}: decided=${decided.size} due=${due}`);
      if (!due) continue;

      if (!apply) {
        try {
          const estimate = await budget.estimate(
            lane,
            lane === WORD_NEGATION_LANE
              ? WORD_NEGATION_RULE_VERSION
              : WORD_GENERICNESS_RULE_VERSION,
            due,
          );
          out(
            `${lane}: quote $${(estimate.estimateMicros / 1_000_000).toFixed(2)} ` +
              `(${due} x $${(estimate.microUsdPerHearing / 1_000_000).toFixed(6)}) ` +
              `hash=${estimate.estimateHash}`,
          );
        } catch (error) {
          if (error instanceof NoMeasuredHearingRateError) {
            out(`${lane}: NO MEASURED RATE YET — ${error.message}`);
          } else throw error;
        }
        continue;
      }

      let summary: VocabularyCertificationSummary;
      try {
        summary = await judge.certify(lane, words, { approvedHash });
      } catch (error) {
        if (
          error instanceof DrainExceedsStandingCapError ||
          error instanceof StaleDrainApprovalError ||
          error instanceof NoMeasuredHearingRateError
        ) {
          out(`${lane}: REFUSED — ${error.message}`);
          process.exitCode = 1;
          continue;
        }
        throw error;
      }
      out(`${lane}: ${JSON.stringify(summary)}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
