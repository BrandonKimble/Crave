import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  BarChart3,
  CircleUserRound,
  Clock,
  HandPlatter,
  Heart,
  Search as SearchIcon,
  Sparkles,
  Store,
  View as ViewIcon,
} from 'lucide-react-native';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../../constants/typography';
import type { AutocompleteMatch } from '../../../services/autocomplete';
import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../services/search';
import { logPerfScenarioSearchRequestLifecycle } from '../../../perf/perf-scenario-attribution';
import { filterRecentlyViewedByRecentSearches } from '../utils/history';
import {
  hasSuggestionMatchSegments,
  splitSuggestionMatchSegments,
} from '../utils/suggestion-match-highlight';
import { renderMetaDetailLine } from './render-meta-detail-line';

type SearchSuggestionsProps = {
  visible: boolean;
  showAutocomplete: boolean;
  showRecent: boolean;
  suggestions: AutocompleteMatch[];
  /** Refit layer 2 (match highlighting): the query the displayed suggestions were
   *  produced for — drives the bold-the-completion split in row titles. */
  highlightQuery: string;
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  recentlyViewedFoods: RecentlyViewedFood[];
  onSelectSuggestion: (match: AutocompleteMatch, options?: { seeLocations?: boolean }) => void;
  onSelectRecent: (term: RecentSearch) => void;
  onSelectRecentlyViewed: (restaurant: RecentlyViewedRestaurant) => void;
  onSelectRecentlyViewedFood: (food: RecentlyViewedFood) => void;
  onPressRecentViewMore: () => void;
  onPressRecentlyViewedMore: () => void;
  style?: StyleProp<ViewStyle>;
};

const ICON_COLOR = '#000000';
const RECENT_SEARCH_PREVIEW_LIMIT = 5;
const RECENTLY_VIEWED_PREVIEW_LIMIT = 3;
const ROW_HEIGHT = 60;
const NAME_LINE_HEIGHT = FONT_SIZES.subtitle + 2;
const META_LINE_HEIGHT = FONT_SIZES.body + 2;
const META_LINE_SPACING = 4;

const summarizeRenderedAutocompleteMatches = (
  suggestions: AutocompleteMatch[]
): Record<string, unknown> => {
  const byEntityType: Record<string, number> = {};
  const byQuerySuggestionSource: Record<string, number> = {};
  let querySuggestionCount = 0;
  let attributeCount = 0;

  suggestions.forEach((match) => {
    const entityType = match.entityType || 'unknown';
    byEntityType[entityType] = (byEntityType[entityType] ?? 0) + 1;
    if (match.matchType === 'query' || match.entityType === 'query') {
      querySuggestionCount += 1;
      const source = match.querySuggestionSource ?? 'unknown';
      byQuerySuggestionSource[source] = (byQuerySuggestionSource[source] ?? 0) + 1;
    }
    if (match.entityType === 'item_attribute' || match.entityType === 'place_attribute') {
      attributeCount += 1;
    }
  });

  return {
    renderedAutocompleteCount: suggestions.length,
    renderedAutocompleteByEntityType: byEntityType,
    renderedAutocompleteByQuerySuggestionSource: byQuerySuggestionSource,
    renderedAutocompleteQuerySuggestionCount: querySuggestionCount,
    renderedAutocompleteAttributeCount: attributeCount,
    renderedAutocompleteTopMatches: suggestions.slice(0, 7).map((match) => ({
      entityType: match.entityType,
      matchType: match.matchType ?? null,
      name: match.name,
      querySuggestionSource: match.querySuggestionSource ?? null,
    })),
  };
};

// Refit layer 2 (type-differentiated rows) — OWNER-CORRECTED 2026-07-24:
// differentiation is ICON-ONLY (the left icon is the type language the app
// already speaks); the text type labels were reverted as noise ("not
// relevant to the user"). Attribute rows keep the distinct Sparkles icon so
// they stop rendering identically to dishes.

const testIdSafeName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'unknown';

