import { GooglePlacesV1Place } from '../external-integrations/google-places/google-places.service';

/**
 * THE ONE AUTHORITY FOR GOOGLE PLACE TYPES (R11 audit, 2026-08-16).
 *
 * Every Google place type ever observed on a grounded restaurant is
 * classified here, exactly once, as one of:
 *
 *   - a KIND (an entry of GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP): the type carries
 *     real venue/cuisine information and is promoted to a
 *     restaurant_attribute — POLICY (R12, owner-ruled): we TRUST Google's
 *     tagging. `restaurant` itself is a mapped venue kind: a restaurant+bar
 *     shows under "Restaurants"; a bar-only venue does not. Classification
 *     rule: every type in the Food & Drink category of Google's published
 *     Places type list (Table A) is a kind; everything else is noise. Two
 *     deliberate exceptions ride the rule: `food_delivery` joins
 *     `meal_delivery` on the existing 'delivery' attribute, and generic
 *     `food` is noise (it asserts nothing a venue kind doesn't).
 *
 *   - NOISE (an entry of GOOGLE_PLACE_TYPE_IGNORED_TYPES): the type carries
 *     no food-venue information for this app (owner rulings:
 *     establishment/point_of_interest ignore; store and the store family
 *     lean-no → ignore).
 *
 * Google changes types rarely; the owner re-audits manually on their next
 * big release. Between releases the unmapped-types census invariant
 * (scripts/check-place-type-classification.ts + the nightly census phase)
 * alarms on any stored type this file does not classify.
 */
export const GOOGLE_PLACE_CUISINE_TYPE_MAP: Record<string, string> = {
  afghani_restaurant: 'afghani',
  african_restaurant: 'african',
  american_restaurant: 'american',
  argentinian_restaurant: 'argentinian',
  asian_fusion_restaurant: 'asian fusion',
  asian_restaurant: 'asian',
  australian_restaurant: 'australian',
  austrian_restaurant: 'austrian',
  bangladeshi_restaurant: 'bangladeshi',
  basque_restaurant: 'basque',
  bavarian_restaurant: 'bavarian',
  belgian_restaurant: 'belgian',
  brazilian_restaurant: 'brazilian',
  british_restaurant: 'british',
  burmese_restaurant: 'burmese',
  cajun_restaurant: 'cajun',
  californian_restaurant: 'californian',
  cambodian_restaurant: 'cambodian',
  cantonese_restaurant: 'cantonese',
  caribbean_restaurant: 'caribbean',
  chilean_restaurant: 'chilean',
  chinese_restaurant: 'chinese',
  colombian_restaurant: 'colombian',
  croatian_restaurant: 'croatian',
  cuban_restaurant: 'cuban',
  czech_restaurant: 'czech',
  danish_restaurant: 'danish',
  dutch_restaurant: 'dutch',
  eastern_european_restaurant: 'eastern european',
  ethiopian_restaurant: 'ethiopian',
  european_restaurant: 'european',
  filipino_restaurant: 'filipino',
  french_restaurant: 'french',
  fusion_restaurant: 'fusion',
  german_restaurant: 'german',
  greek_restaurant: 'greek',
  halal_restaurant: 'halal',
  hawaiian_restaurant: 'hawaiian',
  hungarian_restaurant: 'hungarian',
  indian_restaurant: 'indian',
  indonesian_restaurant: 'indonesian',
  irish_restaurant: 'irish',
  israeli_restaurant: 'israeli',
  italian_restaurant: 'italian',
  japanese_restaurant: 'japanese',
  korean_restaurant: 'korean',
  latin_american_restaurant: 'latin american',
  lebanese_restaurant: 'lebanese',
  malaysian_restaurant: 'malaysian',
  mediterranean_restaurant: 'mediterranean',
  mexican_restaurant: 'mexican',
  middle_eastern_restaurant: 'middle eastern',
  moroccan_restaurant: 'moroccan',
  north_indian_restaurant: 'north indian',
  pakistani_restaurant: 'pakistani',
  persian_restaurant: 'persian',
  peruvian_restaurant: 'peruvian',
  polish_restaurant: 'polish',
  portuguese_restaurant: 'portuguese',
  romanian_restaurant: 'romanian',
  russian_restaurant: 'russian',
  scandinavian_restaurant: 'scandinavian',
  soul_food_restaurant: 'soul food',
  south_american_restaurant: 'south american',
  south_indian_restaurant: 'south indian',
  southwestern_us_restaurant: 'southwestern',
  spanish_restaurant: 'spanish',
  sri_lankan_restaurant: 'sri lankan',
  swiss_restaurant: 'swiss',
  taiwanese_restaurant: 'taiwanese',
  tex_mex_restaurant: 'tex-mex',
  thai_restaurant: 'thai',
  tibetan_restaurant: 'tibetan',
  turkish_restaurant: 'turkish',
  ukrainian_restaurant: 'ukrainian',
  vietnamese_restaurant: 'vietnamese',
  western_restaurant: 'western',
};

