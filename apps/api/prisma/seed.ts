import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient, EntityType, MarketType } from '@prisma/client';

type RestaurantAttributeSeed = {
  canonicalName: string;
  aliases: string[];
};

type CollectionCommunitySeed = {
  communityName: string;
  locationName: string;
  marketKey: string;
};

type Coordinate = {
  lat: number;
  lng: number;
};

type RegionSourceBoundarySeed = {
  label: string;
  entityType: 'CountrySecondarySubdivision';
  anchor: Coordinate;
};

type RegionMarketSeed = {
  marketKey: string;
  marketName: string;
  marketShortName: string;
  countryCode: string;
  stateCode: string;
  center: Coordinate;
  sourceBoundaries: RegionSourceBoundarySeed[];
};

type TomTomReverseGeocodeAddress = {
  municipality?: string;
  municipalitySubdivision?: string;
  countrySecondarySubdivision?: string;
  countrySubdivision?: string;
  postalName?: string;
  freeformAddress?: string;
  countryCode?: string;
  boundingBox?: {
    northEast?: string;
    southWest?: string;
  };
};

type TomTomReverseGeocodeResult = {
  address?: TomTomReverseGeocodeAddress;
  position?: string;
  entityType?: string;
  dataSources?: {
    geometry?: {
      id?: string;
    };
  };
};

type TomTomReverseGeocodeResponse = {
  addresses?: TomTomReverseGeocodeResult[];
};

type GeoJsonGeometry = {
  type?: string;
  coordinates?: unknown;
};

type GeoJsonFeature = {
  type?: string;
  geometry?: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type?: string;
  features?: GeoJsonFeature[];
};

type TomTomAdditionalDataItem = {
  providerID?: string;
  providerId?: string;
  geometryData?: GeoJsonFeatureCollection;
  error?: string;
};

type TomTomAdditionalDataResponse = {
  additionalData?: TomTomAdditionalDataItem[];
};

type TomTomBoundaryCandidate = {
  sourceProvider: 'tomtom';
  sourceBoundaryId: string;
  sourceBoundaryType: RegionSourceBoundarySeed['entityType'];
  providerType: 'geometry';
  label: string;
  name: string;
  shortName: string | null;
  countryCode: string;
  stateCode: string | null;
  position: Coordinate | null;
  boundingBox: {
    northEast: Coordinate | null;
    southWest: Coordinate | null;
  } | null;
  rawAddress: TomTomReverseGeocodeAddress | null;
};

type StoredBoundary = Pick<
  TomTomBoundaryCandidate,
  | 'sourceProvider'
  | 'sourceBoundaryId'
  | 'sourceBoundaryType'
  | 'providerType'
  | 'label'
  | 'name'
  | 'shortName'
  | 'countryCode'
  | 'stateCode'
>;

type RegionUpsertRow = {
  marketKey: string;
  boundaryCount: number | bigint;
  areaKm2: number | string;
};

const BASE_RESTAURANT_ATTRIBUTE_SEEDS: RestaurantAttributeSeed[] = [
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
];

