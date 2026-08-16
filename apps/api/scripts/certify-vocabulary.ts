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
  laneWiring,
  type VocabularyCertificationSummary,
} from '../src/modules/content-processing/entity-resolver/word-vocabulary-judge.service';
import {
  WORD_GENERICNESS_LANE,
  WORD_GENERICNESS_RULE_VERSION,
  WORD_NEGATION_LANE,
  WORD_NEGATION_RULE_VERSION,
  WORD_ROLE_LANE,
  WORD_ROLE_RULE_VERSION,
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
import { ClaimVerdictLedgerService } from '../src/modules/content-processing/entity-resolver/claim-verdict-ledger.service';
import { FOLD_ALGORITHM_VERSION } from '../src/modules/content-processing/entity-resolver/entity-identity';
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
 *
 * PLUS the retired lists as a seed — see below.
 */

/**
 * THE RETIRED LISTS, AS POPULATION — never as verdicts.
 *
 * The brief that opened this work is explicit: the hand lists' entries become
 * SEEDED HEARINGS, judged like any other word, and are not copied in as
 * un-judged answers. This is that seed, and the distinction is the whole
 * point — nothing here asserts that `without` negates or that `top` is glue.
 * These are words the corpus does not happen to bank (`without` appears in no
 * surface form), so the surface scan would never offer them, and the door
 * would meet each one cold on the first real search that used it.
 *
 * Being a CANDIDATE GENERATOR is the honest job for a list: it decides which
 * questions get asked early, and the judge decides every answer. The judge has
 * already overruled several of these — `non` is not a negator in English (a
 * prefix needing attachment) and means "young/tender" in Vietnamese, which the
 * old cue list would have stripped out of a Vietnamese query.
 */
const RETIRED_LIST_SEED: ReadonlyArray<[string, string]> = [
  ['no', 'en'],
  ['without', 'en'],
  ['not', 'en'],
  ['non', 'en'],
  ['sin', 'es'],
  ['no', 'es'],
  ['senza', 'it'],
  ['non', 'it'],
  ['ohne', 'de'],
  ['kein', 'de'],
  ['keine', 'de'],
  ['nicht', 'de'],
  ['sans', 'fr'],
  ['pas', 'fr'],
  ['sem', 'pt'],
  ['không', 'vi'],
  ['chẳng', 'vi'],
  ['đừng', 'vi'],
  ['miễn', 'vi'],
  ['不', 'zh'],
  ['没', 'zh'],
  ['无', 'zh'],
  ['的', 'zh'],
  ['best', 'en'],
  ['top', 'en'],
  ['good', 'en'],
  ['great', 'en'],
  ['favorite', 'en'],
  ['favourite', 'en'],
  ['popular', 'en'],
  ['near', 'en'],
  ['nearby', 'en'],
  ['around', 'en'],
  ['closest', 'en'],
  ['close', 'en'],
  ['food', 'en'],
  ['dish', 'en'],
  ['dishes', 'en'],
  ['restaurant', 'en'],
  ['restaurants', 'en'],
  ['place', 'en'],
  ['places', 'en'],
  // Ask-shape words real queries carry that no banked surface contains in
  // the ask's own language: 'me' is a vi-banked surface (tamarind) but the
  // en question is the one 'best food near me' actually asks; 'shops' is
  // reached only through the number-variant fold, so the surface scan never
  // offers the plural the user types.
  ['me', 'en'],
  ['shop', 'en'],
  ['shops', 'en'],
  ['bars', 'en'],
  ['bakeries', 'en'],
  // Word-role seeds (browse mode, 2026-08-15): ask-shape words of the other
  // launch languages the corpus does not bank. Population, never verdicts —
  // the judge rules each one ('comida' arrives here precisely BECAUSE the
  // owner left its role an open question).
  ['最好', 'zh'],
  ['餐厅', 'zh'],
  ['饭馆', 'zh'],
  ['mejores', 'es'],
  ['mejor', 'es'],
  ['restaurante', 'es'],
  ['restaurantes', 'es'],
  ['comida', 'es'],
  ['cerca', 'es'],
  ['quán', 'vi'],
  ['ngon', 'vi'],
  ['gần', 'vi'],
  ['đây', 'vi'],
];

function laneRuleVersion(lane: string): number {
  switch (lane) {
    case WORD_NEGATION_LANE:
      return WORD_NEGATION_RULE_VERSION;
    case WORD_ROLE_LANE:
      return WORD_ROLE_RULE_VERSION;
    default:
      return WORD_GENERICNESS_RULE_VERSION;
  }
}

async function candidateWords(
  prisma: PrismaService,
): Promise<WordVocabularyClaim[]> {
  const rows = await prisma.$queryRaw<Array<{ form: string; locale: string }>>`
    SELECT DISTINCT form, locale FROM entity_surface`;
  const byKey = new Map<string, WordVocabularyClaim>();
  for (const [word, locale] of RETIRED_LIST_SEED) {
    for (const tag of [locale, 'und']) {
      const claim = { word, locale: tag };
      byKey.set(wordGenericnessLane.canonicalClaimKey(claim), claim);
    }
  }
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

/**
 * THE DIFF IS A MANDATORY ARTEFACT (D4, 2026-08-15).
 *
 * A rule bump is one line in a source file and it re-decides a whole corpus.
 * The negation v2→v3 bump flipped 24 words — the release note names the class,
 * but the LIST was never printed and nobody ever reviewed which words actually
 * changed sides. A review that produces no artefact did not happen.
 *
 * So every run that certifies at rule vN prints what vN decided differently
 * from v(N-1), by name, with the judge's stated ground. Nothing here gates or
 * refuses: the reviewer is the operator who just ran the drain, and the point
 * is that they cannot avoid seeing it.
 */
async function printVerdictDiff(
  ledger: ClaimVerdictLedgerService,
  lane: string,
  out: (m: string) => void,
): Promise<void> {
  const version = laneRuleVersion(lane);
  if (version <= 1) {
    out(`${lane}: diff n/a (v1 — no prior rule to differ from)`);
    return;
  }
  const diff = await ledger.outcomeDiff(
    lane,
    version - 1,
    version,
    FOLD_ALGORITHM_VERSION,
  );
  out(
    `${lane}: DIFF v${version - 1}->v${version} flipped=${diff.flipped.length} ` +
      `compared=${diff.comparedClaims} new-at-v${version}=${diff.onlyInTo}`,
  );
  for (const row of diff.flipped) {
    out(`  ${row.claimKey}: ${row.from} -> ${row.to} :: ${row.reason}`);
  }
  if (!diff.flipped.length && diff.comparedClaims) {
    out(`  (no claim decided under both rules changed sides)`);
  }
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
    : [WORD_GENERICNESS_LANE, WORD_NEGATION_LANE, WORD_ROLE_LANE];
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
        `rules=genericness:v${WORD_GENERICNESS_RULE_VERSION},negation:v${WORD_NEGATION_RULE_VERSION},role:v${WORD_ROLE_RULE_VERSION}`,
    );

    /** Lanes with work owed — heard CO-DUE in one certifyFacets pass below,
     *  so a word due on two facets costs one call, not two (B-call). */
    const dueLanes: string[] = [];
    for (const lane of lanes) {
      // FINISH FIRST. A previous run may have died between a verdict and the
      // cache learning it; those decisions are paid for already.
      const resumed = await judge.resumePendingEffects(lane);
      if (resumed) out(`${lane}: resumed=${resumed}`);

      // COUNT IN THE LANE'S OWN KEY SPACE (2026-08-15). `words` is a list of
      // (word, locale) claims, but a lane's claim KEY is whatever its adapter
      // says — and negation's is now the spelling alone, so 32,379 claims are
      // 20,202 questions. Subtracting `decided.size` from the raw claim count
      // quoted 12,177 hearings that do not exist and would have asked an
      // operator to approve ~60% more spend than the work is.
      const laneKeys = new Set(
        words.map((claim) => laneWiring(lane).adapter.canonicalClaimKey(claim)),
      );
      const decided = await judge.decidedOutcomes(lane, words);
      const due = laneKeys.size - decided.size;
      out(
        `${lane}: claims=${words.length} questions=${laneKeys.size} decided=${decided.size} due=${due}`,
      );
      // THE DIFF, ALWAYS AND FIRST (D4). Printed before anything is bought,
      // and printed in count-only mode too, because the person deciding
      // whether to pay for a re-hearing is exactly the person who needs to
      // see what the last rule change already flipped.
      await printVerdictDiff(app.get(ClaimVerdictLedgerService), lane, out);
      if (!due) continue;

      dueLanes.push(lane);
      if (!apply) {
        try {
          const estimate = await budget.estimate(
            lane,
            laneRuleVersion(lane),
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
    }

    // ONE CO-DUE PASS (B-call): every lane with work owed contributes its
    // facet to the SAME hearing, so the words are sent once and each facet's
    // verdict rows land independently.
    if (apply && dueLanes.length) {
      try {
        const summaries = await judge.certifyFacets(dueLanes, words, {
          approvedHash,
          // AN OPERATOR IS WATCHING (A3): this drain is bounded by the
          // approve-by-hash law above, so it is not also charged against the
          // unattended rail's rolling allowance — doing both is what left the
          // steady trickle permanently refused behind the first bulk run.
          source: 'certification',
        });
        for (const [lane, summary] of summaries) {
          out(`${lane}: ${JSON.stringify(summary)}`);
        }
      } catch (error) {
        if (
          error instanceof DrainExceedsStandingCapError ||
          error instanceof StaleDrainApprovalError ||
          error instanceof NoMeasuredHearingRateError
        ) {
          out(`REFUSED — ${error instanceof Error ? error.message : error}`);
          process.exitCode = 1;
        } else throw error;
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
