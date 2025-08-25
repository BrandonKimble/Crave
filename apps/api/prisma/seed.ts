import {
  PrismaClient,
  EntityType,
  ActivityLevel,
  MentionSource,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed data creation...');

  // 1. Clear existing data in proper order (respecting foreign keys)
  await clearDatabase();

  // 2. Create restaurant entities with Austin food scene data
  const restaurants = await createRestaurantEntities();

  // 3. Create dish/category entities with realistic food items
  const dishes = await createDishEntities();

  // 4. Create attribute entities (both dish and restaurant scoped)
  const attributes = await createAttributeEntities();

  // 5. Establish connections with quality scores and mentions
  await createConnections(restaurants, dishes, attributes);

  // 6. Validate data integrity and relationships
  await validateDataIntegrity();

  console.log('✅ Seed data creation completed successfully!');
}

async function clearDatabase() {
  console.log('🧹 Clearing existing data...');

  // Delete in order respecting foreign keys
  await prisma.mention.deleteMany({});
  await prisma.connection.deleteMany({});
  await prisma.entity.deleteMany({});

  console.log('✅ Database cleared');
}

async function createRestaurantEntities() {
  console.log('🍽️ Creating restaurant entities...');

  // Austin restaurant data
  const restaurantData = [
    {
      name: 'Franklin Barbecue',
      aliases: ['Franklin BBQ', "Franklin's BBQ", "Franklin's"],
      latitude: 30.2715,
      longitude: -97.7341,
      address: '900 E 11th St, Austin, TX 78702',
      googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      restaurantQualityScore: 9.2,
    },
    {
      name: 'Ramen Tatsu-Ya',
      aliases: ['Tatsu-Ya', 'TatsuyaRamen'],
      latitude: 30.2672,
      longitude: -97.7431,
      address: '1234 S Lamar Blvd, Austin, TX 78704',
      googlePlaceId: 'ChIJrTLr-GyuEmsRBfy61i59si0',
      restaurantQualityScore: 8.7,
    },
    {
      name: 'La Barbecue',
      aliases: ['La BBQ', 'La Barbacue'],
      latitude: 30.2505,
      longitude: -97.7289,
      address: '2401 E Cesar Chavez St, Austin, TX 78702',
      googlePlaceId: 'ChIJ5eZyGnOuEmsRqhIhAPj-0nE',
      restaurantQualityScore: 8.5,
    },
    {
      name: "Torchy's Tacos",
      aliases: ['Torchys', "Torchy's", 'Torchys Tacos'],
      latitude: 30.2672,
      longitude: -97.7431,
      address: '1311 S 1st St, Austin, TX 78704',
      googlePlaceId: 'ChIJrTLr-GyuEmsRBfy61i59si1',
      restaurantQualityScore: 8.1,
    },
    {
      name: 'Uchi',
      aliases: ['Uchi Austin', 'Uchi Restaurant'],
      latitude: 30.2515,
      longitude: -97.7594,
      address: '801 S Lamar Blvd, Austin, TX 78704',
      googlePlaceId: 'ChIJ5eZyGnOuEmsRqhIhAPj-0n2',
      restaurantQualityScore: 9.1,
    },
  ];

  const restaurants: any[] = [];

  for (const data of restaurantData) {
    const restaurant = await prisma.entity.create({
      data: {
        name: data.name,
        type: EntityType.restaurant,
        aliases: data.aliases,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        googlePlaceId: data.googlePlaceId,
        restaurantQualityScore: data.restaurantQualityScore,
        restaurantMetadata: {
          cuisine_type:
            data.name.includes('Barbecue') || data.name.includes('BBQ')
              ? 'BBQ'
              : data.name.includes('Ramen')
              ? 'Japanese'
              : data.name.includes('Tacos')
              ? 'Mexican'
              : data.name.includes('Uchi')
              ? 'Japanese'
              : 'American',
        },
      },
    });
    restaurants.push(restaurant);
  }

  console.log(`✅ Created ${restaurants.length} restaurant entities`);
  return restaurants;
}