const GOOGLE_PLACE_TYPE_ATTRIBUTE_SEEDS: RestaurantAttributeSeed[] = [
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

const RESTAURANT_ATTRIBUTE_SEEDS: RestaurantAttributeSeed[] = [
  ...BASE_RESTAURANT_ATTRIBUTE_SEEDS,
  ...GOOGLE_PLACE_TYPE_ATTRIBUTE_SEEDS,
];

const COLLECTION_COMMUNITY_SEEDS: CollectionCommunitySeed[] = [
  {
    communityName: 'austinfood',
    locationName: 'Austin, TX',
    marketKey: 'region-us-tx-austin',
  },
  {
    communityName: 'foodnyc',
    locationName: 'New York, NY',
    marketKey: 'region-us-ny-new-york',
  },
];

const REGION_MARKET_SEEDS: RegionMarketSeed[] = [
  {
    marketKey: 'region-us-tx-austin',
    marketName: 'Austin, TX',
    marketShortName: 'Austin',
    countryCode: 'US',
    stateCode: 'TX',
    center: { lat: 30.2672, lng: -97.7431 },
    sourceBoundaries: [
      {
        label: 'Travis County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.2672, lng: -97.7431 },
      },
      {
        label: 'Williamson County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.646, lng: -97.6034 },
      },
      {
        label: 'Hays County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 29.8833, lng: -97.9414 },
      },
      {
        label: 'Bastrop County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.1105, lng: -97.3153 },
      },
      {
        label: 'Caldwell County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 29.8849, lng: -97.6699 },
      },
      {
        label: 'Burnet County, TX',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 30.7582, lng: -98.2284 },
      },
    ],
  },
  {
    marketKey: 'region-us-ny-new-york',
    marketName: 'New York, NY',
    marketShortName: 'New York',
    countryCode: 'US',
    stateCode: 'NY',
    center: { lat: 40.7128, lng: -74.006 },
    sourceBoundaries: [
      {
        label: 'New York County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.7831, lng: -73.9712 },
      },
      {
        label: 'Kings County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.6782, lng: -73.9442 },
      },
      {
        label: 'Queens County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.7282, lng: -73.7949 },
      },
      {
        label: 'Bronx County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.8448, lng: -73.8648 },
      },
      {
        label: 'Richmond County, NY',
        entityType: 'CountrySecondarySubdivision',
        anchor: { lat: 40.5795, lng: -74.1502 },
      },
    ],
  },
];

const TOMTOM_SOURCE_PROVIDER = 'tomtom';
const DEFAULT_TOMTOM_REVERSE_GEOCODE_BASE_URL =
  'https://api.tomtom.com/search/2/reverseGeocode';
const DEFAULT_TOMTOM_ADDITIONAL_DATA_URL =
  'https://api.tomtom.com/search/2/additionalData.json';
const TOMTOM_LANGUAGE = 'en-US';
const TOMTOM_TIMEOUT_MS = 10000;

