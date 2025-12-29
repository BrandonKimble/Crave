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
import type { RecentlyViewedRestaurant } from '../../../services/search';
import { ACTIVE_TAB_COLOR } from '../constants/search';

type SearchSuggestionsProps = {
  visible: boolean;
  showAutocomplete: boolean;
  showRecent: boolean;
  suggestions: AutocompleteMatch[];
  recentSearches: string[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  hasRecentSearches: boolean;
  hasRecentlyViewedRestaurants: boolean;
  isAutocompleteLoading: boolean;
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  onSelectSuggestion: (match: AutocompleteMatch) => void;
  onSelectRecent: (term: string) => void;
  onSelectRecentlyViewed: (restaurant: RecentlyViewedRestaurant) => void;
  style?: StyleProp<ViewStyle>;
};

const ICON_COLOR = '#000000';

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
            const leadingIcon = isQuery ? (
              <SearchIcon size={18} color={ICON_COLOR} strokeWidth={2} />
            ) : match.entityType === 'restaurant' ? (
              <Store size={18} color={ICON_COLOR} strokeWidth={2} />
            ) : (
              <HandPlatter size={18} color={ICON_COLOR} strokeWidth={2} />
            );
            return (
              <TouchableOpacity
                key={itemKey}
                onPress={() => onSelectSuggestion(match)}
                style={[
                  styles.autocompleteItemRow,
                  index === suggestions.length - 1 ? styles.autocompleteItemLast : null,
                ]}
              >
                <View style={styles.autocompleteLeadingIcon}>{leadingIcon}</View>
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
                  {match.badges?.recentQuery ? (
                    <Clock size={16} color={ICON_COLOR} strokeWidth={2} />
                  ) : null}
                  {match.badges?.viewed ? (
                    <ViewIcon size={16} color={ICON_COLOR} strokeWidth={2} />
                  ) : null}
                  {match.badges?.favorite ? (
                    <Heart size={16} color={ICON_COLOR} strokeWidth={2} />
                  ) : null}
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
            recentSearches.map((term, index) => (
              <TouchableOpacity
                key={`${term}-${index}`}
                onPress={() => onSelectRecent(term)}
                style={[styles.recentRow, index === 0 && styles.recentRowFirst]}
              >
                <View style={styles.recentIcon}>
                  <Clock size={16} color={ICON_COLOR} strokeWidth={2} />
                </View>
                <Text style={styles.recentText} numberOfLines={1}>
                  {term}
                </Text>
              </TouchableOpacity>
            ))
          )}

          <View style={[styles.recentHeaderRow, styles.recentHeaderRowSpaced]}>
            <Text style={styles.recentHeaderText}>Recently viewed</Text>
            {isRecentlyViewedLoading && (
              <ActivityIndicator size="small" color={themeColors.textBody} />
            )}
          </View>
          {!isRecentlyViewedLoading && !hasRecentlyViewedRestaurants ? (
            <Text style={styles.recentEmptyText}>No restaurants viewed yet</Text>
          ) : (
            recentlyViewedRestaurants.map((item, index) => (
              <TouchableOpacity
                key={`${item.restaurantId}-${index}`}
                onPress={() => onSelectRecentlyViewed(item)}
                style={[styles.recentRow, index === 0 && styles.recentRowFirst]}
              >
                <View style={styles.recentIcon}>
                  <ViewIcon size={16} color={ICON_COLOR} strokeWidth={2} />
                </View>
                <Text style={styles.recentText} numberOfLines={1}>
                  {item.restaurantName}
                </Text>
              </TouchableOpacity>
            ))
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
    paddingVertical: 8,
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
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompleteItemLast: {
    borderBottomWidth: 0,
  },
  autocompleteLeadingIcon: {
    width: 22,
    alignItems: 'center',
  },
  autocompletePrimaryText: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '600',
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
    paddingVertical: 8,
  },
  recentSectionGap: {
    marginTop: 12,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 6,
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
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  recentRowFirst: {
    borderTopWidth: 0,
  },
  recentIcon: {
    marginRight: 10,
    width: 20,
    alignItems: 'center',
  },
  recentText: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    color: '#1f2937',
    flex: 1,
  },
});

export default SearchSuggestions;
