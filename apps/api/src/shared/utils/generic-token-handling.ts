export interface GenericTokenStrippingResult {
  text: string;
  isGenericOnly: boolean;
}

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

const RANK_LOCATION_TOKEN_REGEX = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${GENERIC_RANK_LOCATION_TOKENS.join(
    '|',
  )})(?![\\p{L}\\p{N}])`,
  'giu',
);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimEdgeSeparators(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function extractTokens(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function stripGenericTokens(input: string): GenericTokenStrippingResult {
  let working = typeof input === 'string' ? input.normalize('NFKC').trim() : '';
  if (!working.length) {
    return { text: '', isGenericOnly: true };
  }

  working = working.replace(RANK_LOCATION_TOKEN_REGEX, ' ');
  working = collapseWhitespace(trimEdgeSeparators(working));

  const tokens = extractTokens(working).map((token) => token.toLowerCase());
  const hasNonGenericObjectToken = tokens.some(
    (token) => !GENERIC_OBJECT_TOKENS.has(token),
  );
  if (tokens.length > 0 && !hasNonGenericObjectToken) {
    return { text: '', isGenericOnly: true };
  }

  const text = collapseWhitespace(trimEdgeSeparators(working));
  return { text, isGenericOnly: extractTokens(text).length === 0 };
}
