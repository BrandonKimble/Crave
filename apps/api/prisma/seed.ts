import { PrismaClient, EntityType } from '@prisma/client';

type RestaurantAttributeSeed = {
  canonicalName: string;
  aliases: string[];
};

const RESTAURANT_ATTRIBUTE_SEEDS: RestaurantAttributeSeed[] = [
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
    aliases: [
      'coffee',
      'coffee bar',
      'espresso',
      'espresso bar',
      'cafe',
      'café',
    ],
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
    aliases: ['vegetarian', 'vegetarian friendly', 'vegetarian options'],
  },
  {
    canonicalName: 'serves wine',
    aliases: ['wine'],
  },
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
        name_type: {
          name: seed.canonicalName,
          type: EntityType.restaurant_attribute,
        },
      },
      update: {
        aliases: seed.aliases,
      },
      create: {
        name: seed.canonicalName,
        type: EntityType.restaurant_attribute,
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
