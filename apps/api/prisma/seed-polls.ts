import {
  PrismaClient,
  Prisma,
  PollState,
  PollTopicStatus,
  PollTopicType,
  PollOptionResolutionStatus,
  PollOptionSource,
} from '@prisma/client';

const prisma = new PrismaClient();

const SEED_TAG = 'test-poll-seed';
const DEFAULT_COVERAGE_KEY = 'austin_tx_us';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const COVERAGE_KEY = (
  process.env.TEST_POLL_COVERAGE_KEY ?? DEFAULT_COVERAGE_KEY
)
  .trim()
  .toLowerCase();

const MAX_POLLS = parsePositiveInt(process.env.TEST_POLL_COUNT, 5);
const OPTION_LIMIT = parsePositiveInt(process.env.TEST_POLL_OPTION_LIMIT, 5);
const MIN_OPTIONS = Math.min(3, OPTION_LIMIT);
const USER_COUNT = parsePositiveInt(process.env.TEST_POLL_USER_COUNT, 12);
const SEED_VOTES = process.env.TEST_POLL_SEED_VOTES !== 'false';
const RESET_SEEDS = process.env.TEST_POLL_RESET === 'true';
const CREATED_BY_USER_ID = process.env.TEST_POLL_CREATED_BY_USER_ID;

type CoverageLabel = {
  label: string;
  cityHint: string | null;
};

type Candidate = {
  id: string;
  name: string;
};

type ConnectionCandidate = {
  connectionId: string;
  restaurantId: string;
  restaurantName: string;
  foodId: string;
  foodName: string;
};

type PollOptionSeed = {
  label: string;
  entityId?: string | null;
  restaurantId?: string | null;
  foodId?: string | null;
  categoryId?: string | null;
  connectionId?: string | null;
};

type CreatedPoll = {
  pollId: string;
  question: string;
  topicType: PollTopicType;
  optionCount: number;
  votesSeeded: number;
};

const normalizeLabel = (value: string): string => {
  return value.trim().replace(/\s+/g, ' ');
};

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const resolveCoverageLabel = (row?: {
  displayName: string | null;
  locationName: string | null;
  coverageKey: string | null;
  name: string;
}): CoverageLabel => {
  const rawLabel =
    row?.displayName?.trim() ||
    row?.locationName?.split(',')[0]?.trim() ||
    row?.coverageKey?.trim() ||
    row?.name?.trim() ||
    COVERAGE_KEY;
  const cityHint =
    row?.locationName?.split(',')[0]?.trim() ||
    row?.displayName?.trim() ||
    null;
  return { label: rawLabel, cityHint };
};

const ensureSeedUsers = async (count: number): Promise<string[]> => {
  const ids: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const email = `seed.polls.${COVERAGE_KEY}.${i}@crave.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
      },
      select: { userId: true },
    });
    ids.push(user.userId);
  }
  return ids;
};

const resolvePrimaryUser = async (): Promise<{
  userId: string;
  email: string;
} | null> => {
  if (CREATED_BY_USER_ID && CREATED_BY_USER_ID.trim()) {
    const user = await prisma.user.findUnique({
      where: { userId: CREATED_BY_USER_ID.trim() },
      select: { userId: true, email: true },
    });
    if (user) {
      return user;
    }
  }

  const preferred = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      authProviderUserId: { not: null },
    },
    orderBy: [
      { lastSignInAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: { userId: true, email: true },
  });
  if (preferred) {
    return preferred;
  }

  const fallback = await prisma.user.findFirst({
    orderBy: [
      { lastSignInAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: { userId: true, email: true },
  });
  return fallback ?? null;
};

const resetSeededPolls = async (): Promise<void> => {
  const deletedPolls = await prisma.$executeRaw`
DELETE FROM polls
WHERE coverage_key = ${COVERAGE_KEY}
  AND metadata->>'seedTag' = ${SEED_TAG}`;

  const deletedTopics = await prisma.$executeRaw`
DELETE FROM poll_topics
WHERE metadata->>'seedTag' = ${SEED_TAG}
  AND (coverage_key = ${COVERAGE_KEY} OR coverage_key IS NULL)`;

  console.log(
    `Reset complete: removed ${deletedPolls} poll(s) and ${deletedTopics} topic(s).`,
  );
};

const fetchTopFoods = async (limit: number): Promise<Candidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ food_id: string; food_name: string; upvotes: number; mentions: number }>
  >(Prisma.sql`
    SELECT
      c.food_id,
      f.name AS food_name,
      SUM(c.total_upvotes)::int AS upvotes,
      SUM(c.mention_count)::int AS mentions
    FROM core_connections c
    JOIN core_entities r ON r.entity_id = c.restaurant_id
    JOIN core_entities f ON f.entity_id = c.food_id
    WHERE r.location_key = ${COVERAGE_KEY}
    GROUP BY c.food_id, f.name
    ORDER BY SUM(c.total_upvotes) DESC, SUM(c.mention_count) DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    id: row.food_id,
    name: row.food_name,
  }));
};

