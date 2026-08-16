import { localeLookupChain } from '../locale/accept-language';

export interface GenericTokenStrippingResult {
  text: string;
  isGenericOnly: boolean;
}

/**
 * ASK SHAPE, NOT WORD MEANING — what is left of this module after the judged
 * vocabulary took the half that was actually about words (2026-08-13).
 *
 * THE FINDING, stated plainly, because the rederivation that opened this work
 * expected BOTH hand lists here to die and only one of them could:
 *
 *   The judged-vocabulary lane asks "does this word carry a concept, or does
 *   it only do grammatical work between other words?" — and every token in
 *   this module's lists CARRIES A CONCEPT. `best` is a quality, `nearby` is a
 *   proximity, `restaurant` is a kind of place, `dish` is a kind of thing. A
 *   judge told to rule them grammatical work would be lying, and the corpus
 *   already agrees: the 2026-08-13 measurement found best/good/great/favorite/
 *   popular/place BANKED AS LIVE RECALL SURFACES — the Best-ghost class.
 *
 *   So this list was never a genericness claim. It is a claim about the SHAPE
 *   OF AN ASK: "best tacos near me" is a ranking-and-proximity FRAME wrapped
 *   around one real ask (`tacos`), and "restaurants near me" is a frame with
 *   no ask inside it at all. Deciding that is a different law from deciding
 *   what a word means, it is positional rather than lexical, and folding it
 *   into a per-word verdict would have made the verdict wrong for every other
 *   consumer of the same word.
 *
 * WHAT THIS MODULE IS NOW. Two English-only, locale-gated rules, unchanged in
 * behaviour and renamed to say what they do:
 *
 *   - THE FRAME (`ASK_FRAME_TOKENS`): rank and proximity words that wrap an
 *     ask without being one. Removed from the term, wherever they appear.
 *   - THE BARE CATEGORY (`BARE_CATEGORY_TOKENS`): words naming the CATEGORY
 *     the whole app is about. Never removed — a category word is content —
 *     but a term made of NOTHING ELSE names no particular food, and
 *     `isGenericOnly` tells the caller there is no ask here to record or
 *     spend on.
 *
 * THE LOCALE RULE IS UNCHANGED, and so is its reason. This is a claim about
 * one language's phrasing, and it may only be made for a language whose
 * phrasing we hold. We hold English. A locale absent from the map — including
 * `und`, which means "nobody could tell", not "English" — gets NO frame
 * stripping and is never judged bare-category: an unstripped term is a
 * slightly worse query, a wrongly-stripped one is a deleted ask.
 *
 * THE HONEST RESIDUE, for whoever picks this up: the ideal shape is a THIRD
 * judged claim class — "is this word a particular food, or the category word
 * for a whole class of them?" — which would work in every language on day one
 * exactly as the other two lanes do. It was not ratified with them and is not
 * invented here.
 */
const ASK_FRAME_TOKENS = [
  'best',
  'top',
  'good',
  'great',
  'favorite',
  'favourite',
  'popular',
  'near',
  'nearby',
  'around',
  'closest',
  'close',
] as const;

const BARE_CATEGORY_TOKENS = new Set<string>([
  'food',
  'dish',
  'dishes',
  'restaurant',
  'restaurants',
  'place',
  'places',
]);

interface AskShapeVocabulary {
  frameRegex: RegExp;
  categoryTokens: ReadonlySet<string>;
}

const ENGLISH_ASK_SHAPE: AskShapeVocabulary = {
  frameRegex: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${ASK_FRAME_TOKENS.join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  ),
  categoryTokens: BARE_CATEGORY_TOKENS,
};

/**
 * The authored ask-shape vocabularies, keyed by canonical BCP 47 language. A
 * locale absent from this map is never framed or judged bare-category — see
 * the module header. Extend by ADDING an entry; never by widening the English
 * one.
 */
const ASK_SHAPE_BY_LOCALE: ReadonlyMap<string, AskShapeVocabulary> = new Map([
  ['en', ENGLISH_ASK_SHAPE],
]);

/**
 * 'und' / null / undefined GET NO VOCABULARY — they do NOT get English
 * (2026-08-13). 'und' MEANS UNIVERSAL: the honest tag for a string nobody can
 * assign a language to, and "we could not tell what language this was" is not
 * evidence that it was English. The chain already ends in 'und' and this map
 * holds no 'und' entry, so the loop returns null for it without a special
 * case.
 */
function resolveAskShape(
  locale: string | null | undefined,
): AskShapeVocabulary | null {
  const normalized = typeof locale === 'string' ? locale.trim() : '';
  if (!normalized.length) {
    return null;
  }

  for (const tag of localeLookupChain(normalized)) {
    const vocabulary = ASK_SHAPE_BY_LOCALE.get(tag);
    if (vocabulary) {
      return vocabulary;
    }
  }

  return null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimEdgeSeparators(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function extractTokens(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Remove the ask FRAME and report whether what is left is a bare category.
 *
 * Kept under its original name and signature: every caller composes it with
 * the judged-vocabulary door, and renaming the function at the same time as
 * splitting its law would have made the diff unreadable at exactly the call
 * sites that most need reviewing.
 */
export function stripGenericTokens(
  input: string,
  locale?: string | null,
): GenericTokenStrippingResult {
  let working = typeof input === 'string' ? input.normalize('NFKC').trim() : '';
  if (!working.length) {
    return { text: '', isGenericOnly: true };
  }

  const vocabulary = resolveAskShape(locale);
  if (!vocabulary) {
    // No authored ask-shape vocabulary for this language: strip nothing, judge
    // nothing generic. The term passes through whole.
    const text = collapseWhitespace(trimEdgeSeparators(working));
    return { text, isGenericOnly: extractTokens(text).length === 0 };
  }

  working = working.replace(vocabulary.frameRegex, ' ');
  working = collapseWhitespace(trimEdgeSeparators(working));

  const tokens = extractTokens(working).map((token) => token.toLowerCase());
  const hasNonCategoryToken = tokens.some(
    (token) => !vocabulary.categoryTokens.has(token),
  );
  if (tokens.length > 0 && !hasNonCategoryToken) {
    return { text: '', isGenericOnly: true };
  }

  const text = collapseWhitespace(trimEdgeSeparators(working));
  return { text, isGenericOnly: extractTokens(text).length === 0 };
}