export const GOOGLE_PLACE_NON_CUISINE_TYPE_MAP: Record<string, string> = {
  acai_shop: 'acai shop',
  bagel_shop: 'bagel shop',
  bakery: 'bakery',
  bar: 'bar',
  bar_and_grill: 'bar and grill',
  barbecue_restaurant: 'barbecue',
  beer_garden: 'beer garden',
  bistro: 'bistro',
  breakfast_restaurant: 'breakfast restaurant',
  brewery: 'brewery',
  brewpub: 'brewpub',
  brunch_restaurant: 'brunch restaurant',
  buffet_restaurant: 'buffet',
  burrito_restaurant: 'burritos',
  cafe: 'cafe',
  cafeteria: 'cafeteria',
  cake_shop: 'cake shop',
  candy_store: 'candy store',
  cat_cafe: 'cat cafe',
  chicken_restaurant: 'chicken restaurant',
  chicken_wings_restaurant: 'chicken wings',
  chinese_noodle_restaurant: 'chinese noodles',
  chocolate_factory: 'chocolate factory',
  chocolate_shop: 'chocolate shop',
  cocktail_bar: 'cocktail bar',
  coffee_roastery: 'coffee roastery',
  coffee_shop: 'coffee shop',
  coffee_stand: 'coffee stand',
  confectionery: 'confectionery',
  deli: 'deli',
  dessert_restaurant: 'dessert restaurant',
  dessert_shop: 'dessert shop',
  dim_sum_restaurant: 'dim sum',
  diner: 'diner',
  dog_cafe: 'dog cafe',
  donut_shop: 'donut shop',
  dumpling_restaurant: 'dumplings',
  falafel_restaurant: 'falafel',
  family_restaurant: 'family restaurant',
  fast_food_restaurant: 'fast food',
  fine_dining_restaurant: 'fine dining',
  fish_and_chips_restaurant: 'fish and chips',
  fondue_restaurant: 'fondue',
  // The one deliberate rule exception: Google's newer `food_delivery` type
  // asserts the same fact as `meal_delivery` — one canonical, two spellings.
  food_delivery: 'delivery',
  food_court: 'food court',
  gastropub: 'gastropub',
  gyro_restaurant: 'gyros',
  hamburger_restaurant: 'burger',
  hookah_bar: 'hookah bar',
  hot_dog_restaurant: 'hot dogs',
  hot_dog_stand: 'hot dog stand',
  hot_pot_restaurant: 'hot pot',
  ice_cream_shop: 'ice cream shop',
  irish_pub: 'irish pub',
  japanese_curry_restaurant: 'japanese curry',
  japanese_izakaya_restaurant: 'izakaya',
  juice_shop: 'juice shop',
  kebab_shop: 'kebab shop',
  korean_barbecue_restaurant: 'korean barbecue',
  lounge_bar: 'lounge',
  meal_delivery: 'delivery',
  meal_takeaway: 'takeout',
  mongolian_barbecue_restaurant: 'mongolian barbecue',
  noodle_shop: 'noodle shop',
  oyster_bar_restaurant: 'oyster bar',
  pastry_shop: 'pastry shop',
  pizza_delivery: 'pizza delivery',
  pizza_restaurant: 'pizza',
  pub: 'pub',
  ramen_restaurant: 'ramen',
  // R12: `restaurant` is a real venue kind, not filler — 17% of grounded
  // venues are NOT restaurants, and this tag is what separates them.
  restaurant: 'restaurant',
  salad_shop: 'salad shop',
  sandwich_shop: 'sandwich shop',
  seafood_restaurant: 'seafood',
  shawarma_restaurant: 'shawarma',
  snack_bar: 'snack bar',
  soup_restaurant: 'soup',
  sports_bar: 'sports bar',
  steak_house: 'steakhouse',
  sushi_restaurant: 'sushi',
  taco_restaurant: 'tacos',
  tapas_restaurant: 'tapas',
  tea_house: 'tea house',
  tonkatsu_restaurant: 'tonkatsu',
  vegan_restaurant: 'vegan',
  vegetarian_restaurant: 'serves vegetarian food',
  wine_bar: 'wine bar',
  winery: 'winery',
  yakiniku_restaurant: 'yakiniku',
  yakitori_restaurant: 'yakitori',
};

