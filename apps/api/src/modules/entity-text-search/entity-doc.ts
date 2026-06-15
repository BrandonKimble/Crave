/**
 * Build the text that gets embedded for an entity's `name_embedding`.
 *
 * Bare name + plain alias surface forms — nothing else. We A/B'd a richer template
 * (`"<name>, also known as <aliases>. (<type>)"`) and it was a net negative: the
 * descriptive wrapper pulled in literal token-overlap junk (e.g. "american cheese"
 * for "bacon egg and cheese"), and the `(type)` label is redundant with the SQL
 * `entityType` filter the search lanes already apply. Aliases are appended as plain
 * tokens so alternate surface forms still pull the vector closer, without the noise.
 * Embedded with the asymmetric `RETRIEVAL_DOCUMENT` task type; queries use
 * `RETRIEVAL_QUERY`.
 */
export function buildEntityDoc(name: string, aliases: string[]): string {
  const trimmedName = name.trim();
  const lowerName = trimmedName.toLowerCase();
  const akas = (aliases ?? [])
    .map((a) => a?.trim())
    .filter((a): a is string => Boolean(a) && a.toLowerCase() !== lowerName)
    .slice(0, 8);
  return akas.length ? `${trimmedName} ${akas.join(' ')}` : trimmedName;
}
