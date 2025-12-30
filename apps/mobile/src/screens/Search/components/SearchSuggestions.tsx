import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Clock,
  HandPlatter,
  Heart,
  Search as SearchIcon,
  Store,
  View as ViewIcon,
} from 'lucide-react-native';

import { Text } from '../../../components';
import SquircleSpinner from '../../../components/SquircleSpinner';
import { colors as themeColors } from '../../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../../constants/typography';
import type { AutocompleteMatch } from '../../../services/autocomplete';
import type { RecentSearch, RecentlyViewedRestaurant } from '../../../services/search';
import { ACTIVE_TAB_COLOR } from '../constants/search';
import { filterRecentlyViewedByRecentSearches } from '../utils/history';

type SearchSuggestionsProps = {
  visible: boolean;
  showAutocomplete: boolean;
  showRecent: boolean;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  hasRecentSearches: boolean;
  hasRecentlyViewedRestaurants: boolean;
  isAutocompleteLoading: boolean;
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  onSelectSuggestion: (match: AutocompleteMatch) => void;
  onSelectRecent: (term: string) => void;
  onSelectRecentlyViewed: (restaurant: RecentlyViewedRestaurant) => void;
  onPressRecentViewMore: () => void;
  onPressRecentlyViewedMore: () => void;
  style?: StyleProp<ViewStyle>;
};

const ICON_COLOR = '#000000';
const RECENT_PREVIEW_LIMIT = 5;

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  visible,
  showAutocomplete,
  showRecent,
  suggestions,
  recentSearches,
  recentlyViewedRestaurants,
  hasRecentSearches,
  hasRecentlyViewedRestaurants,
  isAutocompleteLoading,
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
  const shouldShowAutocompleteSpinner =
    showAutocomplete && isAutocompleteLoading && suggestions.length === 0;
  const recentSearchesToRender = recentSearches.slice(0, RECENT_PREVIEW_LIMIT);
  const recentlyViewedDeduped = React.useMemo(
    () => filterRecentlyViewedByRecentSearches(recentlyViewedRestaurants, recentSearches),
    [recentlyViewedRestaurants, recentSearches]
  );
  const recentlyViewedToRender = recentlyViewedDeduped.slice(0, RECENT_PREVIEW_LIMIT);
  const hasRecentlyViewedToRender = recentlyViewedDeduped.length > 0;
  const shouldShowRecentViewMore = !isRecentLoading && recentSearches.length > RECENT_PREVIEW_LIMIT;
  const shouldShowRecentlyViewedMore =
    !isRecentlyViewedLoading && recentlyViewedDeduped.length > RECENT_PREVIEW_LIMIT;

  const containerStyles = [styles.container, style];
  const recentSectionStyles = [
    styles.recentSection,
    showAutocomplete ? styles.recentSectionGap : null,
  ];

  return (
    <View style={containerStyles}>
      {shouldShowAutocompleteResults ? (
        <View style={styles.autocompleteSectionSurface}>
          {suggestions.map((match, index) => {
            const itemKey = match.entityId
              ? `${match.entityId}-${index}`
              : `${match.name}-${index}`;
            const isQuery = match.matchType === 'query' || match.entityType === 'query';
            const locationCount =
              typeof match.locationCount === 'number' ? match.locationCount : null;
            const shouldShowLocationCount =
              match.entityType === 'restaurant' && locationCount !== null && locationCount > 1;
            const isRecentQuery = Boolean(match.badges?.recentQuery);
            const isViewed = Boolean(match.badges?.viewed);
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
                    index === 0 ? styles.autocompleteItemFirst : null,
                    index === suggestions.length - 1 ? styles.autocompleteItemLast : null,
                  ]}
                >
                  <View style={styles.autocompleteTextGroup}>
                    <Text style={styles.autocompletePrimaryText} numberOfLines={1}>
                      {match.name}
                    </Text>
                    {shouldShowLocationCount ? (
                      <Text style={styles.autocompleteSecondaryText} numberOfLines={1}>
                        {`${locationCount} locations`}
                      </Text>
                    ) : null}
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
      {shouldShowAutocompleteSpinner ? (
        <View style={styles.autocompleteLoadingContainer}>
          <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
        </View>
      ) : null}

      {shouldRenderRecentSection ? (
        <View style={recentSectionStyles}>
          <View style={styles.recentHeaderRow}>
            <Text style={styles.recentHeaderText}>Recent searches</Text>
            {isRecentLoading && <ActivityIndicator size="small" color={themeColors.textBody} />}
          </View>
          {!isRecentLoading && !hasRecentSearches ? (
            <Text style={styles.recentEmptyText}>No recent searches yet</Text>
          ) : (
            <>
              {recentSearchesToRender.map((term, index) => (
                <TouchableOpacity
                  key={`${term.queryText}-${index}`}
                  onPress={() => onSelectRecent(term.queryText)}
                  style={styles.recentRow}
                >
                  <View style={styles.recentIcon}>
                    <Clock size={18} color={ICON_COLOR} strokeWidth={2} />
                  </View>
                  <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
                    <Text style={styles.recentText} numberOfLines={1}>
                      {term.queryText}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
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
            {isRecentlyViewedLoading && (
              <ActivityIndicator size="small" color={themeColors.textBody} />
            )}
          </View>
          {!isRecentlyViewedLoading && !hasRecentlyViewedToRender ? (
            <Text style={styles.recentEmptyText}>No restaurants viewed yet</Text>
          ) : (
            <>
              {recentlyViewedToRender.map((item, index) => (
                <TouchableOpacity
                  key={`${item.restaurantId}-${index}`}
                  onPress={() => onSelectRecentlyViewed(item)}
                  style={styles.recentRow}
                >
                  <View style={styles.recentIcon}>
                    <ViewIcon size={18} color={ICON_COLOR} strokeWidth={2} />
                  </View>
                  <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
                    <Text style={styles.recentText} numberOfLines={1}>
                      {item.restaurantName}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
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
    paddingTop: 12,
    paddingBottom: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  autocompleteLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompleteItemLast: {
    borderBottomWidth: 0,
  },
  autocompleteItemFirst: {
    paddingTop: 0,
  },
  autocompleteLeadingIcon: {
    width: 24,
    alignItems: 'center',
  },
  autocompletePrimaryText: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '400',
    color: '#111827',
  },
  autocompleteTextGroup: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
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
    marginTop: 12,
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
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
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
    lineHeight: LINE_HEIGHTS.subtitle,
    color: '#1f2937',
    flex: 1,
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
    marginBottom: 12,
  },
  recentViewMoreText: {
    color: themeColors.secondaryAccent,
  },
});

export default SearchSuggestions;