async function createDishEntities() {
  console.log('🍜 Creating dish/category entities...');

  const dishData = [
    // Specific dishes
    {
      name: 'Brisket',
      aliases: ['Texas Brisket', 'Smoked Brisket', 'BBQ Brisket'],
    },
    {
      name: 'Pork Ribs',
      aliases: ['Baby Back Ribs', 'BBQ Ribs', 'Smoked Ribs'],
    },
    {
      name: 'Tonkotsu Ramen',
      aliases: ['Tonkotsu', 'Pork Bone Ramen', 'Rich Ramen'],
    },
    { name: 'Spicy Miso Ramen', aliases: ['Miso Ramen', 'Spicy Ramen'] },
    {
      name: 'Trailer Park Taco',
      aliases: ['Trailer Park', 'Fried Chicken Taco'],
    },
    { name: 'Democratic Taco', aliases: ['Democratic', 'BBQ Taco'] },
    { name: 'Hama Chili', aliases: ['Hamachi', 'Yellowtail Sashimi'] },
    { name: 'Machi Cure', aliases: ['Machi', 'Cured Fish'] },

    // Categories
    { name: 'BBQ', aliases: ['Barbecue', 'Barbeque', 'Smoked Meats'] },
    { name: 'Ramen', aliases: ['Japanese Noodles', 'Noodle Soup'] },
    { name: 'Tacos', aliases: ['Mexican Tacos', 'Austin Tacos'] },
    { name: 'Sushi', aliases: ['Japanese Sushi', 'Raw Fish', 'Sashimi'] },
    { name: 'Japanese', aliases: ['Japanese Cuisine', 'Japanese Food'] },
    { name: 'Mexican', aliases: ['Mexican Cuisine', 'Tex-Mex'] },
  ];

  const dishes: any[] = [];

  for (const data of dishData) {
    const dish = await prisma.entity.create({
      data: {
        name: data.name,
        type: EntityType.dish_or_category,
        aliases: data.aliases,
      },
    });
    dishes.push(dish);
  }

  console.log(`✅ Created ${dishes.length} dish/category entities`);
  return dishes;
}

async function createAttributeEntities() {
  console.log('🏷️ Creating attribute entities...');

  const attributeData = [
    // Dish attributes
    {
      name: 'Spicy',
      type: EntityType.dish_attribute,
      aliases: ['Hot', 'Fiery', 'Spiced'],
    },
    {
      name: 'Smoky',
      type: EntityType.dish_attribute,
      aliases: ['Smoked', 'Wood-fired'],
    },
    {
      name: 'Tender',
      type: EntityType.dish_attribute,
      aliases: ['Soft', 'Juicy', 'Moist'],
    },
    {
      name: 'Crispy',
      type: EntityType.dish_attribute,
      aliases: ['Crunchy', 'Crisp'],
    },
    {
      name: 'Rich',
      type: EntityType.dish_attribute,
      aliases: ['Heavy', 'Indulgent'],
    },
    {
      name: 'Fresh',
      type: EntityType.dish_attribute,
      aliases: ['Light', 'Clean-tasting'],
    },
    {
      name: 'Vegan',
      type: EntityType.dish_attribute,
      aliases: ['Plant-based', 'Dairy-free'],
    },
    {
      name: 'Gluten-free',
      type: EntityType.dish_attribute,
      aliases: ['GF', 'No gluten'],
    },

    // Restaurant attributes
    {
      name: 'Casual',
      type: EntityType.restaurant_attribute,
      aliases: ['Relaxed', 'Informal'],
    },
    {
      name: 'Long Wait',
      type: EntityType.restaurant_attribute,
      aliases: ['Long Line', 'Popular Wait'],
    },
    {
      name: 'Food Truck',
      type: EntityType.restaurant_attribute,
      aliases: ['Mobile', 'Truck Food'],
    },
    {
      name: 'Outdoor Seating',
      type: EntityType.restaurant_attribute,
      aliases: ['Patio', 'Outside'],
    },
    {
      name: 'Family-friendly',
      type: EntityType.restaurant_attribute,
      aliases: ['Kid-friendly', 'Family'],
    },
    {
      name: 'Date Night',
      type: EntityType.restaurant_attribute,
      aliases: ['Romantic', 'Upscale'],
    },
    {
      name: 'Local Favorite',
      type: EntityType.restaurant_attribute,
      aliases: ['Austin Classic', 'Institution'],
    },
  ];

  const attributes: any[] = [];

  for (const data of attributeData) {
    const attribute = await prisma.entity.create({
      data: {
        name: data.name,
        type: data.type,
        aliases: data.aliases,
      },
    });
    attributes.push(attribute);
  }

  console.log(`✅ Created ${attributes.length} attribute entities`);
  return attributes;
}

