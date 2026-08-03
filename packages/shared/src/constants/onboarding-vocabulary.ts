/**
 * THE ONBOARDING OPTION IDS ARE A CONTRACT, AND A CONTRACT WITH TWO AUTHORS IS
 * A COINCIDENCE.
 *
 * Every id below crosses the network: the mobile onboarding quiz WRITES them
 * into the user's profile, and the API's teaser READS them to choose which
 * dish, occasion, cuisine and city to build the first answer from. They used
 * to be declared in `apps/mobile/src/constants/onboarding.ts` and RE-SPELLED
 * as literal record keys in `teaser.service.ts`, with this package sitting
 * unused between them.
 *
 * Renaming an option on either side did not fail anything. The teaser simply
 * stopped matching and degraded to its browse fallback — the fallback is what
 * made the drift invisible.
 *
 * So the vocabulary lives HERE and both sides derive from it: mobile builds
 * its option lists from these arrays (a rename is a missing-label type error),
 * and the API keys its lookup tables by these unions (a rename is a compile
 * error). The fallback stays for genuinely empty cities, where it is honest.
 *
 * LABELS ARE NOT HERE. What a user reads is mobile's business; what the two
 * sides must agree on is only the id.
 */

/** "What are you always in the mood for?" — go-to dishes. */
export const CRAVING_OPTION_IDS = [
  'pizza',
  'tacos',
  'burgers',
  'sushi',
  'ramen',
  'wings',
  'fried-chicken',
  'pasta',
  'dumplings',
  'bbq',
  'steak',
  'brunch',
  'salad-bowls',
  'sweets',
] as const;
export type CravingOptionId = (typeof CRAVING_OPTION_IDS)[number];

/** "Which of these are you regularly picking spots for?" — occasions. */
export const CONTEXT_OPTION_IDS = [
  'date-nights',
  'family',
  'business',
  'group-hangs',
  'solo-everyday',
  'special-occasions',
] as const;
export type ContextOptionId = (typeof CONTEXT_OPTION_IDS)[number];

/** "What are you craving lately?" — cuisines. */
export const CUISINE_OPTION_IDS = [
  'mexican',
  'bbq',
  'japanese',
  'italian',
  'mediterranean',
  'coffee',
  'american',
  'asian',
] as const;
export type CuisineOptionId = (typeof CUISINE_OPTION_IDS)[number];

/** The live cities. This is the VALUE stored on the profile (mobile's
 *  `allowedCities[].value`), not the option id — the API matches on it. */
export const LIVE_CITY_VALUES = ['Austin', 'New York'] as const;
export type LiveCityValue = (typeof LIVE_CITY_VALUES)[number];

/**
 * Build a labelled option list from the shared id vocabulary. Adding or
 * renaming an id without giving it a label is a compile error, which is the
 * whole point.
 */
export function labelledOptions<Id extends string>(
  ids: readonly Id[],
  labels: Record<Id, string>
): Array<{ id: Id; label: string }> {
  return ids.map((id) => ({ id, label: labels[id] }));
}