const RenderedAutocompletePerfLogger: React.FC<{ suggestions: AutocompleteMatch[] }> = ({
  suggestions,
}) => {
  React.useEffect(() => {
    logPerfScenarioSearchRequestLifecycle({
      source: 'SearchSuggestions',
      phase: 'autocomplete_rendered_suggestions',
      ...summarizeRenderedAutocompleteMatches(suggestions),
    });
  }, [suggestions]);

  return null;
};

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  visible,
  showAutocomplete,
  showRecent,
  suggestions,
  highlightQuery,
  recentSearches,
  recentlyViewedRestaurants,
  recentlyViewedFoods,
  onSelectSuggestion,
  onSelectRecent,
  onSelectRecentlyViewed,
  onSelectRecentlyViewedFood,
  onPressRecentViewMore,
  onPressRecentlyViewedMore,
  style,
}) => {
  const { t } = useTranslation();
  const shouldShowAutocompleteResults = showAutocomplete && suggestions.length > 0;
  // Never-blank rule (c): only when there is truly nothing better to show — a
  // list (even a stale placeholder) always outranks the failure notice.
  const recentSearchesToRender = recentSearches.slice(0, RECENT_SEARCH_PREVIEW_LIMIT);
  const shouldRenderRecentSearchesSection = showRecent && recentSearchesToRender.length > 0;
  const recentlyViewedDeduped = React.useMemo(
    () => filterRecentlyViewedByRecentSearches(recentlyViewedRestaurants, recentSearches),
    [recentlyViewedRestaurants, recentSearches]
  );
  const recentlyViewedItems = React.useMemo(() => {
    const items: Array<
      { type: 'item'; item: RecentlyViewedFood } | { type: 'place'; item: RecentlyViewedRestaurant }
    > = [
      ...recentlyViewedFoods.map((item) => ({ type: 'item' as const, item })),
      ...recentlyViewedDeduped.map((item) => ({ type: 'place' as const, item })),
    ];

    items.sort((left, right) => {
      const leftTs = Date.parse(left.item.lastViewedAt);
      const rightTs = Date.parse(right.item.lastViewedAt);
      const leftValue = Number.isFinite(leftTs) ? leftTs : 0;
      const rightValue = Number.isFinite(rightTs) ? rightTs : 0;
      return rightValue - leftValue;
    });

    return items;
  }, [recentlyViewedFoods, recentlyViewedDeduped]);

  // F808 (2026-08-03) — CONDITIONAL HOOKS, FIXED. `if (!visible) return null` used to sit
  // ABOVE the two useMemos, so this component called two fewer hooks whenever it was
  // hidden. Every `visible` toggle changed the hook COUNT, which is React's "Rendered more
  // hooks than during the previous render" crash — a latent one, because this component
  // happens to be unmounted rather than hidden on most paths today. Found the day
  // eslint-plugin-react-hooks was installed; it was the only rules-of-hooks error in 37k
  // lines, and it was real.
  //
  // The early return now happens AFTER every hook. The memos above are pure and cheap, so
  // running them while hidden costs nothing observable.
  if (!visible) {
    return null;
  }

  const recentlyViewedToRender = recentlyViewedItems.slice(0, RECENTLY_VIEWED_PREVIEW_LIMIT);
  const shouldRenderRecentlyViewedSection = showRecent && recentlyViewedToRender.length > 0;
  const shouldRenderRecentSection =
    shouldRenderRecentSearchesSection || shouldRenderRecentlyViewedSection;
  const shouldShowRecentViewMore = recentSearches.length > RECENT_SEARCH_PREVIEW_LIMIT;
  const shouldShowRecentlyViewedMore = recentlyViewedItems.length > RECENTLY_VIEWED_PREVIEW_LIMIT;
  const containerStyles = [styles.container, style];
  const recentSectionStyles = [
    styles.recentSection,
    showAutocomplete ? styles.recentSectionGap : null,
  ];

  // §7 (see-locations): the suggestion surface NEVER shows a location count —
  // multi-location places get the "See locations" chip instead; earned
  // address labels ride the prefix slot (recently-viewed rows).
  const renderStatusLine = (
    statusPreview?: RecentSearch['statusPreview'] | null,
    prefix?: React.ReactNode
  ) => {
    if (!statusPreview?.operatingStatus && !prefix) {
      return null;
    }
    const statusLine = renderMetaDetailLine(
      statusPreview?.operatingStatus ?? null,
      null,
      null,
      'left',
      prefix,
      true,
      true,
      styles.metaLineText
    );
    return statusLine ?? null;
  };

  return (
    <View style={containerStyles}>
      {showAutocomplete ? <RenderedAutocompletePerfLogger suggestions={suggestions} /> : null}
      {shouldShowAutocompleteResults ? (
        <View style={styles.autocompleteSectionSurface}>
          {suggestions.map((match, index) => {
            const normalizedEntityId = match.entityId?.trim?.() ?? '';
            const normalizedName = match.name.trim().toLowerCase();
            const confidenceKey = Number.isFinite(match.confidence)
              ? match.confidence.toFixed(3)
              : 'unknown';
            const itemKey = normalizedEntityId
              ? `${match.entityType}:${normalizedEntityId}:${normalizedName}`
              : `${match.entityType}:${match.matchType ?? 'unknown'}:${
                  match.querySuggestionSource ?? 'unknown'
                }:${normalizedName}:${confidenceKey}`;
            const isQuery = match.matchType === 'query' || match.entityType === 'query';
            const isPoll = match.matchType === 'poll' || match.entityType === 'poll';
            const isUser = match.matchType === 'user' || match.entityType === 'user';
            // "See locations" chip decision (§7: the chip label, NEVER a
            // count): multi-location fact from the status preview the
            // pipeline already carries.
            const isMultiLocationRestaurant =
              match.entityType === 'place' &&
              Boolean(match.entityId) &&
              (match.statusPreview?.locationCount ?? 0) > 1;
            const isRecentQuery = Boolean(match.badges?.recentQuery);
            const isViewed = Boolean(match.badges?.viewed);
            const isAttribute =
              match.entityType === 'item_attribute' || match.entityType === 'place_attribute';
            // Match highlighting (Spotify-style, owner-corrected 2026-07-24):
            // the MATCHED portion renders muted gray, the completion regular —
            // the eye reads what the engine added, not what it already typed.
            const titleSegments = splitSuggestionMatchSegments(highlightQuery, match.name);
            const shouldEmphasizeCompletion = hasSuggestionMatchSegments(titleSegments);
            const statusLine =
              match.entityType === 'place' ? renderStatusLine(match.statusPreview ?? null) : null;
            // Person rows (user lane): the handle is the meta line.
            const userHandleLine =
              isUser && match.username ? (
                <Text style={styles.autocompleteMetaText} numberOfLines={1}>
                  @{match.username}
                </Text>
              ) : null;
            const hasMetaLine = Boolean(statusLine) || Boolean(userHandleLine);
            const leadingIcon = isRecentQuery ? (
              <Clock size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : isViewed ? (
              <ViewIcon size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : isPoll ? (
              <BarChart3 size={20} color={themeColors.primary} strokeWidth={2} />
            ) : isUser ? (
              <CircleUserRound size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : isQuery ? (
              <SearchIcon size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : isAttribute ? (
              <Sparkles size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : match.entityType === 'place' ? (
              <Store size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : (
              <HandPlatter size={20} color={ICON_COLOR} strokeWidth={2} />
            );
            return (
              <TouchableOpacity
                key={itemKey}
                onPress={() => onSelectSuggestion(match)}
                style={styles.autocompleteItemRow}
                accessibilityRole="button"
                accessibilityLabel={`Autocomplete suggestion ${match.name}`}
                testID={`autocomplete-suggestion-${match.entityType}-${testIdSafeName(match.name)}`}
              >
                <View style={styles.autocompleteLeadingIcon}>{leadingIcon}</View>
                <View
                  style={[
                    styles.autocompleteItemContent,
                    index === suggestions.length - 1 ? styles.autocompleteItemLast : null,
                  ]}
                >
                  <View style={styles.autocompleteTextGroup}>
                    <Text style={styles.autocompletePrimaryText} numberOfLines={1}>
                      {shouldEmphasizeCompletion
                        ? titleSegments.map((segment, segmentIndex) => (
                            <Text
                              key={`${segmentIndex}-${segment.text}`}
                              style={
                                segment.isMatch
                                  ? [styles.autocompletePrimaryText, styles.autocompleteMatched]
                                  : styles.autocompletePrimaryText
                              }
                            >
                              {segment.text}
                            </Text>
                          ))
                        : match.name}
                    </Text>
                    {hasMetaLine ? (
                      <View style={styles.metaLine}>{statusLine ?? userHandleLine}</View>
                    ) : null}
                  </View>
                  <View style={styles.autocompleteBadges}>
                    {isMultiLocationRestaurant ? (
                      <TouchableOpacity
                        onPress={() => onSelectSuggestion(match, { seeLocations: true })}
                        style={styles.seeLocationsChip}
                        accessibilityRole="button"
                        accessibilityLabel={t('search.suggestions.seeLocationsOf', {
                          name: match.name,
                        })}
                        testID={`autocomplete-see-locations-${testIdSafeName(match.name)}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.seeLocationsChipText}>
                          {t('search.suggestions.seeLocations')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {match.badges?.favorite ? (
                      <Heart size={16} color={ICON_COLOR} strokeWidth={2} />
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {shouldRenderRecentSection ? (
        <View style={recentSectionStyles}>
          {shouldRenderRecentSearchesSection ? (
            <View>
              <View style={styles.recentHeaderRow}>
                <Text style={styles.recentHeaderText}>
                  {t('search.suggestions.recentSearches')}
                </Text>
              </View>
              {recentSearchesToRender.map((term, index) => {
                const statusLine =
                  term.selectedEntityType === 'place'
                    ? renderStatusLine(term.statusPreview ?? null)
                    : null;
                const hasMetaLine = Boolean(statusLine);
                return (
                  <TouchableOpacity
                    key={`${term.queryText}-${index}`}
                    onPress={() => onSelectRecent(term)}
                    style={styles.recentRow}
                  >
                    <View style={styles.recentIcon}>
                      <Clock size={18} color={ICON_COLOR} strokeWidth={2} />
                    </View>
                    <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
                      <View style={styles.recentRowTextGroup}>
                        <Text style={styles.recentText} numberOfLines={1}>
                          {term.queryText}
                        </Text>
                        {hasMetaLine ? <View style={styles.metaLine}>{statusLine}</View> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {shouldShowRecentViewMore ? (
                <TouchableOpacity
                  onPress={onPressRecentViewMore}
                  style={styles.recentViewMore}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.suggestions.viewMoreRecentSearches')}
                >
                  <Text variant="body" weight="semibold" style={styles.recentViewMoreText}>
                    {t('search.suggestions.viewMore')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {shouldRenderRecentlyViewedSection ? (
            <View>
              <View
                style={[
                  styles.recentHeaderRow,
                  shouldRenderRecentSearchesSection ? styles.recentHeaderRowSpaced : null,
                ]}
              >
                <Text style={styles.recentHeaderText}>
                  {t('search.suggestions.recentlyViewed')}
                </Text>
              </View>
              {recentlyViewedToRender.map((entry, index) => {
                if (entry.type === 'item') {
                  const item = entry.item;
                  const statusLine = renderMetaDetailLine(
                    item.statusPreview?.operatingStatus ?? null,
                    null,
                    null,
                    'left',
                    item.placeName,
                    false,
                    false,
                    styles.metaLineText
                  );
                  const hasMetaLine = Boolean(statusLine);
                  return (
                    <TouchableOpacity
                      key={`${item.connectionId}-${index}`}
                      onPress={() => onSelectRecentlyViewedFood(item)}
                      style={styles.recentRow}
                    >
                      <View style={styles.recentIcon}>
                        <HandPlatter size={18} color={ICON_COLOR} strokeWidth={2} />
                      </View>
                      <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
                        <View style={styles.recentRowTextGroup}>
                          <Text style={styles.recentText} numberOfLines={1}>
                            {item.itemName}
                          </Text>
                          {hasMetaLine ? <View style={styles.metaLine}>{statusLine}</View> : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                const item = entry.item;
                // Earned address suggestion: a specific viewed location shows
                // its address label ahead of the status.
                const statusLine = renderStatusLine(
                  item.statusPreview ?? null,
                  item.locationAddress ?? undefined
                );
                const hasMetaLine = Boolean(statusLine);
                return (
                  <TouchableOpacity
                    key={`${item.placeId}-${index}`}
                    onPress={() => onSelectRecentlyViewed(item)}
                    style={styles.recentRow}
                  >
                    <View style={styles.recentIcon}>
                      <ViewIcon size={18} color={ICON_COLOR} strokeWidth={2} />
                    </View>
                    <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
                      <View style={styles.recentRowTextGroup}>
                        <Text style={styles.recentText} numberOfLines={1}>
                          {item.placeName}
                        </Text>
                        {hasMetaLine ? <View style={styles.metaLine}>{statusLine}</View> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {shouldShowRecentlyViewedMore ? (
                <TouchableOpacity
                  onPress={onPressRecentlyViewedMore}
                  style={[styles.recentViewMore, styles.recentViewMoreLast]}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.suggestions.viewMoreRecentlyViewed')}
                >
                  <Text variant="body" weight="semibold" style={styles.recentViewMoreText}>
                    {t('search.suggestions.viewMore')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  autocompleteMetaText: {
    fontSize: 13,
    color: '#64748b',
  },
  container: {
    width: '100%',
  },
  autocompleteSectionSurface: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  autocompleteItemRow: {
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  autocompleteItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  autocompleteItemLast: {
    borderBottomWidth: 0,
  },
  autocompleteLeadingIcon: {
    width: 24,
    alignItems: 'center',
  },
  autocompletePrimaryText: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: NAME_LINE_HEIGHT,
    includeFontPadding: false,
    fontWeight: '400',
    color: '#111827',
  },
  // Match highlighting: the predictive completion is the bold span. Semibold
  // (not heavier) — K1 feel: emphasis without shouting (§16 K1).
  // Match highlighting, Spotify-style (owner-corrected 2026-07-24): the text
  // MATCHING what's typed renders in the app's muted meta gray; the
  // completion stays regular black — no bolding. K1 feel choice.
  autocompleteMatched: {
    color: '#64748b',
  },
  // Type label: one step below the meta line (13) so it reads as metadata, in
  // the existing muted meta color — K1 feel sentence, not a measured number
  // (§16 K1).
  // Error row sits in a standard row seat (ROW_HEIGHT) in the muted meta color —
  // quiet by design (§16 K1).
  autocompleteTextGroup: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  autocompleteBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  seeLocationsChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: '#f8fafc',
  },
  seeLocationsChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  recentSection: {
    paddingHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 0,
  },
  recentSectionGap: {
    marginTop: 12,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 0,
  },
  recentHeaderRowSpaced: {
    marginTop: 4,
  },
  recentHeaderText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: 0.4,
    textTransform: 'none',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentRowContent: {
    flex: 1,
    height: ROW_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    justifyContent: 'center',
  },
  recentRowTextGroup: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  recentRowFirst: {
    borderTopWidth: 0,
  },
  recentIcon: {
    marginRight: 10,
    width: 22,
    alignItems: 'center',
  },
  recentText: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: NAME_LINE_HEIGHT,
    includeFontPadding: false,
    color: '#1f2937',
    flexShrink: 1,
    minWidth: 0,
  },
  metaLine: {
    marginTop: META_LINE_SPACING,
  },
  metaLineText: {
    lineHeight: META_LINE_HEIGHT,
    includeFontPadding: false,
  },
  recentViewMore: {
    alignSelf: 'center',
    marginTop: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentViewMoreLast: {
    marginBottom: 8,
  },
  recentViewMoreText: {
    color: themeColors.secondaryAccent,
  },
});

export default SearchSuggestions;