async function createConnections(
  restaurants: any[],
  dishes: any[],
  attributes: any[],
) {
  console.log('🔗 Creating connections with mentions...');

  // Helper functions
  const findEntity = (entities: any[], name: string): any =>
    entities.find((e: any) => e.name === name);

  const getDishAttributes = (attributeNames: string[]): string[] =>
    attributeNames
      .map((name) => findEntity(attributes, name)?.entityId)
      .filter((id): id is string => Boolean(id));

  const getCategories = (categoryNames: string[]): string[] =>
    categoryNames
      .map((name) => findEntity(dishes, name)?.entityId)
      .filter((id): id is string => Boolean(id));

  // Connection data with realistic Austin food scene relationships
  const connectionData = [
    // Franklin Barbecue connections
    {
      restaurant: 'Franklin Barbecue',
      dish: 'Brisket',
      categories: ['BBQ'],
      dishAttributes: ['Smoky', 'Tender'],
      isMenuItem: true,
      mentionCount: 89,
      totalUpvotes: 1247,
      dishQualityScore: 9.8,
      activityLevel: ActivityLevel.trending,
      sampleMentions: [
        {
          sourceId: 'franklin_brisket_1',
          sourceUrl:
            'https://reddit.com/r/austinfood/comments/franklin_brisket/',
          subreddit: 'austinfood',
          contentExcerpt:
            "Franklin's brisket is absolutely perfect - smoky bark with the most tender interior",
          author: 'bbq_lover_atx',
          upvotes: 156,
        },
      ],
    },
    {
      restaurant: 'Franklin Barbecue',
      dish: 'Pork Ribs',
      categories: ['BBQ'],
      dishAttributes: ['Smoky', 'Tender'],
      isMenuItem: true,
      mentionCount: 34,
      totalUpvotes: 421,
      dishQualityScore: 9.1,
      activityLevel: ActivityLevel.active,
      sampleMentions: [],
    },

    // Ramen Tatsu-Ya connections
    {
      restaurant: 'Ramen Tatsu-Ya',
      dish: 'Tonkotsu Ramen',
      categories: ['Ramen', 'Japanese'],
      dishAttributes: ['Rich', 'Tender'],
      isMenuItem: true,
      mentionCount: 67,
      totalUpvotes: 892,
      dishQualityScore: 8.9,
      activityLevel: ActivityLevel.trending,
      sampleMentions: [
        {
          sourceId: 'tatsuya_tonkotsu_1',
          sourceUrl: 'https://reddit.com/r/Austin/comments/tatsuya_best_ramen/',
          subreddit: 'Austin',
          contentExcerpt:
            "Tatsu-Ya's tonkotsu has the perfect rich broth and tender chashu",
          author: 'ramen_enthusiast',
          upvotes: 89,
        },
      ],
    },

    // Torchy's Tacos connections
    {
      restaurant: "Torchy's Tacos",
      dish: 'Trailer Park Taco',
      categories: ['Tacos', 'Mexican'],
      dishAttributes: ['Crispy', 'Spicy'],
      isMenuItem: true,
      mentionCount: 123,
      totalUpvotes: 1456,
      dishQualityScore: 8.4,
      activityLevel: ActivityLevel.trending,
      sampleMentions: [],
    },

    // Uchi connections
    {
      restaurant: 'Uchi',
      dish: 'Hama Chili',
      categories: ['Sushi', 'Japanese'],
      dishAttributes: ['Fresh', 'Spicy'],
      isMenuItem: true,
      mentionCount: 45,
      totalUpvotes: 623,
      dishQualityScore: 9.3,
      activityLevel: ActivityLevel.active,
      sampleMentions: [],
    },
  ];

  let connectionsCreated = 0;
  let mentionsCreated = 0;

  for (const data of connectionData) {
    const restaurant = findEntity(restaurants, data.restaurant);
    const dish = findEntity(dishes, data.dish);

    if (!restaurant || !dish) {
      console.warn(
        `Skipping connection: ${data.restaurant} -> ${data.dish} (entities not found)`,
      );
      continue;
    }

    const connection = await prisma.connection.create({
      data: {
        restaurantId: restaurant.entityId,
        dishOrCategoryId: dish.entityId,
        categories: getCategories(data.categories),
        dishAttributes: getDishAttributes(data.dishAttributes),
        isMenuItem: data.isMenuItem,
        mentionCount: data.mentionCount,
        totalUpvotes: data.totalUpvotes,
        dishQualityScore: data.dishQualityScore,
        activityLevel: data.activityLevel,
        lastMentionedAt: new Date(),
        topMentions: data.sampleMentions,
        recentMentionCount: Math.floor(data.mentionCount * 0.3),
      },
    });

    connectionsCreated++;

    // Create sample mentions for connections that have them
    for (const mentionData of data.sampleMentions) {
      await prisma.mention.create({
        data: {
          connectionId: connection.connectionId,
          sourceType: MentionSource.post,
          sourceId: mentionData.sourceId,
          sourceUrl: mentionData.sourceUrl,
          subreddit: mentionData.subreddit,
          contentExcerpt: mentionData.contentExcerpt,
          author: mentionData.author,
          upvotes: mentionData.upvotes,
          createdAt: new Date(
            Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
          ), // Random date within last 30 days
        },
      });
      mentionsCreated++;
    }
  }

  console.log(
    `✅ Created ${connectionsCreated} connections with ${mentionsCreated} mentions`,
  );
}