const fetchTopRestaurants = async (limit: number): Promise<Candidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ restaurant_id: string; restaurant_name: string; upvotes: number; mentions: number }>
  >(Prisma.sql`
    SELECT
      r.entity_id AS restaurant_id,
      r.name AS restaurant_name,
      SUM(c.total_upvotes)::int AS upvotes,
      SUM(c.mention_count)::int AS mentions
    FROM core_connections c
    JOIN core_entities r ON r.entity_id = c.restaurant_id
    WHERE r.location_key = ${COVERAGE_KEY}
    GROUP BY r.entity_id, r.name
    ORDER BY SUM(c.total_upvotes) DESC, SUM(c.mention_count) DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    id: row.restaurant_id,
    name: row.restaurant_name,
  }));
};

const fetchTopRestaurantsForFood = async (
  foodId: string,
  limit: number,
): Promise<ConnectionCandidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{
      connection_id: string;
      restaurant_id: string;
      restaurant_name: string;
      food_id: string;
      food_name: string;
      upvotes: number;
      mentions: number;
    }>
  >(Prisma.sql`
    SELECT
      c.connection_id,
      r.entity_id AS restaurant_id,
      r.name AS restaurant_name,
      c.food_id,
      f.name AS food_name,
      c.total_upvotes::int AS upvotes,
      c.mention_count::int AS mentions
    FROM core_connections c
    JOIN core_entities r ON r.entity_id = c.restaurant_id
    JOIN core_entities f ON f.entity_id = c.food_id
    WHERE c.food_id = ${foodId}::uuid
      AND r.location_key = ${COVERAGE_KEY}
    ORDER BY c.total_upvotes DESC, c.mention_count DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    connectionId: row.connection_id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    foodId: row.food_id,
    foodName: row.food_name,
  }));
};

const fetchTopFoodsForRestaurant = async (
  restaurantId: string,
  limit: number,
): Promise<ConnectionCandidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{
      connection_id: string;
      restaurant_id: string;
      restaurant_name: string;
      food_id: string;
      food_name: string;
      upvotes: number;
      mentions: number;
    }>
  >(Prisma.sql`
    SELECT
      c.connection_id,
      r.entity_id AS restaurant_id,
      r.name AS restaurant_name,
      c.food_id,
      f.name AS food_name,
      c.total_upvotes::int AS upvotes,
      c.mention_count::int AS mentions
    FROM core_connections c
    JOIN core_entities r ON r.entity_id = c.restaurant_id
    JOIN core_entities f ON f.entity_id = c.food_id
    WHERE c.restaurant_id = ${restaurantId}::uuid
    ORDER BY c.total_upvotes DESC, c.mention_count DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    connectionId: row.connection_id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    foodId: row.food_id,
    foodName: row.food_name,
  }));
};

const fetchTopFoodAttributes = async (limit: number): Promise<Candidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ attribute_id: string; attribute_name: string; uses: number }>
  >(Prisma.sql`
    WITH attr_usage AS (
      SELECT unnest(c.food_attributes) AS attribute_id
      FROM core_connections c
      JOIN core_entities r ON r.entity_id = c.restaurant_id
      WHERE r.location_key = ${COVERAGE_KEY}
    )
    SELECT
      e.entity_id AS attribute_id,
      e.name AS attribute_name,
      COUNT(*)::int AS uses
    FROM attr_usage u
    JOIN core_entities e ON e.entity_id = u.attribute_id
    WHERE e.type = 'food_attribute'
    GROUP BY e.entity_id, e.name
    ORDER BY COUNT(*) DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    id: row.attribute_id,
    name: row.attribute_name,
  }));
};

