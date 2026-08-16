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
export const WORD_ROLE_LANE = 'word-role';

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
export abstract class WordVocabularyLaneAdapter extends BaseClaimLaneAdapter<WordVocabularyClaim> {
  readonly keyFoldVersion = FOLD_ALGORITHM_VERSION;

  canonicalClaimKey(claim: WordVocabularyClaim): string {
    return `${normalizeClaimLocale(claim.locale)}|${surfaceClaimKey(claim.word)}`;
  }
}

class WordGenericnessLaneAdapter extends WordVocabularyLaneAdapter {
  readonly lane = WORD_GENERICNESS_LANE;
}

/**
 * NEGATION IS KEYED BY SPELLING ALONE — 'und', always (B-key, 2026-08-15).
 *
 * THE FINDING, executed: this lane bought one verdict per (spelling, locale)
 * and its ONLY consumer reads `negatingForms`, a set of SPELLINGS with the
 * locale thrown away — by ruling, not by accident (see JudgedVocabularyService:
 * "ramen sin cerdo" typed on an en-US phone must still have `sin` withheld
 * from the embedder, so a form ruled a negator in ANY language is withheld in
 * every language). Every extra locale's hearing therefore bought an answer
 * nobody could ever read: 38% of this lane's spend, measured against the
 * certified corpus.
 *
 * So the claim unit becomes what the consumer actually asks: does THIS
 * SPELLING negate anywhere? One hearing, 'und', asked of a judge that already
 * reasons across languages. The any-language-yes semantics the set
 * implemented in memory is now the semantics of the STORED verdict, which is
 * where a rule belongs — a per-locale table re-deriving one boolean on every
 * write was the same law expressed twice, and the second copy is deleted.
 *
 * GENERICNESS KEEPS ITS LOCALE, and the asymmetry is the point: whether a
 * word does grammatical work is a fact ABOUT a language (`de` is glue in
 * Spanish and a name fragment elsewhere), and its consumer strips in the
 * ask's OWN language, so the locale is read. Two lanes, two claim kinds, two
 * key shapes — which is exactly why they were never one lane.
 */
class WordNegationLaneAdapter extends WordVocabularyLaneAdapter {
  readonly lane = WORD_NEGATION_LANE;

  override canonicalClaimKey(claim: WordVocabularyClaim): string {
    return `und|${surfaceClaimKey(claim.word)}`;
  }
}

/**
 * THE THIRD FACET — WORD ROLE (owner ratification, 2026-08-15): what does
 * this word DO in an ask? `particular` names a specific seekable thing;
 * `venue-category` names a kind of place or a class so broad it works like
 * one (kept out of demand by owner amendment 2026-08-15; its search-time
 * composition lands with the venue-taxonomy plan); `frame` wraps the ask
 * without naming anything (browse-driving, demand-SUPPRESSED — including
 * bare `food`, by ruling).
 *
 * This is the judged claim class `generic-token-handling.ts` predicted as its
 * own replacement — the ask-SHAPE half that could not become a genericness
 * verdict, because `best` genuinely carries a concept. It is locale-keyed
 * like genericness: whether a word frames an ask is a fact about a language's
 * phrasing, and the consumer reads it in the ask's OWN language only — `und`
 * is the tag most short queries genuinely arrive under, with its own
 * certified verdicts, never a fallback read into a tagged ask.
 *
 * CONSULTED BEFORE GROUNDING, INDEPENDENT OF THE BANK — the corpus is
 * contaminated (`best` is a banked ghost-restaurant surface, `good taco` a
 * live entity), so a banked junk surface is never evidence against a frame
 * verdict. The rule text says this to the judge in so many words.
 */
class WordRoleLaneAdapter extends WordVocabularyLaneAdapter {
  readonly lane = WORD_ROLE_LANE;
}

export const wordGenericnessLane = new WordGenericnessLaneAdapter();
export const wordNegationLane = new WordNegationLaneAdapter();
export const wordRoleLane = new WordRoleLaneAdapter();

/** The one lane→adapter authority. A ternary over two lanes silently made a
 *  third lane unreachable at every call site that copied it. */
export function vocabularyLaneAdapter(lane: string): WordVocabularyLaneAdapter {
  switch (lane) {
    case WORD_GENERICNESS_LANE:
      return wordGenericnessLane;
    case WORD_NEGATION_LANE:
      return wordNegationLane;
    case WORD_ROLE_LANE:
      return wordRoleLane;
    default:
      throw new Error(`'${lane}' is not a judged-vocabulary lane`);
  }
}

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
export const WORD_ROLE_PROMPT = readPromptAsset(
  __dirname,
  'word-role-prompt.md',
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
  {
    version: 3,
    fingerprint: '85df3b80a180',
    note: 'THE ABSENCE MUST BE OF SOMETHING ELSE — v2 ruled boneless/cheeseless/meatless/unsweetened/nonalcoholic/deshuesado/free/zero/hold/86 negators (72 of them across the corpus), which would have deleted the word `boneless` from "boneless wings"; a word whose absence is sealed inside it NAMES a food and is not a negator, and the false-YES cost (a deleted ask) is now stated as strictly worse than the false-NO cost (one word of context)',
  },
];

const ROLE_RELEASES: readonly RuleRelease[] = [
  {
    version: 1,
    fingerprint: '6a70e294eaa2',
    note: 'the what-does-this-word-DO question: particular / venue_category / frame, principle-stated with sixteen pinned gold cases (tacos, birria, 牛肉面, boba, coffee, restaurants, bar, bakery, 餐厅, best, top, near, me, 最好, food); bare `food` ruled frame by owner; corpus contamination stated to the judge (a banked `best` ghost is not evidence against a frame verdict)',
  },
  {
    version: 2,
    fingerprint: '5de12b9d66b0',
    note: 'A PROPERTY SOME VENUES HAVE AND OTHERS LACK IS PARTICULAR — v1 let "quality of the results" swallow venue qualities, and the judge ruled romántico/tranquilo/mascotas/llevar FRAME, deleting real attribute asks (es gate 88.7→78, measured 2026-08-15); v2 states the deciding test (scoping vs ranking: nothing lacks `best`, some venues lack `romantic`) with five new gold cases (romántico, tranquilo, llevar, good, busco)',
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

const roleRule = resolvePromptRule(
  'word-role-prompt.md',
  'word-vocabulary-lanes.ts',
  WORD_ROLE_PROMPT,
  ROLE_RELEASES,
);
export const WORD_ROLE_RULE_VERSION = roleRule.version;
export const WORD_ROLE_RULE_FINGERPRINT = roleRule.fingerprint;

/* --------------------------------------------------------------- outcomes */

/** The genericness verdict, as stored in `claim_verdicts.outcome`. */
export const CARRIES_CONCEPT = 'carries-concept';
export const GRAMMATICAL_WORK = 'grammatical-work';

/** The negation verdict. */
export const NEGATES = 'negates';
export const DOES_NOT_NEGATE = 'does-not-negate';

/** The word-role verdict: what the word DOES in an ask. */
export const ROLE_PARTICULAR = 'particular';
export const ROLE_VENUE_CATEGORY = 'venue-category';
export const ROLE_FRAME = 'frame';
