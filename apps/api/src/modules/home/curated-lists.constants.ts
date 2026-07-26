/**
 * Curated-list recipe constants (plans/home-surface-charter.md).
 *
 * §16 discipline (plans/geo-demand-foundation-rebuild.md): every number here
 * is either DERIVED from measured data at build time (medians, mention
 * volumes — those never live here) or an owner-choice awaiting ratification,
 * marked K1-UNRATIFIED with the suggestion rationale. No fake estimates: a
 * gate with no measured basis is an honest owner knob, never a dressed-up
 * guess.
 */

/**
 * K1-UNRATIFIED (suggested 5): minimum items for a list to materialize at
 * all — the "a list must be EARNED by data" floor (charter decision 2; the
 * no-fake-estimates law applied to curation). No measured basis exists yet
 * for what reads as credible; 5 is the smallest count that doesn't read as
 * a stub. Owner to ratify.
 */
export const MIN_VIABLE_LIST_ITEMS = 5;

/**
 * K1-UNRATIFIED (suggested 25): cap on materialized items per list. Purely
 * a payload/quality knob (rank quality decays with depth); not measured.
 */
export const MAX_LIST_ITEMS = 25;

/**
 * K1-UNRATIFIED (suggested 8): how many top-mention cuisines get a best-of
 * list per city. Cuisine RANKING is measured (mention volume); the cut
 * count is an owner shelf-size choice.
 */
export const MAX_CUISINE_LISTS_PER_CITY = 8;

/**
 * K1-UNRATIFIED (suggested 8): how many top-mention dishes get a monthly
 * best-of list per city. Same shape as the cuisine cut.
 */
export const MAX_DISH_LISTS_PER_CITY = 8;

/**
 * K1-UNRATIFIED (suggested 3): hidden-gems evidence floor — minimum mention
 * volume for a below-median restaurant to qualify (below the floor the
 * score itself rests on too little testimony to headline a list). The score
 * pipeline pins no mention-count floor constant (its A_ref/A_floor pins are
 * activity-lane calibrations, not per-entity evidence counts), so this is
 * an owner knob until measured.
 */
export const HIDDEN_GEMS_EVIDENCE_FLOOR = 3;

/** Recipe keys (stable identities; parametric recipes suffix ':<uuid>'). */
export const RECIPE_TRENDING = 'trending';
export const RECIPE_HIDDEN_GEMS = 'hidden_gems';
export const RECIPE_CUISINE_BEST_PREFIX = 'cuisine_best:';
export const RECIPE_DISH_BEST_PREFIX = 'dish_best:';
export const RECIPE_WEEKLY_TASTING = 'your_weekly_tasting';

/**
 * Context/job lists from extracted restaurant attributes (charter recipes).
 * attributeNames match core_entities rows of type restaurant_attribute by
 * lower(name) OR lower(alias) — the extraction pipeline coins open-
 * vocabulary attribute entities, so the match list is the recipe's mouth.
 * K1-UNRATIFIED: the name vocabularies are owner-editable seed lists (the
 * ontology has no "context tag" type axis yet); a city only builds the list
 * when >= MIN_VIABLE_LIST_ITEMS restaurants qualify, so a vocabulary miss
 * degrades to "no list", never a thin fake one.
 */
export const CONTEXT_RECIPES: ReadonlyArray<{
  recipeKey: string;
  title: string;
  iconKey: string;
  attributeNames: readonly string[];
}> = [
  {
    recipeKey: 'date_night',
    title: 'Date night',
    iconKey: 'date_night',
    attributeNames: [
      'date night',
      'romantic',
      'date spot',
      'intimate',
      'candlelit',
    ],
  },
  {
    recipeKey: 'family_group',
    title: 'Family & groups',
    iconKey: 'family_group',
    attributeNames: [
      'family friendly',
      'family-friendly',
      'kid friendly',
      'kid-friendly',
      'good for groups',
      'group friendly',
      'large groups',
    ],
  },
  {
    recipeKey: 'business_lunch',
    title: 'Business lunch',
    iconKey: 'business_lunch',
    attributeNames: [
      'business lunch',
      'business dining',
      'power lunch',
      'quiet',
      'good for meetings',
    ],
  },
];

/**
 * Onboarding cuisine option id -> restaurant_attribute name candidates.
 * The LEFT side is the closed vocabulary of the onboarding 'cuisines'
 * multi-choice step (apps/mobile/src/constants/onboarding.ts); the right
 * side matches attribute entities by lower(name)/alias. K1-UNRATIFIED as a
 * mapping (both vocabularies are real; the bridge is an editorial choice).
 */
export const ONBOARDING_CUISINE_ATTRIBUTE_NAMES: Readonly<
  Record<string, readonly string[]>
> = {
  mexican: ['mexican', 'tex-mex'],
  bbq: ['bbq', 'barbecue'],
  japanese: ['japanese', 'sushi'],
  italian: ['italian'],
  mediterranean: ['mediterranean', 'greek', 'middle eastern'],
  coffee: ['coffee', 'cafe', 'bakery'],
  american: ['american', 'burgers'],
  asian: ['asian', 'asian fusion', 'chinese', 'thai', 'vietnamese', 'korean'],
};

/** Icon keys for the non-context recipes (V1 artwork = icon + theme). */
export const ICON_TRENDING = 'trending';
export const ICON_HIDDEN_GEMS = 'hidden_gems';
export const ICON_CUISINE = 'cuisine';
export const ICON_DISH = 'dish';
export const ICON_WEEKLY_TASTING = 'weekly_tasting';

/** Rotation-key builders — the recipe decides its cadence. */
export function dailyRotationKey(now: Date): string {
  return now.toISOString().slice(0, 10); // '2026-07-26'
}

export function monthlyRotationKey(now: Date): string {
  return now.toISOString().slice(0, 7); // '2026-07'
}

/** ISO-8601 week, e.g. '2026-W30'. */
export function weeklyRotationKey(now: Date): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // ISO week: Thursday of the current week decides the year.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthLabel(now: Date): string {
  return MONTH_NAMES[now.getUTCMonth()];
}