const fetchConnectionsForFoodAttribute = async (
  attributeId: string,
  limit: number,
): Promise<ConnectionCandidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{
      connection_id: string;
      restaurant_id: string;
      restaurant_name: string;
      food_id: string;
      food_name: string;
      upvotes: number;
      mentions: number;
    }>
  >(Prisma.sql`
    SELECT
      c.connection_id,
      r.entity_id AS restaurant_id,
      r.name AS restaurant_name,
      c.food_id,
      f.name AS food_name,
      c.total_upvotes::int AS upvotes,
      c.mention_count::int AS mentions
    FROM core_connections c
    JOIN core_entities r ON r.entity_id = c.restaurant_id
    JOIN core_entities f ON f.entity_id = c.food_id
    WHERE r.location_key = ${COVERAGE_KEY}
      AND ${attributeId}::uuid = ANY(c.food_attributes)
    ORDER BY c.total_upvotes DESC, c.mention_count DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    connectionId: row.connection_id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    foodId: row.food_id,
    foodName: row.food_name,
  }));
};

const fetchTopRestaurantAttributes = async (
  limit: number,
): Promise<Candidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ attribute_id: string; attribute_name: string; uses: number }>
  >(Prisma.sql`
    WITH attr_usage AS (
      SELECT unnest(r.restaurant_attributes) AS attribute_id
      FROM core_entities r
      WHERE r.type = 'restaurant'
        AND r.location_key = ${COVERAGE_KEY}
    )
    SELECT
      e.entity_id AS attribute_id,
      e.name AS attribute_name,
      COUNT(*)::int AS uses
    FROM attr_usage u
    JOIN core_entities e ON e.entity_id = u.attribute_id
    WHERE e.type = 'restaurant_attribute'
    GROUP BY e.entity_id, e.name
    ORDER BY COUNT(*) DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    id: row.attribute_id,
    name: row.attribute_name,
  }));
};

const fetchRestaurantsForRestaurantAttribute = async (
  attributeId: string,
  limit: number,
): Promise<Candidate[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ restaurant_id: string; restaurant_name: string; score: number; praise: number }>
  >(Prisma.sql`
    SELECT
      r.entity_id AS restaurant_id,
      r.name AS restaurant_name,
      COALESCE(r.restaurant_quality_score, 0)::float AS score,
      COALESCE(r.general_praise_upvotes, 0)::int AS praise
    FROM core_entities r
    WHERE r.type = 'restaurant'
      AND r.location_key = ${COVERAGE_KEY}
      AND ${attributeId}::uuid = ANY(r.restaurant_attributes)
    ORDER BY COALESCE(r.restaurant_quality_score, 0) DESC,
             COALESCE(r.general_praise_upvotes, 0) DESC
    LIMIT ${limit};
  `);

  return rows.map((row) => ({
    id: row.restaurant_id,
    name: row.restaurant_name,
  }));
};

