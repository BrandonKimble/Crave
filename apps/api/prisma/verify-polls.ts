import { PrismaClient, EntityType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Verifying polls and entity links...');

    const polls = await prisma.poll.findMany({
        include: {
            topic: true,
            options: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: 10,
    });

    console.log(`Found ${polls.length} polls.`);

    for (const p of polls) {
        console.log(`\n--- Poll: ${p.topic.title} [${p.topic.topicType}] ---`);
        console.log(`Question: ${p.question}`);
        console.log(`Target Dish ID: ${p.topic.targetDishId}`);
        console.log(`Target Rest ID: ${p.topic.targetRestaurantId}`);

        // Check main topic link validity
        if (p.topic.targetDishId) {
            const dish = await prisma.entity.findUnique({ where: { entityId: p.topic.targetDishId } });
            console.log(` -> Linked Dish: ${dish?.name} (${dish?.type})`);
        }
        if (p.topic.targetRestaurantId) {
            const rest = await prisma.entity.findUnique({ where: { entityId: p.topic.targetRestaurantId } });
            console.log(` -> Linked Restaurant: ${rest?.name} (${rest?.type})`);
        }

        console.log(`Options (${p.options.length}):`);
        for (const o of p.options) {
            let linkedDetails = 'None';
            if (o.restaurantId) {
                const r = await prisma.entity.findUnique({ where: { entityId: o.restaurantId } });
                linkedDetails = `Rest: ${r?.name}`;
            } else if (o.foodId) {
                const f = await prisma.entity.findUnique({ where: { entityId: o.foodId } });
                linkedDetails = `Food: ${f?.name}`;
            }
            console.log(` - ${o.label} [${linkedDetails}]`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
