import { GooglePlacesV1Place } from '../external-integrations/google-places/google-places.service';

export const GOOGLE_PLACE_CUISINE_TYPE_MAP: Record<string, string> = {
  afghani_restaurant: 'afghani',
  african_restaurant: 'african',
  american_restaurant: 'american',
  asian_restaurant: 'asian',
  brazilian_restaurant: 'brazilian',
  chinese_restaurant: 'chinese',
  french_restaurant: 'french',
  greek_restaurant: 'greek',
  indian_restaurant: 'indian',
  indonesian_restaurant: 'indonesian',
  italian_restaurant: 'italian',
  japanese_restaurant: 'japanese',
  korean_restaurant: 'korean',
  lebanese_restaurant: 'lebanese',
  mediterranean_restaurant: 'mediterranean',
  mexican_restaurant: 'mexican',
  middle_eastern_restaurant: 'middle eastern',
  spanish_restaurant: 'spanish',
  thai_restaurant: 'thai',
  turkish_restaurant: 'turkish',
  vietnamese_restaurant: 'vietnamese',
};

export const GOOGLE_PLACE_NON_CUISINE_TYPE_MAP: Record<string, string> = {
  acai_shop: 'acai shop',
  bagel_shop: 'bagel shop',
  bakery: 'bakery',
  bar: 'bar',
  bar_and_grill: 'bar and grill',
  barbecue_restaurant: 'barbecue',
  breakfast_restaurant: 'breakfast restaurant',
  brunch_restaurant: 'brunch restaurant',
  buffet_restaurant: 'buffet',
  cafe: 'cafe',
  cafeteria: 'cafeteria',
  candy_store: 'candy store',
  cat_cafe: 'cat cafe',
  chocolate_factory: 'chocolate factory',
  chocolate_shop: 'chocolate shop',
  coffee_shop: 'coffee shop',
  confectionery: 'confectionery',
  deli: 'deli',
  dessert_restaurant: 'dessert restaurant',
  dessert_shop: 'dessert shop',
  diner: 'diner',
  dog_cafe: 'dog cafe',
  donut_shop: 'donut shop',
  fast_food_restaurant: 'fast food',
  fine_dining_restaurant: 'fine dining',
  food_court: 'food court',
  hamburger_restaurant: 'burger',
  ice_cream_shop: 'ice cream shop',
  juice_shop: 'juice shop',
  meal_delivery: 'delivery',
  meal_takeaway: 'takeout',
  pizza_restaurant: 'pizza',
  pub: 'pub',
  ramen_restaurant: 'ramen',
  sandwich_shop: 'sandwich shop',
  seafood_restaurant: 'seafood',
  steak_house: 'steakhouse',
  sushi_restaurant: 'sushi',
  tea_house: 'tea house',
  vegan_restaurant: 'vegan',
  vegetarian_restaurant: 'serves vegetarian food',
  wine_bar: 'wine bar',
};

export const GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP: Record<string, string> = {
  ...GOOGLE_PLACE_CUISINE_TYPE_MAP,
  ...GOOGLE_PLACE_NON_CUISINE_TYPE_MAP,
};

export const GOOGLE_PLACE_TYPE_ATTRIBUTE_CANONICAL_NAMES = Array.from(
  new Set(
    Object.values(GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP).filter(
      (value) => typeof value === 'string' && value.trim().length > 0,
    ),
  ),
);

/**
 * Alias sets for the code-owned restaurant_attribute vocabulary (the Google
 * boolean-field attributes + place-type attributes). SINGLE SOURCE OF TRUTH:
 * entities are created on demand with these aliases by
 * RestaurantLocationEnrichmentService.ensureRestaurantAttributeEntity — no
 * seed step, no maintenance. Organic attributes ("affordable", "1950s", …)
 * are created by collection from real data and never appear here.
 *
 * F363: it claimed to be the single source of truth while a SECOND copy of
 * the 20 Google boolean attributes, with its own alias arrays, lived in
 * restaurant-location-enrichment.service.ts — and 7 of the 20 had already
 * drifted apart (the service copy had lost the bare single-word aliases
 * `dogs`, `pets`, `children`, `groups`, `sports`, `outdoor`, `outside`,
 * `vegetarian restaurant`), so which alias set an attribute entity ended up
 * with depended on which code path minted it. The two are ONE table now: the
 * predicate is a field of an entry, not a reason for a second table, and the
 * merge took the UNION of both alias lists.
 */
