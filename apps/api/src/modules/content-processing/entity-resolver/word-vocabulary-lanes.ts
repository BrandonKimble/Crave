import { BaseClaimLaneAdapter } from './claim-lane-adapter';
import { surfaceClaimKey } from './entity-surface.service';
import { FOLD_ALGORITHM_VERSION } from './entity-identity';
import {
  readPromptAsset,
  resolvePromptRule,
  type RuleRelease,
} from './prompt-rule-release';

/**
 * THE JUDGED VOCABULARY — the two claim classes that retire the last two hand
 * lists in the query path (owner ratification, 2026-08-13).
 *
 * Until now the query path carried two authored word lists: a negation-cue
 * list per language in `query-analyzer.ts`, and an English generic vocabulary
 * in `generic-token-handling.ts`. Both were honest about being lists and both
 * were wrong in the same structural way — a claim about a LANGUAGE'S
 * VOCABULARY, typed by hand, in a codebase whose standing law is that a
 * non-exhaustive list is a defect. The measurement that closed the question
 * (2026-08-13) killed every mechanical alternative: corpus document frequency
 * is dead (the corpus is 100% English, so every non-English word has DF 0, and
 * even within English the frequencies interleave — `restaurant` at 84 sits
 * below `pizza` at 122); the "not a banked surface" predicate is contaminated
 * in both directions; a per-query LLM call is affordable but four to five
 * orders of magnitude too slow for a path measured in microseconds per
 * keystroke.
 *
 * What survives is the thing this codebase already built for word ownership: a
 * HEARING. A word is asked about ONCE, in ONE language, the answer is written
 * to the ledger with its stated ground and the rule version that decided it,
 * and every consumer reads the verdict. The list is bought once for pennies
 * and never typed again — and it works on day one of a new language, with zero
 * documents in the corpus, which no statistical mechanism can do.
 *
 * TWO LANES, NOT ONE, because they are two questions with independent answers.
 * `chưa` in Vietnamese is grammatical work AND a negator; `de` in Spanish is
 * grammatical work and negates nothing; `no` in English is a negator that a
 * searcher can also mean as a word. Folding them into one verdict would force
 * one answer to stand in for the other, which is exactly how the negation-cue
 * list came to be read as a genericness list at one call site.
 */

export const WORD_GENERICNESS_LANE = 'word-genericness';
export const WORD_NEGATION_LANE = 'word-negation';

/**
 * THE CLAIM UNIT for both lanes: one word, in one language, SPELLED AS TYPED.
 *
 * No entity, deliberately. A word claim asks whether a CONCEPT may hold a
 * word, so the claimant is part of its identity. These two lanes ask about the
 * word itself — what it does in its language — and the answer is the same
 * whoever is asking. Adding a claimant would buy the same answer once per
 * entity and make the certified vocabulary unbounded.
 */
export interface WordVocabularyClaim {
  word: string;
  /** BCP 47 base language, or 'und' when nobody could determine one. */
  locale: string;
}

/**
 * ACCENTS ARE PART OF THE WORD, so the key is spelled by `surfaceClaimKey`
 * (the accent-PRESERVING fold), never by the recall fold.
 *
 * This is the same ruling the word lane reached the hard way, and it is what
 * makes these lanes able to answer at all: the entire reason the negation list
 * refused to grow was that `chua` and `chưa` are one string once accents are
 * destroyed, and no single verdict is right for both — one is sourness, the
 * other is "not yet". Case and punctuation still fold, because `Sin` and `sin`
 * are two spellings of one word and must not be heard twice.
 *
 * `locale` is part of the key for the same reason it is part of a word claim:
 * `no` in English and `no` in Spanish are different questions. `und` is a
 * locale like any other here — the honest tag for a word nobody could place —
 * and it gets its OWN hearing rather than borrowing English's, which was the
 * over-stripping failure the generic module had already been corrected for
 * once.
 */
abstract class WordVocabularyLaneAdapter extends BaseClaimLaneAdapter<WordVocabularyClaim> {
  readonly keyFoldVersion = FOLD_ALGORITHM_VERSION;

  canonicalClaimKey(claim: WordVocabularyClaim): string {
    return `${normalizeClaimLocale(claim.locale)}|${surfaceClaimKey(claim.word)}`;
  }
}

