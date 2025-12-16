import { PrismaClient, PollState, PollTopicType, PollTopicStatus, EntityType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding refined polls...');

    // Helper to find or create an Entity
    const ensureEntity = async (name: string, type: EntityType) => {
        const existing = await prisma.entity.findFirst({
            where: { name: { equals: name, mode: 'insensitive' }, type },
        });
        if (existing) return existing;

        return prisma.entity.create({
            data: {
                name,
                type,
                city: 'Austin',
                region: 'TX',
                country: 'US',
                address: type === EntityType.restaurant ? '123 Seed St' : undefined,
            },
        });
    };

    // --- Scenario 1: Best Dish Polls ---
    // Topic: Best Burger
    // Target Dish: "Burger" (Food)
    // Options: Restaurants (P Terry's, Hopdoddy)

    const dishBurger = await ensureEntity('Burger', EntityType.food);
    const restPTerrys = await ensureEntity('P. Terry\'s', EntityType.restaurant);
    const restHopdoddy = await ensureEntity('Hopdoddy', EntityType.restaurant);
    const restJewBoy = await ensureEntity('JewBoy Burgers', EntityType.restaurant);

    const topicBestBurger = await prisma.pollTopic.create({
        data: {
            title: 'Best Burger in Austin',
            description: 'Who flips the juiciest patties?',
            city: 'Austin',
            region: 'TX',
            country: 'US',
            status: PollTopicStatus.ready,
            topicType: PollTopicType.best_dish,
            targetDishId: dishBurger.entityId,
            seedEntityIds: [dishBurger.entityId],
        }
    });

    const pollBestBurger = await prisma.poll.create({
        data: {
            topicId: topicBestBurger.topicId,
            question: 'Which spot has the best classic cheeseburger?',
            state: PollState.active,
            city: 'Austin',
            region: 'TX',
            launchedAt: new Date(),
        }
    });

    // Create options linked to Restaurants
    for (const r of [restPTerrys, restHopdoddy, restJewBoy]) {
        await prisma.pollOption.create({
            data: {
                pollId: pollBestBurger.pollId,
                label: r.name,
                entityId: r.entityId,
                restaurantId: r.entityId, // Important: linking strict restaurant ID
            }
        });
    }
    console.log('Created "Best Burger" poll.');


    // Topic: Best Tacos
    // Target Dish: "Migas Taco" (Food)
    const dishMigas = await ensureEntity('Migas Taco', EntityType.food);
    const restVeracruz = await ensureEntity('Veracruz All Natural', EntityType.restaurant);
    const restGrannys = await ensureEntity('Granny\'s Tacos', EntityType.restaurant);

    const topicBestTacos = await prisma.pollTopic.create({
        data: {
            title: 'Best Migas in Town',
            description: 'The breakfast of champions.',
            city: 'Austin',
            region: 'TX',
            country: 'US',
            status: PollTopicStatus.ready,
            topicType: PollTopicType.best_dish,
            targetDishId: dishMigas.entityId,
            seedEntityIds: [dishMigas.entityId],
        }
    });

    const pollBestTacos = await prisma.poll.create({
        data: {
            topicId: topicBestTacos.topicId,
            question: 'Who makes the best Migas taco?',
            state: PollState.active,
            city: 'Austin',
            region: 'TX',
            launchedAt: new Date(),
        }
    });

    for (const r of [restVeracruz, restGrannys]) {
        await prisma.pollOption.create({
            data: {
                pollId: pollBestTacos.pollId,
                label: r.name,
                entityId: r.entityId,
                restaurantId: r.entityId,
            }
        });
    }
    console.log('Created "Best Tacos" poll.');


    // --- Scenario 2: What To Order Polls ---
    // Topic: What to order at Uchi?
    // Target Restaurant: "Uchi"
    // Options: specific dishes (Food entities)

    const restUchi = await ensureEntity('Uchi', EntityType.restaurant);
    const foodHamaChili = await ensureEntity('Hama Chili', EntityType.food);
    const foodYokai = await ensureEntity('Yokai Berry', EntityType.food);
    const foodBrussels = await ensureEntity('Brussels Sprouts', EntityType.food);

    const topicUchi = await prisma.pollTopic.create({
        data: {
            title: 'What to order at Uchi?',
            description: 'Help newbies navigate the menu.',
            city: 'Austin',
            region: 'TX',
            country: 'US',
            status: PollTopicStatus.ready,
            topicType: PollTopicType.what_to_order,
            targetRestaurantId: restUchi.entityId,
            seedEntityIds: [restUchi.entityId],
        }
    });

    const pollUchi = await prisma.poll.create({
        data: {
            topicId: topicUchi.topicId,
            question: 'What is the one dish you simply cannot skip at Uchi?',
            state: PollState.active,
            city: 'Austin',
            region: 'TX',
            launchedAt: new Date(),
        }
    });

    for (const f of [foodHamaChili, foodYokai, foodBrussels]) {
        await prisma.pollOption.create({
            data: {
                pollId: pollUchi.pollId,
                label: f.name,
                entityId: f.entityId,
                foodId: f.entityId, // Important: linking strict food ID
            }
        });
    }
    console.log('Created "Uchi" poll.');

    // Topic: What to order at Franklin BBQ?
    const restFranklin = await ensureEntity('Franklin Barbecue', EntityType.restaurant);
    const foodBrisket = await ensureEntity('Brisket', EntityType.food);
    const foodRibs = await ensureEntity('Pork Ribs', EntityType.food);
    const foodTips = await ensureEntity('Tipsy Texan', EntityType.food);

    const topicFranklin = await prisma.pollTopic.create({
        data: {
            title: 'Franklin Barbecue Favorites',
            description: 'Is the wait worth it? Yes. But what for?',
            city: 'Austin',
            region: 'TX',
            country: 'US',
            status: PollTopicStatus.ready,
            topicType: PollTopicType.what_to_order,
            targetRestaurantId: restFranklin.entityId,
            seedEntityIds: [restFranklin.entityId],
        }
    });

    const pollFranklin = await prisma.poll.create({
        data: {
            topicId: topicFranklin.topicId,
            question: 'If you only get one meat at Franklin, what is it?',
            state: PollState.active,
            city: 'Austin',
            region: 'TX',
            launchedAt: new Date(),
        }
    });

    for (const f of [foodBrisket, foodRibs, foodTips]) {
        await prisma.pollOption.create({
            data: {
                pollId: pollFranklin.pollId,
                label: f.name,
                entityId: f.entityId,
                foodId: f.entityId,
            }
        });
    }
    console.log('Created "Franklin" poll.');

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