async function validateDataIntegrity() {
  console.log('🔍 Validating data integrity...');

  // Check for orphaned connections
  const orphanedConnections = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM connections c
    LEFT JOIN entities r ON c.restaurant_id = r.entity_id
    LEFT JOIN entities d ON c.dish_or_category_id = d.entity_id
    WHERE r.entity_id IS NULL OR d.entity_id IS NULL;
  `;

  // Validate entity type constraints
  const invalidRestaurantConnections = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM connections c
    JOIN entities r ON c.restaurant_id = r.entity_id
    WHERE r.type != 'restaurant';
  `;

  const invalidDishConnections = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM connections c
    JOIN entities d ON c.dish_or_category_id = d.entity_id
    WHERE d.type != 'dish_or_category';
  `;

  // Count final data
  const entityCounts = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count 
    FROM entities 
    GROUP BY type 
    ORDER BY type;
  `;

  const connectionCount = await prisma.connection.count();
  const mentionCount = await prisma.mention.count();

  console.log('\n📊 Data Summary:');
  console.log('Entity counts:', entityCounts);
  console.log(`Connections: ${connectionCount}`);
  console.log(`Mentions: ${mentionCount}`);

  // Check for validation issues
  const orphanCount = Number((orphanedConnections as any)[0]?.count || 0);
  const invalidRestaurantCount = Number(
    (invalidRestaurantConnections as any)[0]?.count || 0,
  );
  const invalidDishCount = Number(
    (invalidDishConnections as any)[0]?.count || 0,
  );

  if (orphanCount > 0 || invalidRestaurantCount > 0 || invalidDishCount > 0) {
    throw new Error(
      `Data integrity issues found: ${orphanCount} orphaned connections, ${invalidRestaurantCount} invalid restaurant connections, ${invalidDishCount} invalid dish connections`,
    );
  }

  console.log('✅ Data integrity validation passed');
}

main()
  .catch((e) => {
    console.error('❌ Seed script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
