import React from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Clock,
  HandPlatter,
  Heart,
  Search as SearchIcon,
  Store,
  View as ViewIcon,
} from 'lucide-react-native';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../../constants/typography';
import type { AutocompleteMatch } from '../../../services/autocomplete';
import type { RecentSearch, RecentlyViewedRestaurant } from '../../../services/search';
import { filterRecentlyViewedByRecentSearches } from '../utils/history';
import { renderMetaDetailLine } from './render-meta-detail-line';

type SearchSuggestionsProps = {
  visible: boolean;
  showAutocomplete: boolean;
  showRecent: boolean;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  hasRecentSearches: boolean;
  hasRecentlyViewedRestaurants: boolean;
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  onSelectSuggestion: (match: AutocompleteMatch) => void;
  onSelectRecent: (term: RecentSearch) => void;
  onSelectRecentlyViewed: (restaurant: RecentlyViewedRestaurant) => void;
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

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  visible,
  showAutocomplete,
  showRecent,
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  hasRecentSearches,
  hasRecentlyViewedRestaurants,
  isRecentLoading,
  isRecentlyViewedLoading,
  onSelectSuggestion,
  onSelectRecent,
  onSelectRecentlyViewed,
  onPressRecentViewMore,
  onPressRecentlyViewedMore,
  style,
}) => {
  if (!visible) {
    return null;
  }

  const shouldRenderRecentSection =
    showRecent &&
    (isRecentLoading ||
      isRecentlyViewedLoading ||
      hasRecentSearches ||
      hasRecentlyViewedRestaurants);
  const shouldShowAutocompleteResults = showAutocomplete && suggestions.length > 0;
  const recentSearchesToRender = recentSearches.slice(0, RECENT_SEARCH_PREVIEW_LIMIT);
  const recentlyViewedDeduped = React.useMemo(
    () => filterRecentlyViewedByRecentSearches(recentlyViewedRestaurants, recentSearches),
    [recentlyViewedRestaurants, recentSearches]
  );
  const recentlyViewedToRender = recentlyViewedDeduped.slice(0, RECENTLY_VIEWED_PREVIEW_LIMIT);
  const hasRecentlyViewedToRender = recentlyViewedDeduped.length > 0;
  const shouldShowRecentViewMore = recentSearches.length > RECENT_SEARCH_PREVIEW_LIMIT;
  const shouldShowRecentlyViewedMore =
    !isRecentlyViewedLoading && recentlyViewedDeduped.length > RECENTLY_VIEWED_PREVIEW_LIMIT;
  const containerStyles = [styles.container, style];
  const recentSectionStyles = [
    styles.recentSection,
    showAutocomplete ? styles.recentSectionGap : null,
  ];

  const renderStatusLine = (
    statusPreview?: RecentSearch['statusPreview'] | null,
    fallbackLocationCount?: number | null
  ) => {
    const locationCount = statusPreview?.locationCount ?? fallbackLocationCount ?? null;
    if (!statusPreview?.operatingStatus && !locationCount) {
      return null;
    }
    const statusLine = renderMetaDetailLine(
      statusPreview?.operatingStatus ?? null,
      null,
      null,
      'left',
      undefined,
      true,
      true,
      locationCount,
      styles.metaLineText
    );
    return statusLine ?? null;
  };

  return (
    <View style={containerStyles}>
      {shouldShowAutocompleteResults ? (
        <View style={styles.autocompleteSectionSurface}>
          {suggestions.map((match, index) => {
            const normalizedEntityId = match.entityId?.trim?.() ?? '';
            const normalizedName = match.name.trim().toLowerCase();
            const confidenceKey = Number.isFinite(match.confidence)
              ? match.confidence.toFixed(3)
              : 'unknown';
            const locationCountKey =
              typeof match.locationCount === 'number' ? `${match.locationCount}` : 'unknown';
            const itemKey = normalizedEntityId
              ? `${match.entityType}:${normalizedEntityId}:${normalizedName}`
              : `${match.entityType}:${match.matchType ?? 'unknown'}:${
                  match.querySuggestionSource ?? 'unknown'
                }:${normalizedName}:${confidenceKey}:${locationCountKey}`;
            const isQuery = match.matchType === 'query' || match.entityType === 'query';
            const locationCount =
              typeof match.locationCount === 'number'
                ? match.locationCount
                : match.statusPreview?.locationCount ?? null;
            const shouldShowLocationCount =
              match.entityType === 'restaurant' && locationCount !== null && locationCount > 1;
            const isRecentQuery = Boolean(match.badges?.recentQuery);
            const isViewed = Boolean(match.badges?.viewed);
            const statusLine =
              match.entityType === 'restaurant'
                ? renderStatusLine(
                    match.statusPreview ?? null,
                    shouldShowLocationCount ? locationCount : null
                  )
                : null;
            const hasMetaLine = Boolean(statusLine);
            const leadingIcon = isRecentQuery ? (
              <Clock size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : isViewed ? (
              <ViewIcon size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : isQuery ? (
              <SearchIcon size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : match.entityType === 'restaurant' ? (
              <Store size={20} color={ICON_COLOR} strokeWidth={2} />
            ) : (
              <HandPlatter size={20} color={ICON_COLOR} strokeWidth={2} />
            );
            return (
              <TouchableOpacity
                key={itemKey}
                onPress={() => onSelectSuggestion(match)}
                style={styles.autocompleteItemRow}
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
                      {match.name}
                    </Text>
                    {hasMetaLine ? <View style={styles.metaLine}>{statusLine}</View> : null}
                  </View>
                  <View style={styles.autocompleteBadges}>
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
          <View style={styles.recentHeaderRow}>
            <Text style={styles.recentHeaderText}>Recent searches</Text>
          </View>
          {!isRecentLoading && !hasRecentSearches ? (
            <Text style={styles.recentEmptyText}>No recent searches yet</Text>
          ) : (
            <>
              {recentSearchesToRender.map((term, index) => {
                const statusLine =
                  term.selectedEntityType === 'restaurant'
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
                  accessibilityLabel="View more recent searches"
                >
                  <Text variant="body" weight="semibold" style={styles.recentViewMoreText}>
                    View more
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

          <View style={[styles.recentHeaderRow, styles.recentHeaderRowSpaced]}>
            <Text style={styles.recentHeaderText}>Recently viewed</Text>
          </View>
          {!isRecentlyViewedLoading && !hasRecentlyViewedToRender ? (
            <Text style={styles.recentEmptyText}>No restaurants viewed yet</Text>
          ) : (
            <>
              {recentlyViewedToRender.map((item, index) => {
                const statusLine = renderStatusLine(item.statusPreview ?? null);
                const hasMetaLine = Boolean(statusLine);
                return (
                  <TouchableOpacity
                    key={`${item.restaurantId}-${index}`}
                    onPress={() => onSelectRecentlyViewed(item)}
                    style={styles.recentRow}
                  >
                    <View style={styles.recentIcon}>
                      <ViewIcon size={18} color={ICON_COLOR} strokeWidth={2} />
                    </View>
                    <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
                      <View style={styles.recentRowTextGroup}>
                        <Text style={styles.recentText} numberOfLines={1}>
                          {item.restaurantName}
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
                  accessibilityLabel="View more recently viewed restaurants"
                >
                  <Text variant="body" weight="semibold" style={styles.recentViewMoreText}>
                    View more
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
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
    borderBottomColor: '#f1f5f9',
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
  autocompleteTextGroup: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  autocompleteSecondaryText: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    color: themeColors.textBody,
  },
  autocompleteBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentSection: {
    paddingHorizontal: 0,
    paddingTop: 12,
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
  recentEmptyText: {
    paddingVertical: 6,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    color: themeColors.textBody,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentRowContent: {
    flex: 1,
    height: ROW_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
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
