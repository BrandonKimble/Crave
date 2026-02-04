import type {
  QueryEntityDto,
  QueryEntityGroupDto,
  UnresolvedEntityGroupDto,
} from '../dto/search-query.dto';

export type SearchDebugMode = 'off' | 'summary' | 'verbose';

export function resolveSearchDebugMode(): SearchDebugMode {
  const enabledRaw = (process.env.SEARCH_DEBUG_LOG ?? '').trim().toLowerCase();
  const verboseRaw = (process.env.SEARCH_DEBUG_LOG_VERBOSE ?? '')
    .trim()
    .toLowerCase();

  const verbose =
    verboseRaw === '1' || verboseRaw === 'true' || enabledRaw === 'verbose';
  const enabled =
    enabledRaw === '1' ||
    enabledRaw === 'true' ||
    enabledRaw === 'summary' ||
    enabledRaw === 'verbose';

  if (!enabled) {
    return 'off';
  }
  return verbose ? 'verbose' : 'summary';
}

export function summarizeEntities(
  entities: QueryEntityGroupDto,
  options: { maxEntities?: number; maxIds?: number } = {},
): Record<string, unknown> {
  const maxEntities = Math.max(1, options.maxEntities ?? 5);
  const maxIds = Math.max(1, options.maxIds ?? 5);

  const summarizeGroup = (group?: QueryEntityDto[]) => {
    const safeGroup = Array.isArray(group) ? group : [];
    return {
      count: safeGroup.length,
      items: safeGroup.slice(0, maxEntities).map((entity) => ({
        normalizedName: entity.normalizedName,
        originalText: entity.originalText ?? null,
        entityIdsCount: entity.entityIds.length,
        entityIdsSample: entity.entityIds.slice(0, maxIds),
      })),
    };
  };

  return {
    restaurants: summarizeGroup(entities.restaurants),
    food: summarizeGroup(entities.food),
    foodAttributes: summarizeGroup(entities.foodAttributes),
    restaurantAttributes: summarizeGroup(entities.restaurantAttributes),
  };
}

export function summarizeUnresolvedEntities(
  unresolvedEntities: UnresolvedEntityGroupDto[] | undefined,
  options: { maxGroups?: number; maxTerms?: number } = {},
): Record<string, unknown> {
  const groups = Array.isArray(unresolvedEntities) ? unresolvedEntities : [];
  const maxGroups = Math.max(1, options.maxGroups ?? 5);
  const maxTerms = Math.max(1, options.maxTerms ?? 8);

  const totalGroups = groups.length;
  const totalTerms = groups.reduce((acc, group) => acc + group.terms.length, 0);

  return {
    totalGroups,
    totalTerms,
    groups: groups.slice(0, maxGroups).map((group) => ({
      type: group.type,
      termsCount: group.terms.length,
      termsSample: group.terms.slice(0, maxTerms),
    })),
  };
}