export interface RestaurantAttributeVocabEntry {
  canonicalName: string;
  aliases: string[];
  /**
   * Present ONLY on the attributes Google reports as booleans on a place:
   * "does this place details response assert this attribute?". Absent means
   * the attribute is minted from place TYPES or from collection, never from
   * a boolean field.
   */
  isEnabled?: (place: GooglePlacesV1Place) => boolean;
}

export const RESTAURANT_ATTRIBUTE_VOCAB: RestaurantAttributeVocabEntry[] = [
  {
    canonicalName: 'allows dogs',
    aliases: [
      'dog friendly',
      'dog-friendly',
      'dogs allowed',
      'dogs welcome',
      'dogs ok',
      'pet friendly',
      'pet-friendly',
      'pets allowed',
      'pets welcome',
      'pets ok',
      'dogs',
      'pets',
    ],
    isEnabled: (place) => place.allowsDogs === true,
  },
  {
    canonicalName: 'delivery',
    aliases: ['delivers', 'delivery available'],
    isEnabled: (place) => place.delivery === true,
  },
  {
    canonicalName: 'takeout',
    aliases: ['take out', 'pickup', 'pick up'],
    isEnabled: (place) => place.takeout === true,
  },
  {
    canonicalName: 'dine in',
    aliases: ['dine-in', 'dinein', 'dining in', 'dine inside'],
    isEnabled: (place) => place.dineIn === true,
  },
  {
    canonicalName: 'curbside pickup',
    aliases: ['curbside', 'curbside-pickup', 'curbside pick up'],
    isEnabled: (place) => place.curbsidePickup === true,
  },
  {
    canonicalName: 'good for children',
    aliases: [
      'child friendly',
      'child-friendly',
      'kid friendly',
      'kid-friendly',
      'kids welcome',
      'kids',
      'children',
      'family-friendly',
      'family friendly',
      'good for kids',
    ],
    isEnabled: (place) => place.goodForChildren === true,
  },
  {
    canonicalName: 'good for groups',
    aliases: [
      'good for large groups',
      'large groups',
      'groups welcome',
      'groups',
      'large party',
      'large parties',
      'group friendly',
      'group-friendly',
      'good for groups of people',
    ],
    isEnabled: (place) => place.goodForGroups === true,
  },
  {
    canonicalName: 'good for watching sports',
    aliases: [
      'watch sports',
      'watch the game',
      'sports on tv',
      'sports',
      'games on tv',
      'sports tv',
      'sports viewing',
      'sports bar',
    ],
    isEnabled: (place) => place.goodForWatchingSports === true,
  },
  {
    canonicalName: 'live music',
    aliases: [
      'music',
      'live entertainment',
      'live performances',
      'live-music',
      'music venue',
    ],
    isEnabled: (place) => place.liveMusic === true,
  },
  {
    canonicalName: 'outdoor seating',
    aliases: [
      'patio',
      'patio seating',
      'outside seating',
      'al fresco',
      'alfresco',
      'outdoor dining',
      'outdoor-seating',
      'outdoor',
      'outside',
    ],
    isEnabled: (place) => place.outdoorSeating === true,
  },
  {
    canonicalName: 'serves beer',
    aliases: ['beer'],
    isEnabled: (place) => place.servesBeer === true,
  },
  {
    canonicalName: 'serves breakfast',
    aliases: ['breakfast'],
    isEnabled: (place) => place.servesBreakfast === true,
  },
  {
    canonicalName: 'serves brunch',
    aliases: ['brunch'],
    isEnabled: (place) => place.servesBrunch === true,
  },
  {
    canonicalName: 'serves cocktails',
    aliases: ['cocktails', 'mixed drinks', 'cocktail', 'cocktail bar'],
    isEnabled: (place) => place.servesCocktails === true,
  },
  {
    canonicalName: 'serves coffee',
    // NOT 'cafe'/'café' (F363 merge). The deleted second table aliased both
    // to this attribute, but 'cafe' is a CANONICAL attribute of its own here
    // (minted from Google's `cafe` place type) — an alias may never outrank a
    // canonical name, and "this restaurant serves coffee" is not "this
    // restaurant is a cafe". The accented spelling joins the canonical it
    // actually spells, below.
    aliases: ['coffee', 'coffee bar', 'espresso', 'espresso bar'],
    isEnabled: (place) => place.servesCoffee === true,
  },
  {
    canonicalName: 'serves dinner',
    aliases: ['dinner'],
    isEnabled: (place) => place.servesDinner === true,
  },
  {
    canonicalName: 'serves dessert',
    aliases: [
      'dessert',
      'desserts',
      'dessert menu',
      'sweet treats',
      'sweets',
      'sweet',
    ],
    isEnabled: (place) => place.servesDessert === true,
  },
  {
    canonicalName: 'serves lunch',
    aliases: ['lunch'],
    isEnabled: (place) => place.servesLunch === true,
  },
  {
    canonicalName: 'serves vegetarian food',
    aliases: [
      'vegetarian',
      'vegetarian friendly',
      'vegetarian options',
      'vegetarian restaurant',
    ],
    isEnabled: (place) => place.servesVegetarianFood === true,
  },
  {
    canonicalName: 'serves wine',
    aliases: ['wine'],
    isEnabled: (place) => place.servesWine === true,
  },

  {
    canonicalName: 'acai shop',
    aliases: ['acai bar', 'acai shop', 'acai bowl shop'],
  },
  {
    canonicalName: 'afghani',
    aliases: [
      'afghani',
      'afghan',
      'afghani cuisine',
      'afghani food',
      'afghani restaurant',
      'afghan cuisine',
    ],
  },
  {
    canonicalName: 'african',
    aliases: [
      'african',
      'african cuisine',
      'african food',
      'african restaurant',
    ],
  },
  {
    canonicalName: 'american',
    aliases: [
      'american',
      'american cuisine',
      'american food',
      'american restaurant',
    ],
  },
  {
    canonicalName: 'asian',
    aliases: ['asian', 'asian cuisine', 'asian food', 'asian restaurant'],
  },
  {
    canonicalName: 'bagel shop',
    aliases: ['bagel shop', 'bagel store'],
  },
  {
    canonicalName: 'bakery',
    aliases: ['bakery', 'bakery shop', 'bake shop', 'bakeshop'],
  },
  {
    canonicalName: 'bar',
    aliases: ['bar', 'barroom'],
  },
  {
    canonicalName: 'bar and grill',
    aliases: ['bar and grill', 'bar & grill', 'bar n grill', 'bar-n-grill'],
  },
  {
    canonicalName: 'barbecue',
    aliases: ['barbecue', 'barbecue restaurant', 'bbq restaurant', 'barbeque'],
  },
  {
    canonicalName: 'brazilian',
    aliases: [
      'brazilian',
      'brazilian cuisine',
      'brazilian food',
      'brazilian restaurant',
    ],
  },
  {
    canonicalName: 'breakfast restaurant',
    aliases: ['breakfast restaurant', 'breakfast spot', 'breakfast place'],
  },
  {
    canonicalName: 'brunch restaurant',
    aliases: ['brunch restaurant', 'brunch spot', 'brunch place'],
  },
  {
    canonicalName: 'buffet',
    aliases: [
      'buffet',
      'buffet restaurant',
      'all you can eat',
      'all-you-can-eat',
    ],
  },
  {
    canonicalName: 'cafe',
    aliases: ['cafe', 'café', 'cafe restaurant'],
  },
  {
    canonicalName: 'cafeteria',
    aliases: ['cafeteria', 'canteen'],
  },
  {
    canonicalName: 'candy store',
    aliases: ['candy store', 'candy shop'],
  },
  {
    canonicalName: 'cat cafe',
    aliases: ['cat cafe', 'cat coffee shop', 'cat coffeehouse'],
  },
  {
    canonicalName: 'chinese',
    aliases: [
      'chinese',
      'chinese cuisine',
      'chinese food',
      'chinese restaurant',
    ],
  },
  {
    canonicalName: 'chocolate factory',
    aliases: ['chocolate factory', 'chocolate maker', 'chocolate manufacturer'],
  },
  {
    canonicalName: 'chocolate shop',
    aliases: [
      'chocolate shop',
      'chocolate store',
      'chocolatier',
      'chocolate boutique',
    ],
  },
  {
    canonicalName: 'coffee shop',
    aliases: ['coffee shop', 'coffee house', 'coffeehouse'],
  },
  {
    canonicalName: 'confectionery',
    aliases: ['confectionery', 'confectionery shop', 'confectioner'],
  },
  {
    canonicalName: 'deli',
    aliases: ['deli', 'delicatessen', 'deli shop', 'delicatessen shop'],
  },
  {
    canonicalName: 'dessert restaurant',
    aliases: ['dessert restaurant'],
  },
  {
    canonicalName: 'dessert shop',
    aliases: ['dessert shop', 'dessert bar', 'sweet shop'],
  },
  {
    canonicalName: 'diner',
    aliases: ['diner', 'greasy spoon'],
  },
  {
    canonicalName: 'dog cafe',
    aliases: ['dog cafe', 'dog coffee shop'],
  },
  {
    canonicalName: 'donut shop',
    aliases: ['donut shop', 'doughnut shop', 'donut store'],
  },
  {
    canonicalName: 'fast food',
    aliases: ['fast food', 'fast-food', 'fast food restaurant'],
  },
  {
    canonicalName: 'fine dining',
    aliases: ['fine dining', 'fine-dining'],
  },
  {
    canonicalName: 'food court',
    aliases: ['food court'],
  },
  {
    canonicalName: 'french',
    aliases: ['french', 'french cuisine', 'french food', 'french restaurant'],
  },
  {
    canonicalName: 'greek',
    aliases: ['greek', 'greek cuisine', 'greek food', 'greek restaurant'],
  },
  {
    canonicalName: 'burger',
    aliases: ['burger joint', 'burger restaurant', 'hamburger restaurant'],
  },
  {
    canonicalName: 'ice cream shop',
    aliases: [
      'ice cream shop',
      'ice cream parlor',
      'ice cream parlour',
      'gelato shop',
    ],
  },
  {
    canonicalName: 'indian',
    aliases: ['indian', 'indian cuisine', 'indian food', 'indian restaurant'],
  },
  {
    canonicalName: 'indonesian',
    aliases: [
      'indonesian',
      'indonesian cuisine',
      'indonesian food',
      'indonesian restaurant',
    ],
  },
  {
    canonicalName: 'italian',
    aliases: [
      'italian',
      'italian cuisine',
      'italian food',
      'italian restaurant',
    ],
  },
  {
    canonicalName: 'japanese',
    aliases: [
      'japanese',
      'japanese cuisine',
      'japanese food',
      'japanese restaurant',
    ],
  },
  {
    canonicalName: 'juice shop',
    aliases: ['juice shop', 'juice bar', 'smoothie shop', 'smoothie bar'],
  },
  {
    canonicalName: 'korean',
    aliases: ['korean', 'korean cuisine', 'korean food', 'korean restaurant'],
  },
  {
    canonicalName: 'lebanese',
    aliases: [
      'lebanese',
      'lebanese cuisine',
      'lebanese food',
      'lebanese restaurant',
    ],
  },
  {
    canonicalName: 'mediterranean',
    aliases: [
      'mediterranean',
      'mediterranean cuisine',
      'mediterranean food',
      'mediterranean restaurant',
    ],
  },
  {
    canonicalName: 'mexican',
    aliases: [
      'mexican',
      'mexican cuisine',
      'mexican food',
      'mexican restaurant',
    ],
  },
  {
    canonicalName: 'middle eastern',
    aliases: [
      'middle eastern',
      'middle eastern cuisine',
      'middle eastern food',
      'middle eastern restaurant',
    ],
  },
  {
    canonicalName: 'pizza',
    aliases: ['pizza place', 'pizza shop', 'pizza joint', 'pizzeria'],
  },
  {
    canonicalName: 'pub',
    aliases: ['pub', 'public house', 'gastropub', 'alehouse'],
  },
  {
    canonicalName: 'ramen',
    aliases: ['ramen shop', 'ramen house'],
  },
  {
    canonicalName: 'sandwich shop',
    aliases: ['sandwich shop', 'sub shop'],
  },
  {
    canonicalName: 'seafood',
    aliases: [
      'seafood restaurant',
      'seafood house',
      'fish house',
      'seafood shack',
    ],
  },
  {
    canonicalName: 'spanish',
    aliases: [
      'spanish',
      'spanish cuisine',
      'spanish food',
      'spanish restaurant',
    ],
  },
  {
    canonicalName: 'steakhouse',
    aliases: ['steakhouse', 'steak house', 'steakhouse grill'],
  },
  {
    canonicalName: 'sushi',
    aliases: ['sushi bar', 'sushi house'],
  },
  {
    canonicalName: 'tea house',
    aliases: ['tea house', 'teahouse', 'tea room', 'tea salon'],
  },
  {
    canonicalName: 'thai',
    aliases: ['thai', 'thai cuisine', 'thai food', 'thai restaurant'],
  },
  {
    canonicalName: 'turkish',
    aliases: [
      'turkish',
      'turkish cuisine',
      'turkish food',
      'turkish restaurant',
    ],
  },
  {
    canonicalName: 'vegan',
    aliases: ['vegan', 'vegan cuisine', 'vegan food', 'vegan restaurant'],
  },
  {
    canonicalName: 'vietnamese',
    aliases: [
      'vietnamese',
      'vietnamese cuisine',
      'vietnamese food',
      'vietnamese restaurant',
    ],
  },
  {
    canonicalName: 'wine bar',
    aliases: ['wine bar', 'wine-bar', 'wine lounge'],
  },
];

