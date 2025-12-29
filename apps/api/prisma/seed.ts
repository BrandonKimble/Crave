import { PrismaClient, EntityType } from '@prisma/client';

type RestaurantAttributeSeed = {
  canonicalName: string;
  aliases: string[];
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
    aliases: ['acai', 'acai bar', 'acai shop', 'acai bowl shop'],
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
    aliases: ['bagel', 'bagel shop', 'bagel store', 'bagels'],
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
    aliases: [
      'bar and grill',
      'bar & grill',
      'bar n grill',
      'bar-n-grill',
      'bar',
      'grill',
    ],
  },
  {
    canonicalName: 'barbecue',
    aliases: [
      'barbecue',
      'barbecue restaurant',
      'bbq',
      'bbq restaurant',
      'barbeque',
    ],
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
    aliases: [
      'breakfast restaurant',
      'breakfast spot',
      'breakfast place',
      'breakfast',
    ],
  },
  {
    canonicalName: 'brunch restaurant',
    aliases: ['brunch restaurant', 'brunch spot', 'brunch place', 'brunch'],
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
    aliases: ['candy store', 'candy shop', 'candy'],
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
    aliases: [
      'chocolate factory',
      'chocolate maker',
      'chocolate manufacturer',
      'chocolate',
    ],
  },
  {
    canonicalName: 'chocolate shop',
    aliases: [
      'chocolate shop',
      'chocolate store',
      'chocolatier',
      'chocolate boutique',
      'chocolate',
    ],
  },
  {
    canonicalName: 'coffee shop',
    aliases: ['coffee shop', 'coffee house', 'coffeehouse', 'coffee'],
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
    aliases: ['dessert restaurant', 'dessert'],
  },
  {
    canonicalName: 'dessert shop',
    aliases: ['dessert shop', 'dessert bar', 'sweet shop', 'dessert'],
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
    aliases: ['donut shop', 'doughnut shop', 'donut store', 'donuts', 'donut'],
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
    aliases: [
      'burger',
      'burgers',
      'burger joint',
      'burger restaurant',
      'hamburger',
      'hamburgers',
      'hamburger restaurant',
    ],
  },
  {
    canonicalName: 'ice cream shop',
    aliases: [
      'ice cream shop',
      'ice cream parlor',
      'ice cream parlour',
      'gelato shop',
      'ice cream',
      'gelato',
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
    aliases: [
      'juice shop',
      'juice bar',
      'smoothie shop',
      'smoothie bar',
      'juices',
      'juice',
      'smoothies',
      'smoothie',
    ],
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
    aliases: ['pizza', 'pizza place', 'pizza shop', 'pizza joint', 'pizzeria'],
  },
  {
    canonicalName: 'pub',
    aliases: ['pub', 'public house', 'gastropub', 'alehouse'],
  },
  {
    canonicalName: 'ramen',
    aliases: ['ramen', 'ramen shop', 'ramen house'],
  },
  {
    canonicalName: 'sandwich shop',
    aliases: [
      'sandwich shop',
      'sandwiches',
      'sandwich',
      'sub shop',
      'subs',
      'sub',
    ],
  },
  {
    canonicalName: 'seafood',
    aliases: [
      'seafood',
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
    aliases: ['steakhouse', 'steak house', 'steakhouse grill', 'steak'],
  },
  {
    canonicalName: 'sushi',
    aliases: ['sushi', 'sushi bar', 'sushi house'],
  },
  {
    canonicalName: 'tea house',
    aliases: ['tea house', 'teahouse', 'tea room', 'tea salon', 'tea'],
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
    aliases: ['wine bar', 'wine-bar', 'wine lounge', 'wine'],
  },
];

const RESTAURANT_ATTRIBUTE_SEEDS: RestaurantAttributeSeed[] = [
  ...BASE_RESTAURANT_ATTRIBUTE_SEEDS,
  ...GOOGLE_PLACE_TYPE_ATTRIBUTE_SEEDS,
];

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
    await prisma.entity.upsert({
      where: {
        name_type_locationKey: {
          name: seed.canonicalName,
          type: EntityType.restaurant_attribute,
          locationKey: 'global',
        },
      },
      update: {
        aliases: seed.aliases,
      },
      create: {
        name: seed.canonicalName,
        type: EntityType.restaurant_attribute,
        locationKey: 'global',
        aliases: seed.aliases,
      },
      select: { entityId: true },
    });
  }

  console.log('✅ Restaurant attributes seeded');
}

export async function runSeed(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedRestaurantAttributes(prisma);
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
