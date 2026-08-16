import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
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

  // SEARCH_DEBUG_LOG is a MODE selector ('summary' | 'verbose') that also
  // accepts a plain boolean, so the flag vocabulary and the mode names are
  // both honoured — through the ONE flag helper, not a fourth dialect.
  const verbose = isEnvFlagEnabled(verboseRaw) || enabledRaw === 'verbose';
  const enabled =
    isEnvFlagEnabled(enabledRaw) ||
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
    places: summarizeGroup(entities.places),
    item: summarizeGroup(entities.items),
    itemAttributes: summarizeGroup(entities.itemAttributes),
    placeAttributes: summarizeGroup(entities.placeAttributes),
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