const createPollWithOptions = async (params: {
  question: string;
  description: string;
  topicType: PollTopicType;
  targetDishId?: string | null;
  targetRestaurantId?: string | null;
  targetFoodAttributeId?: string | null;
  targetRestaurantAttributeId?: string | null;
  categoryEntityIds: string[];
  seedEntityIds: string[];
  options: PollOptionSeed[];
  coverageKey: string;
  usersToVote: string[];
  cityLabel?: string | null;
  createdByUserId?: string | null;
}): Promise<CreatedPoll | null> => {
  const question = normalizeLabel(params.question);
  const existing = await prisma.poll.findFirst({
    where: {
      coverageKey: params.coverageKey,
      question,
    },
    select: { pollId: true },
  });

  if (existing) {
    console.log(`Skipping existing poll: ${question}`);
    return null;
  }

  const now = new Date();
  const topic = await prisma.pollTopic.create({
    data: {
      title: question,
      description: params.description,
      coverageKey: params.coverageKey,
      status: PollTopicStatus.archived,
      topicType: params.topicType,
      createdByUserId: params.createdByUserId ?? null,
      targetDishId: params.targetDishId ?? null,
      targetRestaurantId: params.targetRestaurantId ?? null,
      targetFoodAttributeId: params.targetFoodAttributeId ?? null,
      targetRestaurantAttributeId: params.targetRestaurantAttributeId ?? null,
      categoryEntityIds: params.categoryEntityIds,
      seedEntityIds: params.seedEntityIds,
      metadata: {
        seedTag: SEED_TAG,
        coverageKey: params.coverageKey,
        cityLabel: params.cityLabel ?? null,
      },
    },
  });

  const poll = await prisma.poll.create({
    data: {
      topicId: topic.topicId,
      question,
      coverageKey: params.coverageKey,
      state: PollState.active,
      scheduledFor: now,
      launchedAt: now,
      allowUserAdditions: true,
      metadata: {
        seedTag: SEED_TAG,
        coverageKey: params.coverageKey,
      },
      createdByUserId: params.createdByUserId ?? null,
    },
    select: { pollId: true },
  });

  const createdOptions: Array<{ optionId: string }> = [];
  for (let index = 0; index < params.options.length; index += 1) {
    const option = params.options[index];
    const attachUser =
      Boolean(params.createdByUserId) && index === 0;
    const created = await prisma.pollOption.create({
      data: {
        pollId: poll.pollId,
        label: normalizeLabel(option.label),
        entityId: option.entityId ?? null,
        restaurantId: option.restaurantId ?? null,
        foodId: option.foodId ?? null,
        categoryId: option.categoryId ?? null,
        connectionId: option.connectionId ?? null,
        source: attachUser ? PollOptionSource.user : PollOptionSource.seed,
        addedByUserId: attachUser ? params.createdByUserId : null,
        resolutionStatus: PollOptionResolutionStatus.matched,
        metadata: {
          seedTag: SEED_TAG,
        },
      },
      select: { optionId: true },
    });
    createdOptions.push(created);
  }

  let votesSeeded = 0;
  if (SEED_VOTES && params.usersToVote.length > 0) {
    votesSeeded = await seedVotesForPoll(
      poll.pollId,
      createdOptions.map((option) => option.optionId),
      params.usersToVote,
      params.createdByUserId ?? null,
      createdOptions[0]?.optionId ?? null,
    );
  }

  return {
    pollId: poll.pollId,
    question,
    topicType: params.topicType,
    optionCount: createdOptions.length,
    votesSeeded,
  };
};

