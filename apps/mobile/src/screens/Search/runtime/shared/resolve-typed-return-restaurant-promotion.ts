import type { AutocompleteMatch } from '../../../../services/autocomplete';

// Normalize a name/query for the typed-Return exact match: trim, lowercase, and
// strip surrounding (leading/trailing) punctuation + whitespace so `"Franklin"`
// and `franklin.` compare equal. Interior punctuation is preserved so distinct
// names ("mod pizza" vs "modpizza") stay distinct.
const normalizeForExactMatch = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    // Drop leading/trailing runs of anything that is not a letter, number, or
    // whitespace (Unicode-aware). Keeps interior spaces/punctuation intact.
    .replace(/^[^\p{L}\p{N}\s]+|[^\p{L}\p{N}\s]+$/gu, '')
    .trim();

type TypedReturnRestaurantPromotionArgs = {
  query: string;
  suggestions: AutocompleteMatch[];
};

/**
 * Typed-Return promoter gate (search master plan §Step 5).
 *
 * Returns the single suggestion to jump to when a typed Return should open a
 * restaurant profile directly instead of running a results search — otherwise
 * `null` (fall through to submitSearch).
 *
 * A match is eligible only when ALL hold:
 *  - its normalized name exactly equals the normalized typed query,
 *  - it is UNIQUE: exactly one entity across all suggestions exact-matches the
 *    query (if two entities exact-match, do NOT promote — ambiguous),
 *  - `evidenceTier === 'exact'`,
 *  - `entityType === 'restaurant'`.
 *
 * The uniqueness check counts exact-name matches across ALL entity suggestions
 * (any entityType), so a query that exact-matches both a restaurant and, say, a
 * dish of the same name is ambiguous and does not promote.
 */
export const resolveTypedReturnRestaurantPromotion = ({
  query,
  suggestions,
}: TypedReturnRestaurantPromotionArgs): AutocompleteMatch | null => {
  const normalizedQuery = normalizeForExactMatch(query);
  if (normalizedQuery.length === 0) {
    return null;
  }

  // All entity suggestions whose normalized name equals the typed query. Poll /
  // query suggestions are not entities, so they can't be jumped to and are
  // excluded from both the candidate set and the ambiguity count.
  const exactNameMatches = suggestions.filter((match) => {
    if (match.matchType === 'poll' || match.matchType === 'query') {
      return false;
    }
    if (match.entityType === 'poll' || match.entityType === 'query') {
      return false;
    }
    return normalizeForExactMatch(match.name) === normalizedQuery;
  });

  // Uniqueness precondition: exactly one entity exact-matches. Two or more → the
  // query is ambiguous, so do not promote (replay the ambiguous-alias set — this
  // is the arm that must NOT fire).
  if (exactNameMatches.length !== 1) {
    return null;
  }

  const [candidate] = exactNameMatches;
  if (candidate.entityType !== 'restaurant') {
    return null;
  }
  if (candidate.evidenceTier !== 'exact') {
    return null;
  }
  if (!candidate.entityId) {
    return null;
  }

  return candidate;
};
