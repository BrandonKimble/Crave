import { BaseClaimLaneAdapter } from './claim-lane-adapter';
import { surfaceClaimKey } from './entity-surface.service';
import { FOLD_ALGORITHM_VERSION } from './entity-identity';

/** The lane name stored in `claim_verdicts.lane`. */
export const WORD_CLAIM_LANE = 'word_claim';

/** The identity of a word claim, as the adapter needs to see it. */
export interface WordClaimIdentity {
  form: string;
  locale: string;
  entityId: string;
}

/**
 * WHAT ONE WORD CLAIM IS (H5 amendment (a)).
 *
 * A word claim is one concept asking to hold one word in one language. All
 * three parts are load-bearing:
 *
 *   - THE WORD IS `surfaceClaimKey`, NOT `canonicalFold`. The recall fold
 *     destroys accents on purpose so a US-keyboard `bo` still reaches bò; it
 *     is a retrieval key and was never an identity. Keying hearings on it made
 *     bò (beef), bơ (butter) and bó (bunch) ONE claim — a case whose every
 *     possible verdict took a correct word→concept pairing away, and which the
 *     judge answered differently 60% of the time on re-ask. Case and
 *     punctuation still fold (Caldo == caldo, Phil's == Phils): those are
 *     spellings of one word, and two surface rows differing only there are the
 *     same claim and must not be heard twice.
 *   - THE LOCALE is part of the claim, not context. `chay` in vi and `chay`
 *     in es are different questions with different answers, and a verdict on
 *     one may never answer for the other.
 *   - THE ENTITY is the claimant. The same word contested by two concepts is
 *     two claims, decided independently — that is what makes "both may win" a
 *     representable outcome rather than a special case.
 *
 * WHAT IS DELIBERATELY *NOT* IN THE KEY: which QUESTION was asked. "May this
 * concept take this word?" and "should it still hold it?" are two questions
 * about ONE claim, and giving them separate keys is exactly the asymmetry this
 * ledger exists to end — a grant would then be unable to see the retraction
 * that followed it, and a wrong YES would go on being permanent under a new
 * name.
 */
export class WordClaimLaneAdapter extends BaseClaimLaneAdapter<WordClaimIdentity> {
  readonly lane = WORD_CLAIM_LANE;

  /**
   * THE KEY IS SPELLED BY THE FOLD, so the fold's version is part of the
   * claim's identity (D-census, 2026-08-13). `surfaceClaimKey` IS
   * `diacriticFold`, whose output FOLD_ALGORITHM_VERSION versions: change the
   * fold — the tone-mark work is already planned — and every key ever written
   * is re-spelled at once. Without this number stored beside the key, that
   * event is invisible: `decidedKeys` probes the new spelling, misses every
   * stored verdict, and the entire judged corpus reads as unheard and is
   * re-bought. With it, a fold bump re-opens the corpus the same way a rule
   * bump does — through the budgeted drain, with a quote.
   */
  readonly keyFoldVersion = FOLD_ALGORITHM_VERSION;

  canonicalClaimKey(claim: WordClaimIdentity): string {
    return `${claim.locale}|${surfaceClaimKey(claim.form)}|${claim.entityId}`;
  }
}

export const wordClaimLane = new WordClaimLaneAdapter();