/**
 * The Google boolean-field attributes, DERIVED from the one vocabulary rather
 * than listed a second time — the same derivation style that kept
 * ALIASES_BY_NAME and CANONICAL_NAMES from ever drifting.
 */
export const GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB: RestaurantAttributeVocabEntry[] =
  RESTAURANT_ATTRIBUTE_VOCAB.filter((entry) => entry.isEnabled !== undefined);

export const RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME: Map<string, string[]> =
  new Map(
    RESTAURANT_ATTRIBUTE_VOCAB.map((entry) => [
      entry.canonicalName,
      entry.aliases,
    ]),
  );

/**
 * Google's COMPLETE Food-and-Drink place-type category (Table A), copied
 * verbatim from
 * https://developers.google.com/maps/documentation/places/web-service/place-types
 * on 2026-08-07 (164 types).
 *
 * WHY THIS EXISTS (ghost-restaurant attribution, data-audit round 2): the
 * grounding lane's "is this restaurant-ish" question used to be answered by
 * the keys of GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP — a CUISINE-NAMING map, 64
 * entries, reused as a venue classifier. Google's own taxonomy is ~164
 * food-and-drink types, so real restaurants failed the check by type alone:
 * taco_restaurant (77 ghost candidates), family_restaurant, cocktail_bar,
 * bistro, brewery. Worse, the check ran as a VETO on the LLM adjudicator —
 * 234 ghosts have `selected_candidate_failed_restaurant_type_gate` trails
 * where the judge picked the RIGHT place (Rebel Cheese Factory, Austin) and
 * the 64-entry list overruled it.
 *
 * This set answers only the HINT question ("restaurantish", chooser rule 11
 * ranking) — it is Google's own category, so membership is a vendor fact,
 * not our judgment. It must never again become a veto: the Gate-2 forensics
 * (plans/data-audit-2026-08.md) proved NO type list can decide
 * food-service-ness — Buc-ee's (convenience_store) sells breakfast tacos
 * people plan road trips around, and PlantShed (florist) serves espresso.
 * The judge decides; this ranks.
 */
