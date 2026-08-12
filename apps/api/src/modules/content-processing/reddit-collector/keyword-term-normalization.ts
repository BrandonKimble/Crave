import { diacriticFold } from '../entity-resolver/entity-identity';

/**
 * THE KEYWORD LEDGER'S IDENTITY KEY — what makes two attempts one row.
 *
 * IT STOPPED STRIPPING ACCENTS (red team F7, 2026-08-11), and that is the
 * whole change. The old implementation was NFKD followed by "delete every
 * combining mark", which merged words that are not the same word:
 *
 *     bò (beef) | bo | bơ (butter/avocado)   ->  one ledger row, 'bo'
 *     nón lá    | non la                     ->  one ledger row
 *     xoài muối | xoai muoi                  ->  one ledger row
 *     táo       | tao                        ->  one ledger row
 *
 * Measured over the 55,458 banked surface forms the keyword lane draws its
 * candidates from: 469 ledger keys were swallowing 942 distinct words. The
 * ledger is where a term's HARVEST SNAPSHOT lives — when it last ran, how
 * many posts it returned, how big the corpus was — and the row is
 * last-writer-wins, so `bò`'s measured yield was being recorded against
 * `bơ`, and the refresh lane then re-sent whichever spelling happened to be
 * written last. A Vietnamese dish could be measured barren on another dish's
 * evidence, and no counter anywhere would show it.
 *
 * WHY THE FOLD AND NOT THE KEY. The obvious repair is to put `term` in the
 * primary key, and it is wrong: `term` is case-as-sent, so 'Cabana' and
 * 'cabana' would become two rows and two budgets for one query — 809 of the
 * measured collision groups are exactly that case, and they are the fold
 * doing its job. Case, whitespace and punctuation are SPELLINGS of one word;
 * accents are not. That is not a new rule invented here, it is the ruling
 * `surfaceClaimKey` already carries for the identical bug class one store
 * over ("the claim unit is the FORM, not the FOLD... bò is not bơ"), and
 * this function now uses the same implementation of it. Under the corrected
 * fold, 469 keys merging 942 distinct words become 4 — and those 4 were not
 * all benign either; see the correction below. All 31 existing rows keep
 * their exact key (they are accent-free ASCII, so the two folds agree on
 * them byte for byte — verified before the change, which is why no data
 * migration exists).
 *
 * WHAT IT STILL FOLDS, WRITTEN DOWN RATHER THAN SMOOTHED OVER: case,
 * whitespace, punctuation, apostrophes ("Phil's Ice House" -> 'phils ice
 * house'), and the shared fold's SPELLING-VARIANT table (ß->ss, æ->ae,
 * œ->oe) — Switzerland writes 'straße' as 'strasse' and 'œuf'/'oeuf' is one
 * word, so those merge two spellings of ONE thing, which is a fold's job.
 *
 * THE PREVIOUS SENTENCE HERE WAS WRONG, AND THE MEASUREMENT PROVED IT (A0
 * R3, 2026-08-11). It claimed the non-decomposable table "is a fold of a
 * LETTER, not of a tone, so it cannot produce the bò/bơ class", and that the
 * 4 keys it merged were "every one a real spelling variant (smør/smor,
 * tørst/torst)". It named three and mis-described the fourth: over the same
 * corpus (55,737 distinct forms today) the fourth was `Đầu` (head) and
 * `dầu` (oil), merged into one ledger row whose harvest snapshot is
 * last-writer-wins — one dish measured on another dish's evidence, which is
 * EXACTLY the bò/bơ class the sentence said it could not produce.
 *
 * The fold was fixed rather than the description. Vietnamese đ is the eighth
 * letter of its alphabet, not a decorated d, and the same is true of Polish
 * ł, Nordic ø, Turkish dotless ı and the rest: their ASCII lookalike is a
 * DIFFERENT letter of the same alphabet, so they now fold only where accents
 * fold. Re-measured after the change: those 4 keys split into 8, and every
 * remaining collision is a case, whitespace or apostrophe variant — the fold
 * doing its job. The identity key is unmoved (canonicalFold still folds all
 * of them), so no stored row migrates. There is still only ONE fold
 * implementation; the alternative is a second one living beside the first,
 * and two folds drift.
 *
 * STILL NOT A QUERY. This is an IDENTITY, and the diacritic-preserving text
 * that goes on the wire is the ledger's separate `term` column (4caa12375).
 * Nothing may send this string to a vendor.
 */
export function normalizeKeywordTerm(term: string): string {
  return diacriticFold(term);
}