class WordGenericnessLaneAdapter extends WordVocabularyLaneAdapter {
  readonly lane = WORD_GENERICNESS_LANE;
}

class WordNegationLaneAdapter extends WordVocabularyLaneAdapter {
  readonly lane = WORD_NEGATION_LANE;
}

export const wordGenericnessLane = new WordGenericnessLaneAdapter();
export const wordNegationLane = new WordNegationLaneAdapter();

/** The locale tag every vocabulary claim is keyed by: a base language subtag,
 *  lower-cased, with 'und' standing for "undetermined". A region is NOT part
 *  of the question — es-MX and es-ES disagree about which dish a word names,
 *  never about whether it is a preposition. */
export function normalizeClaimLocale(
  locale: string | null | undefined,
): string {
  const trimmed = typeof locale === 'string' ? locale.trim() : '';
  if (!trimmed) return 'und';
  const base = trimmed.split(/[-_]/)[0]?.toLowerCase() ?? '';
  return base.length ? base : 'und';
}

/* ------------------------------------------------------------------ rules */

export const WORD_GENERICNESS_PROMPT = readPromptAsset(
  __dirname,
  'word-genericness-prompt.md',
);
export const WORD_NEGATION_PROMPT = readPromptAsset(
  __dirname,
  'word-negation-prompt.md',
);

/**
 * Append-only. An old fingerprint stays listed because verdicts stamped with
 * its version are still in the corpus and their ground must remain legible.
 *
 * THE FINGERPRINT IS OF THE PRETTIER-FORMATTED FILE, which is the only text
 * that can be committed here — the repo formats markdown on the way in, and a
 * ledger entry naming a text the working tree cannot hold is an entry that
 * fails on every checkout. Both v2 entries were re-pointed at the formatted
 * text before their first commit; the pre-format text differed only in
 * markdown table column padding, so no word the judge reads changed and the
 * verdicts already bought under v2 stand.
 */
const GENERICNESS_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: 'f3b302dea1fc',
    note: 'the content-or-glue question, principle-stated with the eight pinned gold cases (chua/chưa, it/ít, de, al, birria, 的); explicitly NOT a specificity question, so a broad content word like `restaurant` carries a concept',
  },
  {
    version: 2,
    fingerprint: '29ffa69caef9',
    note: 'A SPELLING THAT IS NOT A WORD OF THE STATED LANGUAGE CARRIES A CONCEPT — v1 said this in a convoluted double negative and the judge read it backwards, ruling `feteer` (es) and `al` (vi) grammatical work, which would have DELETED a borrowed dish name from an ask in the language that borrowed it (measured on the first 200-word calibration drain)',
  },
];

const NEGATION_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '13cccdf5ac61',
    note: 'the does-it-negate question, principle-stated with the eight pinned gold cases (không/chưa/chua, sin, no, senza, 不, 的); replaces LANGUAGE_PACKS negation cues for en/es/it/de/fr/pt/vi and covers zh, which had no pack at all',
  },
  {
    version: 2,
    fingerprint: '15a7de03c4f3',
    note: "the not-a-word-of-this-language clause promoted to its own rule, matching the genericness lane's v2 correction; same answer as v1 intended, stated where the judge can see it",
  },
];

const genericnessRule = resolvePromptRule(
  'word-genericness-prompt.md',
  'word-vocabulary-lanes.ts',
  WORD_GENERICNESS_PROMPT,
  GENERICNESS_RELEASES,
);
const negationRule = resolvePromptRule(
  'word-negation-prompt.md',
  'word-vocabulary-lanes.ts',
  WORD_NEGATION_PROMPT,
  NEGATION_RELEASES,
);

export const WORD_GENERICNESS_RULE_VERSION = genericnessRule.version;
export const WORD_GENERICNESS_RULE_FINGERPRINT = genericnessRule.fingerprint;
export const WORD_NEGATION_RULE_VERSION = negationRule.version;
export const WORD_NEGATION_RULE_FINGERPRINT = negationRule.fingerprint;

/* --------------------------------------------------------------- outcomes */

/** The genericness verdict, as stored in `claim_verdicts.outcome`. */
export const CARRIES_CONCEPT = 'carries-concept';
export const GRAMMATICAL_WORK = 'grammatical-work';

/** The negation verdict. */
export const NEGATES = 'negates';
export const DOES_NOT_NEGATE = 'does-not-negate';
