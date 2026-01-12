export function normalizeKeywordTerm(term: string): string {
  const trimmed = term.trim();
  if (!trimmed) {
    return '';
  }

  const withoutDiacritics = trimmed.normalize('NFKD').replace(/\p{M}+/gu, '');
  const punctuationAsSpaces = withoutDiacritics.replace(
    /[^\p{L}\p{N}]+/gu,
    ' ',
  );
  const collapsedWhitespace = punctuationAsSpaces.replace(/\s+/g, ' ').trim();

  return collapsedWhitespace.toLowerCase();
}
