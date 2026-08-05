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
 * K1-RATIFIED 2026-07-26 (owner): minimum items for a list to materialize at
 * all — the "a list must be EARNED by data" floor (charter decision 2; the
 * no-fake-estimates law applied to curation). 5 is the smallest count that
 * doesn't read as a stub.
 */
export const MIN_VIABLE_LIST_ITEMS = 5;

/**
 * K1-RATIFIED 2026-07-26 (owner): cap on materialized items per list. Purely
 * a payload/quality knob (rank quality decays with depth).
 */
export const MAX_LIST_ITEMS = 25;

// UNCAPPED (owner-ratified 2026-07-26): the per-city cuisine/dish shelf caps
// (MAX_CUISINE_LISTS_PER_CITY / MAX_DISH_LISTS_PER_CITY, both 8) are GONE —
// every cuisine/dish that clears MIN_VIABLE_LIST_ITEMS earns its list.

/**
 * K1-RATIFIED 2026-07-26 (owner): hidden-gems evidence floor — minimum mention
 * volume for a below-median restaurant to qualify (below the floor the
 * score itself rests on too little testimony to headline a list). The score
 * pipeline pins no mention-count floor constant (its A_ref/A_floor pins are
 * activity-lane calibrations, not per-entity evidence counts).
 */
export const HIDDEN_GEMS_EVIDENCE_FLOOR = 3;

/**
 * D40 §4 — A RECIPE DECLARES ITS INPUTS.
 *
 * 'seed' = the onboarding answers (the cold-start prior). 'behavior' = the
 * derived taste profile (measured acts). 'both' = seed unconditionally, with
 * behavior ADDING to it — never silently overwriting, because behavior cannot
 * delete a declared preference and a dietary need is a constraint, not a
 * weight.
 *
 * Why declare it at all: a personal recipe that builds zero lists is
 * indistinguishable from a personal recipe with no users, unless you know
 * which input it was reading. With the declaration, "this recipe built 0
 * lists for input X" is a sentence the build log can actually say.
 */
export type RecipeInput = 'seed' | 'behavior' | 'both';

/** Recipe keys (stable identities; parametric recipes suffix ':<uuid>'). */
export const RECIPE_TRENDING = 'trending';
export const RECIPE_HIDDEN_GEMS = 'hidden_gems';
export const RECIPE_CUISINE_BEST_PREFIX = 'cuisine_best:';
export const RECIPE_DISH_BEST_PREFIX = 'dish_best:';
export const RECIPE_WEEKLY_TASTING = 'your_weekly_tasting';

/**
 * Home-feed shelf keys. F696: a recipe DECLARES the shelf it belongs on
 * (below, and on each CONTEXT_RECIPES entry) instead of the feed reader
 * inferring 'moments' as the negation of the other three shelves restated
 * inline — a recipe added without an entry here now falls back to
 * 'moments' explicitly (recipeShelfKey's own default), the same place it
 * always landed, but as one declared fact instead of two lists that must
 * stay in sync by hand.
 */
export const SHELF_BEST_OF = 'best_of';
export const SHELF_TRENDING = 'trending';
export const SHELF_HIDDEN_GEMS = 'hidden_gems';
export const SHELF_MOMENTS = 'moments';

/** Non-context, non-parametric recipes' shelf. Parametric prefixes
 *  (cuisine_best:/dish_best:) and CONTEXT_RECIPES declare theirs separately —
 *  see recipeShelfKey. */
const RECIPE_SHELF_KEYS: Readonly<Record<string, string>> = {
  [RECIPE_TRENDING]: SHELF_TRENDING,
  [RECIPE_HIDDEN_GEMS]: SHELF_HIDDEN_GEMS,
};

/**
 * The declared input of every PERSONAL recipe. Global recipes have no
 * personalization input and are absent by design — an entry here is a claim
 * that the recipe reads a user's data.
 */
export const PERSONAL_RECIPE_INPUTS: Readonly<Record<string, RecipeInput>> = {
  [RECIPE_WEEKLY_TASTING]: 'both',
};

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
  /** F696: the shelf this context recipe belongs on, declared here rather
   *  than inferred by the feed reader. Every current context recipe is a
   *  'moments' recipe; a future one that should headline its own shelf
   *  declares a different value and the feed reader honors it without
   *  needing its own section list touched. */
  shelfKey: string;
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
    shelfKey: SHELF_MOMENTS,
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
    shelfKey: SHELF_MOMENTS,
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
    shelfKey: SHELF_MOMENTS,
  },
];

const CONTEXT_RECIPE_SHELF_KEYS = new Map(
  CONTEXT_RECIPES.map((recipe) => [recipe.recipeKey, recipe.shelfKey]),
);

/**
 * F696: the ONE place a recipeKey maps to its home-feed shelf. Parametric
 * recipes (cuisine_best:<uuid>, dish_best:<uuid>) declare via prefix since
 * their identity is per-instance; CONTEXT_RECIPES entries declare inline;
 * everything else declares in RECIPE_SHELF_KEYS. An unrecognized recipeKey
 * — the only case that used to be silently swept into 'moments' by
 * negation — still resolves to 'moments', but now as this function's one
 * documented default rather than four inline predicates that have to
 * independently agree.
 */
export function recipeShelfKey(recipeKey: string): string {
  if (
    recipeKey.startsWith(RECIPE_CUISINE_BEST_PREFIX) ||
    recipeKey.startsWith(RECIPE_DISH_BEST_PREFIX)
  ) {
    return SHELF_BEST_OF;
  }
  return (
    RECIPE_SHELF_KEYS[recipeKey] ??
    CONTEXT_RECIPE_SHELF_KEYS.get(recipeKey) ??
    SHELF_MOMENTS
  );
}

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
