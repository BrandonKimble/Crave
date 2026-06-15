import { EntityType } from '@prisma/client';

const TYPE_LABEL: Record<string, string> = {
  restaurant: 'restaurant',
  food: 'dish',
  food_attribute: 'food attribute',
  restaurant_attribute: 'restaurant attribute',
};

/**
 * Build the text that gets embedded for an entity's `name_embedding`.
 *
 * Richer than the bare name: name + aliases + type. Aliases pull the document
 * vector toward a query's alternate surface forms ("BEC" → "bacon egg and
 * cheese"); the type label disambiguates role ("Roma" the restaurant vs a place).
 * Kept short and name-forward so the name stays the dominant signal — over-stuffed
 * context dilutes it. Embedded with the asymmetric `RETRIEVAL_DOCUMENT` task type;
 * queries use `RETRIEVAL_QUERY`.
 */
export function buildEntityDoc(
  name: string,
  aliases: string[],
  type: EntityType,
): string {
  const trimmedName = name.trim();
  const lowerName = trimmedName.toLowerCase();
  const akas = (aliases ?? [])
    .map((a) => a?.trim())
    .filter((a): a is string => Boolean(a) && a.toLowerCase() !== lowerName)
    .slice(0, 8);

  const label = TYPE_LABEL[type] ?? 'entity';
  const aka = akas.length ? `, also known as ${akas.join(', ')}` : '';
  return `${trimmedName}${aka}. (${label})`;
}
