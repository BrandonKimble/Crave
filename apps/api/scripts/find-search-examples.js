const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const recentFoods = await prisma.connection.findMany({
    orderBy: { lastMentionedAt: 'desc' },
    take: 5,
    include: {
      food: { select: { entityId: true, name: true } },
      restaurant: { select: { entityId: true, name: true } },
    },
  });

  const samples = recentFoods.map((conn) => ({
    foodEntityId: conn.food.entityId,
    foodName: conn.food.name,
    restaurantEntityId: conn.restaurant.entityId,
    restaurantName: conn.restaurant.name,
  }));

  console.log(JSON.stringify(samples, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