const US_STATE_CODE_BY_NAME = new Map<string, string>([
  ['ALABAMA', 'AL'],
  ['ALASKA', 'AK'],
  ['ARIZONA', 'AZ'],
  ['ARKANSAS', 'AR'],
  ['CALIFORNIA', 'CA'],
  ['COLORADO', 'CO'],
  ['CONNECTICUT', 'CT'],
  ['DELAWARE', 'DE'],
  ['DISTRICT OF COLUMBIA', 'DC'],
  ['FLORIDA', 'FL'],
  ['GEORGIA', 'GA'],
  ['HAWAII', 'HI'],
  ['IDAHO', 'ID'],
  ['ILLINOIS', 'IL'],
  ['INDIANA', 'IN'],
  ['IOWA', 'IA'],
  ['KANSAS', 'KS'],
  ['KENTUCKY', 'KY'],
  ['LOUISIANA', 'LA'],
  ['MAINE', 'ME'],
  ['MARYLAND', 'MD'],
  ['MASSACHUSETTS', 'MA'],
  ['MICHIGAN', 'MI'],
  ['MINNESOTA', 'MN'],
  ['MISSISSIPPI', 'MS'],
  ['MISSOURI', 'MO'],
  ['MONTANA', 'MT'],
  ['NEBRASKA', 'NE'],
  ['NEVADA', 'NV'],
  ['NEW HAMPSHIRE', 'NH'],
  ['NEW JERSEY', 'NJ'],
  ['NEW MEXICO', 'NM'],
  ['NEW YORK', 'NY'],
  ['NORTH CAROLINA', 'NC'],
  ['NORTH DAKOTA', 'ND'],
  ['OHIO', 'OH'],
  ['OKLAHOMA', 'OK'],
  ['OREGON', 'OR'],
  ['PENNSYLVANIA', 'PA'],
  ['RHODE ISLAND', 'RI'],
  ['SOUTH CAROLINA', 'SC'],
  ['SOUTH DAKOTA', 'SD'],
  ['TENNESSEE', 'TN'],
  ['TEXAS', 'TX'],
  ['UTAH', 'UT'],
  ['VERMONT', 'VT'],
  ['VIRGINIA', 'VA'],
  ['WASHINGTON', 'WA'],
  ['WEST VIRGINIA', 'WV'],
  ['WISCONSIN', 'WI'],
  ['WYOMING', 'WY'],
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function seedRestaurantAttributes(prisma: PrismaClient): Promise<void> {
  const seeds = RESTAURANT_ATTRIBUTE_SEEDS.map((seed) => ({
    canonicalName: normalize(seed.canonicalName),
    aliases: seed.aliases.map(normalize),
  }))
    .map((seed) => ({
      canonicalName: seed.canonicalName,
      aliases: Array.from(
        new Set([seed.canonicalName, ...seed.aliases]),
      ).filter((alias) => alias.length > 0),
    }))
    .filter((seed) => seed.canonicalName.length > 0);

  console.log(`Seeding ${seeds.length} restaurant attributes...`);

  for (const seed of seeds) {
    const existing = await prisma.entity.findFirst({
      where: {
        name: seed.canonicalName,
        type: EntityType.restaurant_attribute,
      },
      select: { entityId: true },
    });

    if (existing) {
      await prisma.entity.update({
        where: { entityId: existing.entityId },
        data: {
          aliases: seed.aliases,
        },
        select: { entityId: true },
      });
      continue;
    }

    await prisma.entity.create({
      data: {
        name: seed.canonicalName,
        type: EntityType.restaurant_attribute,
        aliases: seed.aliases,
      },
      select: { entityId: true },
    });
  }

  console.log('✅ Restaurant attributes seeded');
}

function resolveTomTomApiKey(): string {
  const appEnv = (process.env.APP_ENV || process.env.CRAVE_ENV || 'dev')
    .trim()
    .toLowerCase();
  const scopedEnvName =
    appEnv === 'prod' || appEnv === 'production'
      ? 'TOMTOM_API_KEY_PROD'
      : 'TOMTOM_API_KEY_DEV';
  const apiKey =
    process.env.TOMTOM_API_KEY?.trim() ||
    process.env[scopedEnvName]?.trim() ||
    '';
  if (!apiKey) {
    throw new Error(
      'TOMTOM_API_KEY is required to seed regional market polygons',
    );
  }
  return apiKey;
}

function resolveTomTomTimeoutMs(): number {
  const parsed = Number(process.env.TOMTOM_TIMEOUT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : TOMTOM_TIMEOUT_MS;
}

function buildTomTomUrl(baseUrl: string, path?: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return path ? `${normalizedBase}/${path.replace(/^\//, '')}` : normalizedBase;
}

async function fetchTomTomJson<T>(
  url: string,
  params: Record<string, string | number>,
  requestId: string,
): Promise<T> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTomTomTimeoutMs(),
  );
  try {
    const response = await fetch(`${url}?${searchParams.toString()}`, {
      headers: {
        'Tracking-ID': requestId,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `TomTom request failed (${response.status}) for ${url}: ${body.slice(
          0,
          300,
        )}`,
      );
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function parseLatLng(value?: string): Coordinate | null {
  if (!value) {
    return null;
  }
  const [lat, lng] = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  return { lat, lng };
}

function parseBoundingBox(
  value?: TomTomReverseGeocodeAddress['boundingBox'],
): { northEast: Coordinate | null; southWest: Coordinate | null } | null {
  if (!value) {
    return null;
  }
  return {
    northEast: parseLatLng(value.northEast),
    southWest: parseLatLng(value.southWest),
  };
}

function normalizeCountryCode(value?: string): string {
  return value?.trim().toUpperCase() || 'US';
}

function normalizeStateCode(value?: string): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (/^[A-Za-z]{2}$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return US_STATE_CODE_BY_NAME.get(normalized.toUpperCase()) ?? normalized;
}

function resolveTomTomBoundaryName(
  address: TomTomReverseGeocodeAddress | null,
  source: RegionSourceBoundarySeed,
): string {
  const name =
    address?.countrySecondarySubdivision?.trim() ||
    address?.municipality?.trim() ||
    address?.municipalitySubdivision?.trim() ||
    address?.postalName?.trim() ||
    source.label;
  return name;
}

async function fetchTomTomBoundaryCandidate(
  source: RegionSourceBoundarySeed,
  requestId: string,
): Promise<TomTomBoundaryCandidate> {
  const apiKey = resolveTomTomApiKey();
  const reverseBaseUrl =
    process.env.TOMTOM_REVERSE_GEOCODE_BASE_URL ||
    DEFAULT_TOMTOM_REVERSE_GEOCODE_BASE_URL;
  const reverseUrl = buildTomTomUrl(
    reverseBaseUrl,
    `${source.anchor.lat},${source.anchor.lng}.json`,
  );
  const params: Record<string, string> = {
    key: apiKey,
    entityType: source.entityType,
    language: TOMTOM_LANGUAGE,
  };
  if (process.env.TOMTOM_API_VERSION?.trim()) {
    params.apiVersion = process.env.TOMTOM_API_VERSION.trim();
  }

  const response = await fetchTomTomJson<TomTomReverseGeocodeResponse>(
    reverseUrl,
    params,
    requestId,
  );
  const matches = Array.isArray(response.addresses) ? response.addresses : [];
  const match = matches.find(
    (entry) =>
      entry.entityType === source.entityType &&
      typeof entry.dataSources?.geometry?.id === 'string',
  );
  if (!match) {
    throw new Error(
      `TomTom did not return ${source.entityType} geometry for ${source.label}`,
    );
  }

  const address = match.address ?? null;
  const countryCode = normalizeCountryCode(address?.countryCode);
  if (countryCode !== 'US') {
    throw new Error(
      `TomTom boundary ${source.label} resolved outside US (${countryCode})`,
    );
  }

  const sourceBoundaryId = match.dataSources?.geometry?.id?.trim();
  if (!sourceBoundaryId) {
    throw new Error(`TomTom boundary ${source.label} has no geometry id`);
  }

  const name = resolveTomTomBoundaryName(address, source);
  return {
    sourceProvider: TOMTOM_SOURCE_PROVIDER,
    sourceBoundaryId,
    sourceBoundaryType: source.entityType,
    providerType: 'geometry',
    label: source.label,
    name,
    shortName: address?.countrySecondarySubdivision?.trim() || name,
    countryCode,
    stateCode: normalizeStateCode(address?.countrySubdivision),
    position: parseLatLng(match.position),
    boundingBox: parseBoundingBox(address?.boundingBox),
    rawAddress: address,
  };
}

async function fetchTomTomBoundaryGeometry(
  sourceBoundaryId: string,
  requestId: string,
): Promise<GeoJsonFeatureCollection> {
  const apiKey = resolveTomTomApiKey();
  const additionalDataUrl =
    process.env.TOMTOM_ADDITIONAL_DATA_URL ||
    DEFAULT_TOMTOM_ADDITIONAL_DATA_URL;
  const params: Record<string, string | number> = {
    key: apiKey,
    geometries: sourceBoundaryId,
    language: TOMTOM_LANGUAGE,
  };
  if (process.env.TOMTOM_GEOMETRY_ZOOM?.trim()) {
    params.geometriesZoom = Number(process.env.TOMTOM_GEOMETRY_ZOOM);
  }
  if (process.env.TOMTOM_API_VERSION?.trim()) {
    params.apiVersion = process.env.TOMTOM_API_VERSION.trim();
  }

  const response = await fetchTomTomJson<TomTomAdditionalDataResponse>(
    additionalDataUrl,
    params,
    requestId,
  );
  const items = Array.isArray(response.additionalData)
    ? response.additionalData
    : [];
  const item = items.find((entry) => {
    const id = entry.providerID ?? entry.providerId;
    return id === sourceBoundaryId;
  });
  if (item?.error) {
    throw new Error(
      `TomTom geometry ${sourceBoundaryId} returned error: ${item.error}`,
    );
  }

  const geometryData = item?.geometryData ?? null;
  const polygonFeatures =
    geometryData?.type === 'FeatureCollection' &&
    Array.isArray(geometryData.features)
      ? geometryData.features.filter((feature) => {
          const geometryType = feature.geometry?.type;
          return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
        })
      : [];

  if (!polygonFeatures.length) {
    throw new Error(`TomTom geometry ${sourceBoundaryId} has no polygon data`);
  }

  return {
    type: 'FeatureCollection',
    features: polygonFeatures,
  };
}

async function upsertTomTomBoundaryFeature(
  prisma: PrismaClient,
  boundary: TomTomBoundaryCandidate,
  lookupPoint: Coordinate,
  geometry: GeoJsonFeatureCollection,
): Promise<StoredBoundary> {
  const metadata = {
    source: TOMTOM_SOURCE_PROVIDER,
    rawAddress: boundary.rawAddress,
    lookupPoint,
    reverseGeocodePosition: boundary.position,
    reverseGeocodeBoundingBox: boundary.boundingBox,
    seedLabel: boundary.label,
  };

  const rows = await prisma.$queryRaw<StoredBoundary[]>(Prisma.sql`
    WITH raw_input AS (
      SELECT
        ${JSON.stringify(geometry)}::jsonb AS geojson,
        ${JSON.stringify(metadata)}::jsonb AS metadata,
        ST_SetSRID(ST_MakePoint(${lookupPoint.lng}, ${
          lookupPoint.lat
        }), 4326) AS lookup_point
    ),
    source_geometries AS (
      SELECT
        ST_MakeValid(
          ST_SetSRID(
            ST_GeomFromGeoJSON((feature->'geometry')::text),
            4326
          )
        ) AS geometry
      FROM raw_input,
        jsonb_array_elements(raw_input.geojson->'features') AS feature
      WHERE feature ? 'geometry'
    ),
    collected AS (
      SELECT ST_Collect(geometry) AS geometry
      FROM source_geometries
    ),
    merged AS (
      SELECT
        ST_Multi(
          ST_CollectionExtract(
            ST_MakeValid(ST_UnaryUnion(collected.geometry)),
            3
          )
        ) AS geometry,
        raw_input.metadata,
        raw_input.lookup_point
      FROM raw_input
      CROSS JOIN collected
    ),
    upserted AS (
      INSERT INTO geo_boundary_features (
        source_provider,
        source_boundary_id,
        source_boundary_type,
        provider_type,
        name,
        short_name,
        country_code,
        state_code,
        center_latitude,
        center_longitude,
        bbox_ne_latitude,
        bbox_ne_longitude,
        bbox_sw_latitude,
        bbox_sw_longitude,
        geometry,
        metadata,
        fetched_at,
        updated_at
      )
      SELECT
        ${boundary.sourceProvider},
        ${boundary.sourceBoundaryId},
        ${boundary.sourceBoundaryType},
        ${boundary.providerType},
        ${boundary.name},
        ${boundary.shortName},
        ${boundary.countryCode},
        ${boundary.stateCode},
        ST_Y(ST_Centroid(geometry))::numeric(11, 8),
        ST_X(ST_Centroid(geometry))::numeric(11, 8),
        ST_YMax(Box2D(geometry))::numeric(11, 8),
        ST_XMax(Box2D(geometry))::numeric(11, 8),
        ST_YMin(Box2D(geometry))::numeric(11, 8),
        ST_XMin(Box2D(geometry))::numeric(11, 8),
        geometry,
        metadata,
        now(),
        now()
      FROM merged
      WHERE geometry IS NOT NULL
        AND NOT ST_IsEmpty(geometry)
        AND ST_IsValid(geometry)
        AND ST_Covers(geometry, lookup_point)
      ON CONFLICT (source_provider, source_boundary_id, source_boundary_type) DO UPDATE SET
        provider_type = EXCLUDED.provider_type,
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        country_code = EXCLUDED.country_code,
        state_code = EXCLUDED.state_code,
        center_latitude = EXCLUDED.center_latitude,
        center_longitude = EXCLUDED.center_longitude,
        bbox_ne_latitude = EXCLUDED.bbox_ne_latitude,
        bbox_ne_longitude = EXCLUDED.bbox_ne_longitude,
        bbox_sw_latitude = EXCLUDED.bbox_sw_latitude,
        bbox_sw_longitude = EXCLUDED.bbox_sw_longitude,
        geometry = EXCLUDED.geometry,
        metadata = EXCLUDED.metadata,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = now()
      RETURNING
        source_provider AS "sourceProvider",
        source_boundary_id AS "sourceBoundaryId",
        source_boundary_type AS "sourceBoundaryType",
        provider_type AS "providerType",
        ${boundary.label} AS "label",
        name,
        short_name AS "shortName",
        country_code AS "countryCode",
        state_code AS "stateCode"
    )
    SELECT * FROM upserted
  `);

  const record = rows[0] ?? null;
  if (!record) {
    throw new Error(
      `TomTom geometry for ${boundary.label} did not cover its seed point`,
    );
  }
  return record;
}

async function upsertRegionMarketFromBoundaries(
  prisma: PrismaClient,
  seed: RegionMarketSeed,
  storedBoundaries: StoredBoundary[],
): Promise<RegionUpsertRow> {
  const sourceBoundaries = storedBoundaries.map((boundary) => ({
    sourceProvider: boundary.sourceProvider,
    sourceBoundaryId: boundary.sourceBoundaryId,
    sourceBoundaryType: boundary.sourceBoundaryType,
    providerType: boundary.providerType,
    label: boundary.label,
    name: boundary.name,
    shortName: boundary.shortName,
    countryCode: boundary.countryCode,
    stateCode: boundary.stateCode,
  }));
  const metadata = {
    source: 'tomtom_boundary_union',
    boundaryKind: 'regional_collection_boundary',
    marketKey: normalize(seed.marketKey),
    sourceProvider: TOMTOM_SOURCE_PROVIDER,
    sourceBoundaries,
  };

  const rows = await prisma.$queryRaw<RegionUpsertRow[]>(Prisma.sql`
    WITH desired AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(sourceBoundaries)}::jsonb)
        AS boundary(
          "sourceProvider" text,
          "sourceBoundaryId" text,
          "sourceBoundaryType" text,
          "providerType" text,
          label text,
          name text,
          "shortName" text,
          "countryCode" text,
          "stateCode" text
        )
    ),
    source_geometries AS (
      SELECT
        features.geometry
      FROM desired
      JOIN geo_boundary_features features
        ON features.source_provider = desired."sourceProvider"
        AND features.source_boundary_id = desired."sourceBoundaryId"
        AND features.source_boundary_type = desired."sourceBoundaryType"
      WHERE features.geometry IS NOT NULL
    ),
    merged AS (
      SELECT
        COUNT(*)::int AS boundary_count,
        ST_Multi(
          ST_CollectionExtract(
            ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry))),
            3
          )
        ) AS geometry
      FROM source_geometries
    ),
    upserted AS (
      INSERT INTO core_markets (
        market_key,
        market_name,
        market_short_name,
        market_type,
        country_code,
        state_code,
        source_boundary_provider,
        source_boundary_id,
        source_boundary_type,
        source_community,
        is_collectable,
        scheduler_enabled,
        is_active,
        center_latitude,
        center_longitude,
        bbox_ne_latitude,
        bbox_ne_longitude,
        bbox_sw_latitude,
        bbox_sw_longitude,
        geometry,
        metadata,
        updated_at
      )
      SELECT
        ${normalize(seed.marketKey)},
        ${seed.marketName},
        ${seed.marketShortName},
        ${MarketType.regional}::market_type,
        ${seed.countryCode},
        ${seed.stateCode},
        NULL,
        NULL,
        NULL,
        NULL,
        true,
        true,
        true,
        ${seed.center.lat},
        ${seed.center.lng},
        ST_YMax(Box2D(geometry))::numeric(11, 8),
        ST_XMax(Box2D(geometry))::numeric(11, 8),
        ST_YMin(Box2D(geometry))::numeric(11, 8),
        ST_XMin(Box2D(geometry))::numeric(11, 8),
        geometry,
        ${JSON.stringify(metadata)}::jsonb,
        now()
      FROM merged
      WHERE boundary_count = ${storedBoundaries.length}
        AND geometry IS NOT NULL
        AND NOT ST_IsEmpty(geometry)
        AND ST_IsValid(geometry)
      ON CONFLICT (market_key) DO UPDATE SET
        market_name = EXCLUDED.market_name,
        market_short_name = EXCLUDED.market_short_name,
        market_type = EXCLUDED.market_type,
        country_code = EXCLUDED.country_code,
        state_code = EXCLUDED.state_code,
        source_boundary_provider = NULL,
        source_boundary_id = NULL,
        source_boundary_type = NULL,
        is_collectable = true,
        scheduler_enabled = true,
        is_active = true,
        center_latitude = EXCLUDED.center_latitude,
        center_longitude = EXCLUDED.center_longitude,
        bbox_ne_latitude = EXCLUDED.bbox_ne_latitude,
        bbox_ne_longitude = EXCLUDED.bbox_ne_longitude,
        bbox_sw_latitude = EXCLUDED.bbox_sw_latitude,
        bbox_sw_longitude = EXCLUDED.bbox_sw_longitude,
        geometry = EXCLUDED.geometry,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING
        market_key AS "marketKey",
        ${storedBoundaries.length}::int AS "boundaryCount",
        ROUND((ST_Area(geometry::geography) / 1000000.0)::numeric, 2) AS "areaKm2"
    )
    SELECT * FROM upserted
  `);

  const row = rows[0] ?? null;
  if (!row) {
    throw new Error(
      `Unable to seed ${seed.marketKey}; expected ${storedBoundaries.length} TomTom source boundaries`,
    );
  }
  return row;
}

async function seedRegionMarkets(prisma: PrismaClient): Promise<void> {
  console.log(`Seeding ${REGION_MARKET_SEEDS.length} regional markets...`);

  for (const seed of REGION_MARKET_SEEDS) {
    const requestId = randomUUID();
    const storedBoundaries: StoredBoundary[] = [];
    for (const source of seed.sourceBoundaries) {
      const candidate = await fetchTomTomBoundaryCandidate(source, requestId);
      const geometry = await fetchTomTomBoundaryGeometry(
        candidate.sourceBoundaryId,
        requestId,
      );
      const stored = await upsertTomTomBoundaryFeature(
        prisma,
        candidate,
        source.anchor,
        geometry,
      );
      storedBoundaries.push(stored);
    }

    const region = await upsertRegionMarketFromBoundaries(
      prisma,
      seed,
      storedBoundaries,
    );
    console.log(
      `  ${region.marketKey}: ${String(
        region.boundaryCount,
      )} TomTom boundaries, ${String(region.areaKm2)} km²`,
    );
  }

  console.log('✅ Regional markets seeded');
}

async function seedCollectionCommunities(prisma: PrismaClient): Promise<void> {
  console.log(
    `Seeding ${COLLECTION_COMMUNITY_SEEDS.length} collection communities...`,
  );

  for (const seed of COLLECTION_COMMUNITY_SEEDS) {
    const communityName = normalize(seed.communityName);
    const locationName = seed.locationName.trim();
    const marketKey = normalize(seed.marketKey);
    const linkedMarket = await prisma.market.findFirst({
      where: {
        marketKey,
        isActive: true,
      },
      select: {
        marketKey: true,
      },
    });

    if (!linkedMarket?.marketKey) {
      throw new Error(
        `Collection community "${communityName}" references missing active market "${marketKey}"`,
      );
    }

    await prisma.collectionCommunity.upsert({
      where: {
        communityName,
      },
      update: {
        locationName,
        marketKey,
        isActive: true,
      },
      create: {
        communityName,
        locationName,
        marketKey,
        isActive: true,
      },
    });

    await prisma.market.update({
      where: { marketKey },
      data: {
        sourceCommunity: communityName,
        isCollectable: true,
        schedulerEnabled: true,
        isActive: true,
      },
      select: { marketKey: true },
    });
  }

  console.log('✅ Collection communities seeded');
}

export async function runSeed(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedRestaurantAttributes(prisma);
    await seedRegionMarkets(prisma);
    await seedCollectionCommunities(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  await runSeed();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
}
