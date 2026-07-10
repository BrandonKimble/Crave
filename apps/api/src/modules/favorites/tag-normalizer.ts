/** ONE normalization chokepoint for list-item tags (product/favorites.md:
 *  free-text vocab needs a single write-side normalizer or "Spicy",
 *  "spicy ", "SPICY" become three toggle-strip filters later). */
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length > 0 && normalized.length <= 40) {
      seen.add(normalized);
    }
  }
  return [...seen].slice(0, 10);
}