/**
 * NOISE: observed place types that carry no food-venue information for this
 * app. Owner rulings: `establishment`/`point_of_interest` ignore; `store`
 * (and the whole retail-store family) lean-no → ignore. Everything outside
 * Google's Food & Drink category lands here. A stored type in NEITHER this
 * set NOR the attribute map is an unclassified new type — the census
 * invariant goes red and the nightly census raises an ops alert.
 */
export const GOOGLE_PLACE_TYPE_IGNORED_TYPES: ReadonlySet<string> = new Set([
  // the generic filler on every place
  'establishment',
  'point_of_interest',
  'food',
  // the store family (owner: lean no)
  'store',
  'food_store',
  'grocery_store',
  'asian_grocery_store',
  'health_food_store',
  'convenience_store',
  'supermarket',
  'hypermarket',
  'general_store',
  'department_store',
  'liquor_store',
  'tea_store',
  'butcher_shop',
  'gift_shop',
  'book_store',
  'clothing_store',
  'cosmetics_store',
  'drugstore',
  'electronics_store',
  'furniture_store',
  'hardware_store',
  'home_goods_store',
  'home_improvement_store',
  'building_materials_store',
  'sporting_goods_store',
  'bicycle_store',
  'toy_store',
  'farmers_market',
  'market',
  'florist',
  'pharmacy',
  // services / business generics
  'service',
  'catering_service',
  'shipping_service',
  'manufacturer',
  'wholesaler',
  'supplier',
  'consultant',
  'corporate_office',
  'coworking_space',
  'association_or_organization',
  'finance',
  'atm',
  'gas_station',
  'car_wash',
  'health',
  'medical_clinic',
  'spa',
  // venues / entertainment / culture (not food-and-drink kinds)
  'event_venue',
  'wedding_venue',
  'banquet_hall',
  'night_club',
  'karaoke',
  'dance_hall',
  'comedy_club',
  'live_music_venue',
  'performing_arts_theater',
  'movie_theater',
  'video_arcade',
  'amusement_center',
  'bowling_alley',
  'internet_cafe',
  'art_gallery',
  'museum',
  // First catch of the unmapped-types census alarm (2026-08-19): the
  // reground campaign's grounding pass landed seven never-seen types on
  // night one. All noise — venues that HOST food service without being a
  // food venue kind (nobody searches "stadium" hungry for a kind of place
  // the way they search "bakery").
  'auditorium',
  'concert_hall',
  'garden_center',
  'mosque',
  'non_profit_organization',
  'stadium',
  'womens_clothing_store',
  // Second tranche from the same reground drain (2026-08-19, later batch):
  'art_studio',
  'general_contractor',
  'ranch',
  'resort_hotel',
  'wellness_center',
  // Fourth tranche, same drain (2026-08-25 nightly catch #4): venues that
  // HOST or NEIGHBOR food service without being a food-venue kind, plus
  // pure-service noise. All 14 verified 1-2 entities each.
  'amusement_park',
  'buddhist_temple',
  'electric_vehicle_charging_station',
  'government_office',
  'guest_house',
  'history_museum',
  'marina',
  'miniature_golf_course',
  'observation_deck',
  'pet_care',
  'real_estate_agency',
  'secondary_school',
  'shopping_mall',
  'transportation_service',
  // Third tranche, same drain (2026-08-19): outdoors/retail noise.
  'discount_supermarket',
  'hiking_area',
  'picnic_ground',
  'scenic_spot',
  'cultural_center',
  'cultural_landmark',
  'community_center',
  'tourist_attraction',
  'historical_landmark',
  'historical_place',
  // lodging
  'lodging',
  'hotel',
  'inn',
  'extended_stay_hotel',
  // outdoors / sports / fitness
  'park',
  'garden',
  'playground',
  'farm',
  'vineyard',
  'barbecue_area',
  'sports_activity_location',
  'sports_complex',
  'sports_club',
  'sports_school',
  'athletic_field',
  'swimming_pool',
  'gym',
  'fitness_center',
  'yoga_studio',
  'go_karting_venue',
  'race_course',
  // institutions
  'school',
  'primary_school',
  'educational_institution',
  'place_of_worship',
  'church',
]);