const seedVotesForPoll = async (
  pollId: string,
  optionIds: string[],
  userIds: string[],
  primaryUserId: string | null,
  primaryOptionId: string | null,
): Promise<number> => {
  if (!optionIds.length || !userIds.length) {
    if (!primaryUserId || !primaryOptionId) {
      return 0;
    }
  }

  const uniqueUsers = Array.from(new Set(userIds));
  const remainingUsers = primaryUserId
    ? uniqueUsers.filter((userId) => userId !== primaryUserId)
    : uniqueUsers;
  const totalVotes = Math.min(
    remainingUsers.length,
    optionIds.length * 3,
  );
  const shuffledUsers = shuffle(remainingUsers).slice(0, totalVotes);
  const shuffledOptions = shuffle(optionIds);

  const optionVoteCounts = new Map<string, number>();
  let optionIndex = 0;

  if (primaryUserId && primaryOptionId) {
    await prisma.pollVote.create({
      data: {
        pollId,
        optionId: primaryOptionId,
        userId: primaryUserId,
      },
    });
    optionVoteCounts.set(
      primaryOptionId,
      (optionVoteCounts.get(primaryOptionId) ?? 0) + 1,
    );
  }

  for (const userId of shuffledUsers) {
    const optionId = shuffledOptions[optionIndex % shuffledOptions.length];
    optionIndex += 1;
    await prisma.pollVote.create({
      data: {
        pollId,
        optionId,
        userId,
      },
    });
    optionVoteCounts.set(optionId, (optionVoteCounts.get(optionId) ?? 0) + 1);
  }

  const total = Array.from(optionVoteCounts.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  const now = new Date();

  for (const [optionId, count] of optionVoteCounts.entries()) {
    const consensus = total > 0 ? count / total : 0;
    await prisma.pollOption.update({
      where: { optionId },
      data: {
        voteCount: count,
        aggregatedVoteCount: count,
        consensus: new Prisma.Decimal(consensus),
        lastVoteAt: now,
      },
    });
  }

  await prisma.pollMetric.upsert({
    where: { pollId },
    create: {
      pollId,
      totalVotes: total,
      totalParticipants: total,
      lastAggregatedAt: now,
      metadata: { seedTag: SEED_TAG },
    },
    update: {
      totalVotes: total,
      totalParticipants: total,
      lastAggregatedAt: now,
      metadata: { seedTag: SEED_TAG },
    },
  });

  return total;
};

const buildBestDishPoll = async (
  candidate: Candidate,
  coverageLabel: CoverageLabel,
  users: string[],
  createdByUserId?: string | null,
): Promise<CreatedPoll | null> => {
  const connections = await fetchTopRestaurantsForFood(
    candidate.id,
    OPTION_LIMIT,
  );
  if (connections.length < MIN_OPTIONS) {
    return null;
  }
  const options: PollOptionSeed[] = connections.map((connection) => ({
    label: connection.restaurantName,
    entityId: connection.restaurantId,
    restaurantId: connection.restaurantId,
    categoryId: candidate.id,
  }));

  const description =
    coverageLabel.cityHint
      ? `Which spot has the best ${candidate.name} in ${coverageLabel.cityHint}?`
      : `Which spot has the best ${candidate.name}?`;

  return createPollWithOptions({
    question: `Best ${candidate.name}`,
    description,
    topicType: PollTopicType.best_dish,
    targetDishId: candidate.id,
    categoryEntityIds: [candidate.id],
    seedEntityIds: [candidate.id],
    options,
    coverageKey: COVERAGE_KEY,
    usersToVote: users,
    cityLabel: coverageLabel.label,
    createdByUserId,
  });
};

const buildWhatToOrderPoll = async (
  candidate: Candidate,
  coverageLabel: CoverageLabel,
  users: string[],
  createdByUserId?: string | null,
): Promise<CreatedPoll | null> => {
  const connections = await fetchTopFoodsForRestaurant(
    candidate.id,
    OPTION_LIMIT,
  );
  if (connections.length < MIN_OPTIONS) {
    return null;
  }
  const options: PollOptionSeed[] = connections.map((connection) => ({
    label: connection.foodName,
    entityId: connection.foodId,
    restaurantId: candidate.id,
    foodId: connection.foodId,
    connectionId: connection.connectionId,
  }));

  const description =
    coverageLabel.cityHint
      ? `Help newcomers pick a must-order dish at ${candidate.name}.`
      : `What is the one dish you should not skip at ${candidate.name}?`;

  return createPollWithOptions({
    question: `What to order at ${candidate.name}?`,
    description,
    topicType: PollTopicType.what_to_order,
    targetRestaurantId: candidate.id,
    categoryEntityIds: [],
    seedEntityIds: [candidate.id],
    options,
    coverageKey: COVERAGE_KEY,
    usersToVote: users,
    cityLabel: coverageLabel.label,
    createdByUserId,
  });
};

const buildBestDishAttributePoll = async (
  candidate: Candidate,
  coverageLabel: CoverageLabel,
  users: string[],
  createdByUserId?: string | null,
): Promise<CreatedPoll | null> => {
  const connections = await fetchConnectionsForFoodAttribute(
    candidate.id,
    OPTION_LIMIT,
  );
  if (connections.length < MIN_OPTIONS) {
    return null;
  }

  const options: PollOptionSeed[] = connections.map((connection) => ({
    label: `${connection.foodName} @ ${connection.restaurantName}`,
    entityId: connection.foodId,
    restaurantId: connection.restaurantId,
    foodId: connection.foodId,
    connectionId: connection.connectionId,
  }));

  const description =
    coverageLabel.cityHint
      ? `Which dish best captures ${candidate.name} in ${coverageLabel.cityHint}?`
      : `Which dish best captures ${candidate.name}?`;

  return createPollWithOptions({
    question: `Best ${candidate.name} dish`,
    description,
    topicType: PollTopicType.best_dish_attribute,
    targetFoodAttributeId: candidate.id,
    categoryEntityIds: [candidate.id],
    seedEntityIds: [candidate.id],
    options,
    coverageKey: COVERAGE_KEY,
    usersToVote: users,
    cityLabel: coverageLabel.label,
    createdByUserId,
  });
};

const buildBestRestaurantAttributePoll = async (
  candidate: Candidate,
  coverageLabel: CoverageLabel,
  users: string[],
  createdByUserId?: string | null,
): Promise<CreatedPoll | null> => {
  const restaurants = await fetchRestaurantsForRestaurantAttribute(
    candidate.id,
    OPTION_LIMIT,
  );
  if (restaurants.length < MIN_OPTIONS) {
    return null;
  }

  const options: PollOptionSeed[] = restaurants.map((restaurant) => ({
    label: restaurant.name,
    entityId: restaurant.id,
    restaurantId: restaurant.id,
  }));

  const description =
    coverageLabel.cityHint
      ? `Which restaurants are most ${candidate.name} in ${coverageLabel.cityHint}?`
      : `Which restaurants are most ${candidate.name}?`;

  return createPollWithOptions({
    question: `Best ${candidate.name} restaurants`,
    description,
    topicType: PollTopicType.best_restaurant_attribute,
    targetRestaurantAttributeId: candidate.id,
    categoryEntityIds: [candidate.id],
    seedEntityIds: [candidate.id],
    options,
    coverageKey: COVERAGE_KEY,
    usersToVote: users,
    cityLabel: coverageLabel.label,
    createdByUserId,
  });
};

async function main() {
  console.log(`Seeding polls for coverage key: ${COVERAGE_KEY}`);

  if (RESET_SEEDS) {
    await resetSeededPolls();
  }

  const coverageRow = await prisma.coverageArea.findFirst({
    where: {
      OR: [
        { coverageKey: { equals: COVERAGE_KEY, mode: 'insensitive' } },
        { name: { equals: COVERAGE_KEY, mode: 'insensitive' } },
      ],
    },
    select: {
      coverageKey: true,
      name: true,
      displayName: true,
      locationName: true,
    },
  });
  const coverageLabel = resolveCoverageLabel(
    coverageRow ?? undefined,
  );

  const primaryUser = await resolvePrimaryUser();
  const seedUsers = SEED_VOTES ? await ensureSeedUsers(USER_COUNT) : [];
  const users = primaryUser
    ? Array.from(new Set([primaryUser.userId, ...seedUsers]))
    : seedUsers;
  const createdByUserId =
    CREATED_BY_USER_ID?.trim() || primaryUser?.userId || seedUsers[0] || null;

  if (createdByUserId) {
    const label = primaryUser
      ? `${primaryUser.email} (${primaryUser.userId})`
      : createdByUserId;
    console.log(`Using createdByUserId: ${label}`);
  }

  const topFoods = await fetchTopFoods(10);
  const topRestaurants = await fetchTopRestaurants(10);
  const topFoodAttributes = await fetchTopFoodAttributes(5);
  const topRestaurantAttributes = await fetchTopRestaurantAttributes(5);

  const created: CreatedPoll[] = [];

  const primaryFood = topFoods[0];
  const primaryRestaurant = topRestaurants[0];
  const primaryFoodAttribute = topFoodAttributes[0];
  const primaryRestaurantAttribute = topRestaurantAttributes[0];

  if (primaryFood) {
    const poll = await buildBestDishPoll(
      primaryFood,
      coverageLabel,
      users,
      createdByUserId,
    );
    if (poll) created.push(poll);
  }

  if (primaryRestaurant && created.length < MAX_POLLS) {
    const poll = await buildWhatToOrderPoll(
      primaryRestaurant,
      coverageLabel,
      users,
      createdByUserId,
    );
    if (poll) created.push(poll);
  }

  if (primaryFoodAttribute && created.length < MAX_POLLS) {
    const poll = await buildBestDishAttributePoll(
      primaryFoodAttribute,
      coverageLabel,
      users,
      createdByUserId,
    );
    if (poll) created.push(poll);
  }

  if (primaryRestaurantAttribute && created.length < MAX_POLLS) {
    const poll = await buildBestRestaurantAttributePoll(
      primaryRestaurantAttribute,
      coverageLabel,
      users,
      createdByUserId,
    );
    if (poll) created.push(poll);
  }

  let foodIndex = 1;
  let restaurantIndex = 1;
  while (created.length < Math.min(3, MAX_POLLS)) {
    if (foodIndex < topFoods.length) {
      const poll = await buildBestDishPoll(
        topFoods[foodIndex],
        coverageLabel,
        users,
        createdByUserId,
      );
      foodIndex += 1;
      if (poll) {
        created.push(poll);
        continue;
      }
    }

    if (restaurantIndex < topRestaurants.length) {
      const poll = await buildWhatToOrderPoll(
        topRestaurants[restaurantIndex],
        coverageLabel,
        users,
        createdByUserId,
      );
      restaurantIndex += 1;
      if (poll) {
        created.push(poll);
        continue;
      }
    }

    if (foodIndex >= topFoods.length && restaurantIndex >= topRestaurants.length) {
      break;
    }
  }

  console.log(`Created ${created.length} poll(s).`);
  for (const poll of created) {
    console.log(
      `- ${poll.question} (${poll.topicType}) options=${poll.optionCount} votes=${poll.votesSeeded}`,
    );
  }

  if (created.length === 0) {
    console.log('No polls created. Check that Austin data exists.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
