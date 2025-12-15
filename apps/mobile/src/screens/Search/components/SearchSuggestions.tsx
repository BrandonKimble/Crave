import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Text } from '../../../components';
import type { AutocompleteMatch } from '../../../services/autocomplete';

type SearchSuggestionsProps = {
  visible: boolean;
  showAutocomplete: boolean;
  showRecent: boolean;
  suggestions: AutocompleteMatch[];
  recentSearches: string[];
  hasRecentSearches: boolean;
  isAutocompleteLoading: boolean;
  isRecentLoading: boolean;
  onSelectSuggestion: (match: AutocompleteMatch) => void;
  onSelectRecent: (term: string) => void;
  style?: StyleProp<ViewStyle>;
  panelMaxHeight?: number;
};

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  visible,
  showAutocomplete,
  showRecent,
  suggestions,
  recentSearches,
  hasRecentSearches,
  isAutocompleteLoading,
  isRecentLoading,
  onSelectSuggestion,
  onSelectRecent,
  style,
  panelMaxHeight,
}) => {
  if (!visible) {
    return null;
  }

  const containerStyles = [styles.container, style];
  const recentScrollStyles: ViewStyle[] = [styles.recentScroll as ViewStyle];
  if (typeof panelMaxHeight === 'number' && panelMaxHeight > 0) {
    recentScrollStyles.push({ maxHeight: panelMaxHeight });
  }

  return (
    <View style={containerStyles}>
      {showAutocomplete ? (
        <View style={styles.autocompleteSectionSurface}>
          {isAutocompleteLoading && (
            <View style={styles.autocompleteLoadingRow}>
              <ActivityIndicator size="small" color="#6366f1" />
              <Text style={styles.autocompleteLoadingText}>Looking for matches…</Text>
            </View>
          )}
          {!isAutocompleteLoading && suggestions.length === 0 ? (
            <Text style={styles.autocompleteEmptyText}>Keep typing to add a dish or spot</Text>
          ) : (
            suggestions.map((match, index) => {
              const secondaryLabel =
                match.matchType === 'query' ? 'Recent search' : match.entityType.replace(/_/g, ' ');
              const itemKey = match.entityId
                ? `${match.entityId}-${index}`
                : `${match.name}-${index}`;
              return (
                <TouchableOpacity
                  key={itemKey}
                  onPress={() => onSelectSuggestion(match)}
                  style={[
                    styles.autocompleteItem,
                    index === suggestions.length - 1 && !showRecent
                      ? styles.autocompleteItemLast
                      : null,
                  ]}
                >
                  <Text style={styles.autocompletePrimaryText}>{match.name}</Text>
                  <Text style={styles.autocompleteSecondaryText}>{secondaryLabel}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ) : null}

      {showRecent ? (
        <ScrollView
          style={recentScrollStyles}
          contentContainerStyle={[
            styles.recentScrollContent,
            showAutocomplete ? styles.recentScrollContentGap : null,
          ]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View style={styles.recentHeaderRow}>
            <Text style={styles.recentHeaderText}>RECENT</Text>
            {isRecentLoading && <ActivityIndicator size="small" color="#9ca3af" />}
          </View>
          {!isRecentLoading && !hasRecentSearches ? (
            <Text style={styles.autocompleteEmptyText}>Start exploring to build your history</Text>
          ) : (
            recentSearches.map((term, index) => (
              <TouchableOpacity
                key={`${term}-${index}`}
                onPress={() => onSelectRecent(term)}
                style={[styles.recentRow, index === 0 && styles.recentRowFirst]}
              >
                <Feather name="clock" size={16} color="#6b7280" style={styles.recentIcon} />
                <Text style={styles.recentText}>{term}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
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
    paddingVertical: 10,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompleteLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompleteLoadingText: {
    fontSize: 13,
    color: '#475569',
    marginLeft: 8,
  },
  autocompleteEmptyText: {
    paddingHorizontal: 0,
    paddingVertical: 10,
    fontSize: 13,
    color: '#94a3b8',
  },
  autocompleteItem: {
    paddingHorizontal: 0,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompleteItemLast: {
    borderBottomWidth: 0,
  },
  autocompletePrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  autocompleteSecondaryText: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  recentScroll: {
    flexGrow: 0,
  },
  recentScrollContent: {
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  recentScrollContentGap: {
    marginTop: 12,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recentHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: 0.4,
    textTransform: 'none',
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
  },
  recentText: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
  },
});

export default SearchSuggestions;
