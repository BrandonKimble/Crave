/**
 * Build the text that gets embedded for an entity's `name_embedding`.
 *
 * Bare name + plain surface forms — nothing else. We A/B'd a richer template
 * (`"<name>, also known as <aliases>. (<type>)"`) and it was a net negative: the
 * descriptive wrapper pulled in literal token-overlap junk (e.g. "american cheese"
 * for "bacon egg and cheese"), and the `(type)` label is redundant with the SQL
 * `entityType` filter the search lanes already apply. Surfaces are appended as plain
 * tokens so alternate forms still pull the vector closer, without the noise.
 *
 * The forms come from `entity_surface` (locale und+en, any role) — see the
 * SELECT in entity-embedding-reconciler.service.ts for why that scope, and
 * why it is WIDER than the retired core_entities.aliases[] projection this
 * used to read.
 * Embedded with the asymmetric `RETRIEVAL_DOCUMENT` task type; queries use
 * `RETRIEVAL_QUERY`.
 */
export function buildEntityDoc(name: string, surfaces: string[]): string {
  const trimmedName = name.trim();
  const lowerName = trimmedName.toLowerCase();
  const akas = (surfaces ?? [])
    .map((a) => a?.trim())
    .filter((a): a is string => Boolean(a) && a.toLowerCase() !== lowerName)
    .slice(0, 8);
  return akas.length ? `${trimmedName} ${akas.join(' ')}` : trimmedName;
}
