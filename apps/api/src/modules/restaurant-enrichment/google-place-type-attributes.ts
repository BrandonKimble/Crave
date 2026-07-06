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
 */
export interface RestaurantAttributeVocabEntry {
  canonicalName: string;
  aliases: string[];
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
  },
  {
    canonicalName: 'delivery',
    aliases: ['delivers', 'delivery available'],
  },
  {
    canonicalName: 'takeout',
    aliases: ['take out', 'pickup', 'pick up'],
  },
  {
    canonicalName: 'dine in',
    aliases: ['dine-in', 'dinein', 'dining in', 'dine inside'],
  },
  {
    canonicalName: 'curbside pickup',
    aliases: ['curbside', 'curbside-pickup', 'curbside pick up'],
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
  },
  {
    canonicalName: 'serves beer',
    aliases: ['beer'],
  },
  {
    canonicalName: 'serves breakfast',
    aliases: ['breakfast'],
  },
  {
    canonicalName: 'serves brunch',
    aliases: ['brunch'],
  },
  {
    canonicalName: 'serves cocktails',
    aliases: ['cocktails', 'mixed drinks', 'cocktail', 'cocktail bar'],
  },
  {
    canonicalName: 'serves coffee',
    aliases: ['coffee', 'coffee bar', 'espresso', 'espresso bar'],
  },
  {
    canonicalName: 'serves dinner',
    aliases: ['dinner'],
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
  },
  {
    canonicalName: 'serves lunch',
    aliases: ['lunch'],
  },
  {
    canonicalName: 'serves vegetarian food',
    aliases: [
      'vegetarian',
      'vegetarian friendly',
      'vegetarian options',
      'vegetarian restaurant',
    ],
  },
  {
    canonicalName: 'serves wine',
    aliases: ['wine'],
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
    aliases: ['cafe', 'cafe restaurant'],
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

export const RESTAURANT_ATTRIBUTE_ALIASES_BY_NAME: Map<string, string[]> =
  new Map(
    RESTAURANT_ATTRIBUTE_VOCAB.map((entry) => [
      entry.canonicalName,
      entry.aliases,
    ]),
  );