/** Is this stored Google place type classified (kind OR noise)? The census
 *  invariant requires this to be true of every distinct stored type. */
export function isClassifiedGooglePlaceType(type: string): boolean {
  return (
    type in GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP ||
    GOOGLE_PLACE_TYPE_IGNORED_TYPES.has(type)
  );
}

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
export interface PlaceAttributeVocabEntry {
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

/** The standard alias template every plain cuisine entry follows ('thai',
 *  'thai cuisine', 'thai food', 'thai restaurant'). R11 additions use it via
 *  this helper; entries whose aliases deviate stay explicit. */
function cuisineEntry(
  canonicalName: string,
  extraAliases: string[] = [],
): PlaceAttributeVocabEntry {
  return {
    canonicalName,
    aliases: [
      canonicalName,
      `${canonicalName} cuisine`,
      `${canonicalName} food`,
      `${canonicalName} restaurant`,
      ...extraAliases,
    ],
  };
}

export const PLACE_ATTRIBUTE_VOCAB: PlaceAttributeVocabEntry[] = [
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
      // NOT 'sports bar' — that is a canonical attribute of its own now
      // (Google's `sports_bar` place type), and an alias may never outrank
      // a canonical name (the F363 'cafe' rule).
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
    // NOT 'cocktail bar' — a canonical attribute of its own now (Google's
    // `cocktail_bar` place type); the F363 'cafe' rule again.
    aliases: ['cocktails', 'mixed drinks', 'cocktail'],
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
    // NOT 'gastropub' — a canonical attribute of its own now (Google's
    // `gastropub` place type); the F363 'cafe' rule again.
    aliases: ['pub', 'public house', 'alehouse'],
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

  // ------------------------------------------------------------------
  // R11 additions (2026-08-16): the rest of Google's Food & Drink types.
  // Cuisines first, on the standard template…
  ...[
    'argentinian',
    'australian',
    'austrian',
    'bangladeshi',
    'basque',
    'bavarian',
    'belgian',
    'british',
    'burmese',
    'cajun',
    'californian',
    'cambodian',
    'cantonese',
    'caribbean',
    'chilean',
    'colombian',
    'croatian',
    'cuban',
    'czech',
    'danish',
    'dutch',
    'eastern european',
    'ethiopian',
    'european',
    'filipino',
    'fusion',
    'german',
    'halal',
    'hawaiian',
    'hungarian',
    'irish',
    'israeli',
    'latin american',
    'malaysian',
    'moroccan',
    'north indian',
    'pakistani',
    'persian',
    'peruvian',
    'polish',
    'portuguese',
    'romanian',
    'russian',
    'scandinavian',
    'south american',
    'south indian',
    'southwestern',
    'sri lankan',
    'swiss',
    'taiwanese',
    'tibetan',
    'ukrainian',
    'western',
  ].map((name) => cuisineEntry(name)),
  cuisineEntry('asian fusion', ['asian-fusion']),
  {
    canonicalName: 'soul food',
    aliases: ['soul food', 'soul food cuisine', 'soul food restaurant'],
  },
  {
    canonicalName: 'tex-mex',
    aliases: ['tex-mex', 'tex mex', 'tex-mex restaurant', 'tex mex food'],
  },

  // …then the venue kinds and food-item kinds.
  {
    // R12: THE venue kind. Google's restaurant tag means "serves food as a
    // restaurant" — restaurant+bar shows under Restaurants; bar-only does not.
    canonicalName: 'restaurant',
    aliases: ['restaurant', 'restaurants'],
  },
  { canonicalName: 'beer garden', aliases: ['beer garden', 'biergarten'] },
  { canonicalName: 'bistro', aliases: ['bistro'] },
  {
    canonicalName: 'brewery',
    aliases: ['brewery', 'craft brewery', 'microbrewery'],
  },
  { canonicalName: 'brewpub', aliases: ['brewpub', 'brew pub'] },
  {
    canonicalName: 'burritos',
    aliases: ['burrito', 'burrito restaurant', 'burrito shop'],
  },
  {
    canonicalName: 'cake shop',
    aliases: ['cake shop', 'cake store', 'cakery'],
  },
  {
    canonicalName: 'chicken restaurant',
    aliases: ['chicken restaurant', 'chicken spot', 'chicken place'],
  },
  {
    canonicalName: 'chicken wings',
    aliases: ['chicken wings', 'wings', 'wing spot', 'wing joint'],
  },
  {
    canonicalName: 'chinese noodles',
    aliases: ['chinese noodles', 'chinese noodle restaurant'],
  },
  {
    canonicalName: 'cocktail bar',
    aliases: ['cocktail bar', 'cocktail lounge'],
  },
  {
    canonicalName: 'coffee roastery',
    aliases: ['coffee roastery', 'coffee roaster', 'roastery'],
  },
  {
    canonicalName: 'coffee stand',
    aliases: ['coffee stand', 'coffee cart', 'coffee kiosk'],
  },
  {
    canonicalName: 'dim sum',
    aliases: ['dim sum', 'dim sum restaurant', 'dimsum'],
  },
  {
    canonicalName: 'dumplings',
    aliases: ['dumplings', 'dumpling restaurant', 'dumpling house'],
  },
  {
    canonicalName: 'falafel',
    aliases: ['falafel', 'falafel restaurant', 'falafel shop'],
  },
  {
    canonicalName: 'family restaurant',
    aliases: [
      'family restaurant',
      'family style restaurant',
      'family-style restaurant',
    ],
  },
  {
    canonicalName: 'fish and chips',
    aliases: ['fish and chips', 'fish & chips', 'chippy'],
  },
  { canonicalName: 'fondue', aliases: ['fondue', 'fondue restaurant'] },
  { canonicalName: 'gastropub', aliases: ['gastropub', 'gastro pub'] },
  {
    canonicalName: 'gyros',
    aliases: ['gyro', 'gyros', 'gyro restaurant', 'gyro shop'],
  },
  {
    canonicalName: 'hookah bar',
    aliases: ['hookah bar', 'hookah lounge', 'shisha bar', 'shisha lounge'],
  },
  {
    canonicalName: 'hot dogs',
    aliases: ['hot dog', 'hot dogs', 'hot dog restaurant', 'hot dog joint'],
  },
  {
    canonicalName: 'hot dog stand',
    aliases: ['hot dog stand', 'hot dog cart'],
  },
  {
    canonicalName: 'hot pot',
    aliases: ['hot pot', 'hotpot', 'hot pot restaurant'],
  },
  { canonicalName: 'irish pub', aliases: ['irish pub', 'irish bar'] },
  {
    canonicalName: 'izakaya',
    aliases: ['izakaya', 'japanese izakaya', 'izakaya restaurant'],
  },
  {
    canonicalName: 'japanese curry',
    aliases: ['japanese curry', 'japanese curry restaurant'],
  },
  {
    canonicalName: 'kebab shop',
    aliases: ['kebab shop', 'kebab restaurant', 'kabob shop', 'kebab'],
  },
  {
    canonicalName: 'korean barbecue',
    aliases: ['korean barbecue', 'korean bbq', 'kbbq'],
  },
  { canonicalName: 'lounge', aliases: ['lounge', 'lounge bar'] },
  {
    canonicalName: 'mongolian barbecue',
    aliases: ['mongolian barbecue', 'mongolian bbq', 'mongolian grill'],
  },
  {
    canonicalName: 'noodle shop',
    aliases: ['noodle shop', 'noodle house', 'noodle bar', 'noodles'],
  },
  {
    canonicalName: 'oyster bar',
    aliases: ['oyster bar', 'oyster house', 'oysters'],
  },
  {
    canonicalName: 'pastry shop',
    aliases: ['pastry shop', 'patisserie', 'pastry store'],
  },
  { canonicalName: 'pizza delivery', aliases: ['pizza delivery'] },
  {
    canonicalName: 'salad shop',
    aliases: ['salad shop', 'salad bar', 'salad place'],
  },
  {
    canonicalName: 'shawarma',
    aliases: ['shawarma', 'shawarma restaurant', 'shawarma shop'],
  },
  { canonicalName: 'snack bar', aliases: ['snack bar', 'snack shop'] },
  { canonicalName: 'soup', aliases: ['soup', 'soup restaurant'] },
  { canonicalName: 'sports bar', aliases: ['sports bar', 'sport bar'] },
  {
    canonicalName: 'tacos',
    aliases: ['taco', 'tacos', 'taco restaurant', 'taco shop', 'taqueria'],
  },
  {
    canonicalName: 'tapas',
    aliases: ['tapas', 'tapas bar', 'tapas restaurant'],
  },
  { canonicalName: 'tonkatsu', aliases: ['tonkatsu', 'katsu'] },
  { canonicalName: 'winery', aliases: ['winery'] },
  {
    canonicalName: 'yakiniku',
    aliases: ['yakiniku', 'yakiniku restaurant', 'japanese bbq'],
  },
  {
    canonicalName: 'yakitori',
    aliases: ['yakitori', 'yakitori restaurant', 'yakitori bar'],
  },
];

/**
 * The Google boolean-field attributes, DERIVED from the one vocabulary rather
 * than listed a second time — the same derivation style that kept
 * ALIASES_BY_NAME and CANONICAL_NAMES from ever drifting.
 */
export const GOOGLE_BOOLEAN_ATTRIBUTE_VOCAB: PlaceAttributeVocabEntry[] =
  PLACE_ATTRIBUTE_VOCAB.filter((entry) => entry.isEnabled !== undefined);

export const PLACE_ATTRIBUTE_ALIASES_BY_NAME: Map<string, string[]> = new Map(
  PLACE_ATTRIBUTE_VOCAB.map((entry) => [entry.canonicalName, entry.aliases]),
);
