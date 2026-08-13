import { localeLookupChain } from '../locale/accept-language';

export interface GenericTokenStrippingResult {
  text: string;
  isGenericOnly: boolean;
}

/**
 * GENERIC-TOKEN STRIPPING IS A CLAIM ABOUT A LANGUAGE'S VOCABULARY, AND WE MAY
 * ONLY MAKE IT FOR A LANGUAGE WHOSE VOCABULARY WE ACTUALLY HOLD.
 *
 * This module used to hold ONE list — an English one — and apply it to every
 * string that arrived, whatever language it was in. That is the same defect the
 * language detector was corrected for (81c0d2751: "the detector may only name
 * languages we serve"), one level down: a hard-coded English answer asserted
 * over text nobody checked the language of.
 *
 * Two things went wrong, and they point in opposite directions:
 *
 *  - UNDER-STRIPPING (cosmetic). 'mejores tacos' keeps 'mejores' because
 *    'mejores' is not in an English list. The outbound query is merely worse.
 *
 *  - OVER-STRIPPING (destructive, and the reason this is locale-keyed rather
 *    than merely extended). Every token in the English list is a legal word in
 *    some other language, and stripping one there deletes a CONCEPT, not a
 *    modifier. When every token is deleted the caller is told
 *    `isGenericOnly` — a verdict that DISCARDS the term outright: the keyword
 *    lane drops it from the cycle, the on-demand lane sanitizes it to ''. A
 *    non-English ask can be thrown away on the strength of an English word
 *    list it was never subject to.
 *
 * THE RULE. Genericness is looked up per locale, in a table we author. Today we
 * hold exactly one generic vocabulary — English — because that list is the one
 * that was authored and the untagged corpus is English-by-construction. A
 * locale we hold no generic vocabulary for gets NO STRIPPING: nothing is
 * removed and nothing is ever judged generic-only. That is the conservative
 * direction — an unstripped term is a slightly worse query, a wrongly-stripped
 * one is a deleted ask — and it is honest, because we are not inventing Spanish
 * or Vietnamese stop-lists we have no evidence for. When a real es/vi generic
 * vocabulary is authored (or derived from the registry), it lands in this map
 * and nothing else changes.
 *
 * `und` / absent locale resolves to English deliberately: it is the untagged
 * legacy corpus, which IS English, so every pre-existing caller keeps its exact
 * behaviour and no gate moves.
 */
const GENERIC_RANK_LOCATION_TOKENS = [
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

const GENERIC_OBJECT_TOKENS = new Set<string>([
  'food',
  'dish',
  'dishes',
  'restaurant',
  'restaurants',
  'place',
  'places',
]);

interface GenericVocabulary {
  rankLocationRegex: RegExp;
  objectTokens: ReadonlySet<string>;
}

const ENGLISH_GENERIC_VOCABULARY: GenericVocabulary = {
  rankLocationRegex: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${GENERIC_RANK_LOCATION_TOKENS.join(
      '|',
    )})(?![\\p{L}\\p{N}])`,
    'giu',
  ),
  objectTokens: GENERIC_OBJECT_TOKENS,
};

/**
 * The authored generic vocabularies, keyed by canonical BCP 47 language. A
 * locale absent from this map has no generic vocabulary and is therefore never
 * stripped — see the module header. Extend by ADDING an entry; never by
 * widening the English one.
 */
const GENERIC_VOCABULARY_BY_LOCALE: ReadonlyMap<string, GenericVocabulary> =
  new Map([['en', ENGLISH_GENERIC_VOCABULARY]]);

/**
 * Resolve the generic vocabulary for a locale through the standard lookup
 * chain, so 'en-GB' and 'en-US' reach the English entry the same way every
 * other locale-scoped read in the codebase does.
 *
 * 'und' / null / undefined GET NO VOCABULARY — they do NOT get English
 * (corrected 2026-08-13; the "untagged corpus is English-by-construction"
 * reading is retired here, as it was on `localeLookupChain` and
 * `entity_surface.locale`).
 *
 * 'und' MEANS UNIVERSAL: the honest tag for a string nobody can assign a
 * language to. A universal tag entitles a term to NO language's stop list,
 * because "we could not tell what language this was" is not evidence that it
 * was English — and this module's own rule is that genericness may only be
 * asserted for a language whose vocabulary we hold. Returning the English
 * list for an undetermined term was the module header's OVER-STRIPPING
 * failure, reached by the one path the header did not close: a Vietnamese
 * one-worder whose language the detector cannot decide arrives here as null,
 * was judged against the English list, and a term that is entirely
 * English-generic ('top', 'best') is discarded outright — `isGenericOnly`
 * makes the keyword lane drop it and the on-demand lane sanitize it to ''.
 *
 * Nothing is lost for real English: an English request carries 'en' (or
 * 'en-US'), reaches the chain, and strips exactly as before. What changes is
 * that a term nobody could identify is no longer silently prosecuted under
 * English law. The chain already ends in 'und', and this map holds no 'und'
 * entry — so the loop below returns null for it without a special case, which
 * is why the early return could simply go rather than be inverted.
 */
function resolveGenericVocabulary(
  locale: string | null | undefined,
): GenericVocabulary | null {
  const normalized = typeof locale === 'string' ? locale.trim() : '';
  if (!normalized.length) {
    return null;
  }

  for (const tag of localeLookupChain(normalized)) {
    const vocabulary = GENERIC_VOCABULARY_BY_LOCALE.get(tag);
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

export function stripGenericTokens(
  input: string,
  locale?: string | null,
): GenericTokenStrippingResult {
  let working = typeof input === 'string' ? input.normalize('NFKC').trim() : '';
  if (!working.length) {
    return { text: '', isGenericOnly: true };
  }

  const vocabulary = resolveGenericVocabulary(locale);
  if (!vocabulary) {
    // No authored generic vocabulary for this language: strip nothing, judge
    // nothing generic. The term passes through whole.
    const text = collapseWhitespace(trimEdgeSeparators(working));
    return { text, isGenericOnly: extractTokens(text).length === 0 };
  }

  working = working.replace(vocabulary.rankLocationRegex, ' ');
  working = collapseWhitespace(trimEdgeSeparators(working));

  const tokens = extractTokens(working).map((token) => token.toLowerCase());
  const hasNonGenericObjectToken = tokens.some(
    (token) => !vocabulary.objectTokens.has(token),
  );
  if (tokens.length > 0 && !hasNonGenericObjectToken) {
    return { text: '', isGenericOnly: true };
  }

  const text = collapseWhitespace(trimEdgeSeparators(working));
  return { text, isGenericOnly: extractTokens(text).length === 0 };
}