export const GOOGLE_FOOD_AND_DRINK_PLACE_TYPES: ReadonlySet<string> = new Set([
  'acai_shop',
  'afghani_restaurant',
  'african_restaurant',
  'american_restaurant',
  'argentinian_restaurant',
  'asian_fusion_restaurant',
  'asian_restaurant',
  'australian_restaurant',
  'austrian_restaurant',
  'bagel_shop',
  'bakery',
  'bangladeshi_restaurant',
  'bar',
  'bar_and_grill',
  'barbecue_restaurant',
  'basque_restaurant',
  'bavarian_restaurant',
  'beer_garden',
  'belgian_restaurant',
  'bistro',
  'brazilian_restaurant',
  'breakfast_restaurant',
  'brewery',
  'brewpub',
  'british_restaurant',
  'brunch_restaurant',
  'buffet_restaurant',
  'burmese_restaurant',
  'burrito_restaurant',
  'cafe',
  'cafeteria',
  'cajun_restaurant',
  'cake_shop',
  'californian_restaurant',
  'cambodian_restaurant',
  'candy_store',
  'cantonese_restaurant',
  'caribbean_restaurant',
  'cat_cafe',
  'chicken_restaurant',
  'chicken_wings_restaurant',
  'chilean_restaurant',
  'chinese_noodle_restaurant',
  'chinese_restaurant',
  'chocolate_factory',
  'chocolate_shop',
  'cocktail_bar',
  'coffee_roastery',
  'coffee_shop',
  'coffee_stand',
  'colombian_restaurant',
  'confectionery',
  'croatian_restaurant',
  'cuban_restaurant',
  'czech_restaurant',
  'danish_restaurant',
  'deli',
  'dessert_restaurant',
  'dessert_shop',
  'dim_sum_restaurant',
  'diner',
  'dog_cafe',
  'donut_shop',
  'dumpling_restaurant',
  'dutch_restaurant',
  'eastern_european_restaurant',
  'ethiopian_restaurant',
  'european_restaurant',
  'falafel_restaurant',
  'family_restaurant',
  'fast_food_restaurant',
  'filipino_restaurant',
  'fine_dining_restaurant',
  'fish_and_chips_restaurant',
  'fondue_restaurant',
  'food_court',
  'french_restaurant',
  'fusion_restaurant',
  'gastropub',
  'german_restaurant',
  'greek_restaurant',
  'gyro_restaurant',
  'halal_restaurant',
  'hamburger_restaurant',
  'hawaiian_restaurant',
  'hookah_bar',
  'hot_dog_restaurant',
  'hot_dog_stand',
  'hot_pot_restaurant',
  'hungarian_restaurant',
  'ice_cream_shop',
  'indian_restaurant',
  'indonesian_restaurant',
  'irish_pub',
  'irish_restaurant',
  'israeli_restaurant',
  'italian_restaurant',
  'japanese_curry_restaurant',
  'japanese_izakaya_restaurant',
  'japanese_restaurant',
  'juice_shop',
  'kebab_shop',
  'korean_barbecue_restaurant',
  'korean_restaurant',
  'latin_american_restaurant',
  'lebanese_restaurant',
  'lounge_bar',
  'malaysian_restaurant',
  'meal_delivery',
  'meal_takeaway',
  'mediterranean_restaurant',
  'mexican_restaurant',
  'middle_eastern_restaurant',
  'mongolian_barbecue_restaurant',
  'moroccan_restaurant',
  'noodle_shop',
  'north_indian_restaurant',
  'oyster_bar_restaurant',
  'pakistani_restaurant',
  'pastry_shop',
  'persian_restaurant',
  'peruvian_restaurant',
  'pizza_delivery',
  'pizza_restaurant',
  'polish_restaurant',
  'portuguese_restaurant',
  'pub',
  'ramen_restaurant',
  'restaurant',
  'romanian_restaurant',
  'russian_restaurant',
  'salad_shop',
  'sandwich_shop',
  'scandinavian_restaurant',
  'seafood_restaurant',
  'shawarma_restaurant',
  'snack_bar',
  'soul_food_restaurant',
  'soup_restaurant',
  'south_american_restaurant',
  'south_indian_restaurant',
  'southwestern_us_restaurant',
  'spanish_restaurant',
  'sports_bar',
  'sri_lankan_restaurant',
  'steak_house',
  'sushi_restaurant',
  'swiss_restaurant',
  'taco_restaurant',
  'taiwanese_restaurant',
  'tapas_restaurant',
  'tea_house',
  'tex_mex_restaurant',
  'thai_restaurant',
  'tibetan_restaurant',
  'tonkatsu_restaurant',
  'turkish_restaurant',
  'ukrainian_restaurant',
  'vegan_restaurant',
  'vegetarian_restaurant',
  'vietnamese_restaurant',
  'western_restaurant',
  'wine_bar',
  'winery',
  'yakiniku_restaurant',
  'yakitori_restaurant',
]);
