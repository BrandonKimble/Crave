import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Clock, View as ViewIcon } from 'lucide-react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import type { RecentSearch, RecentlyViewedRestaurant } from '../../services/search';
import type { RootStackParamList } from '../../types/navigation';
import useSearchHistory from './hooks/use-search-history';
import { CONTENT_HORIZONTAL_PADDING } from './constants/search';
import { filterRecentlyViewedByRecentSearches } from './utils/history';

type HistoryMode = 'recentSearches' | 'recentlyViewed';

type HistorySectionKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'previous';

type HistorySection<T> = {
  key: HistorySectionKey;
  title: string;
  items: T[];
};

type RecentHistoryViewProps = {
  mode: HistoryMode;
  title: string;
};

const ICON_COLOR = '#000000';
const CHEVRON_ICON_SIZE = 36;
const CHEVRON_STROKE_WIDTH = ((2 * 24) / CHEVRON_ICON_SIZE) * 1.25;
const SECTION_ORDER: HistorySectionKey[] = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'previous',
];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfDayOffset = (date: Date, days: number) => {
  const start = startOfDay(date);
  start.setDate(start.getDate() - days);
  return start;
};

const resolveHistorySection = (value: string | null | undefined, now: Date): HistorySectionKey => {
  if (!value) {
    return 'previous';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'previous';
  }

  const normalized = startOfDay(parsed);
  const today = startOfDay(now);
  if (normalized >= today) {
    return 'today';
  }

  const yesterday = startOfDayOffset(today, 1);
  if (normalized >= yesterday) {
    return 'yesterday';
  }

  const startOfThisWeek = startOfDayOffset(today, 7);
  if (normalized >= startOfThisWeek) {
    return 'thisWeek';
  }

  const startOfLastWeek = startOfDayOffset(today, 14);
  if (normalized >= startOfLastWeek) {
    return 'lastWeek';
  }

  return 'previous';
};

const buildSections = <T,>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
  previousLabel: string
): HistorySection<T>[] => {
  const now = new Date();
  const bucketMap: Record<HistorySectionKey, T[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    lastWeek: [],
    previous: [],
  };

  items.forEach((item) => {
    const section = resolveHistorySection(getDate(item), now);
    bucketMap[section].push(item);
  });

  const labels: Record<HistorySectionKey, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    previous: previousLabel,
  };

  return SECTION_ORDER.map((key) => ({
    key,
    title: labels[key],
    items: bucketMap[key],
  })).filter((section) => section.items.length > 0);
};

const RecentHistoryView: React.FC<RecentHistoryViewProps> = ({ mode, title }) => {
  const { isSignedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {
    recentSearches,
    recentlyViewedRestaurants,
    isRecentLoading,
    isRecentlyViewedLoading,
    loadRecentHistory,
    loadRecentlyViewedRestaurants,
  } = useSearchHistory({ isSignedIn: Boolean(isSignedIn), autoLoad: false });

  const isRecentMode = mode === 'recentSearches';
  const isLoading = isRecentMode ? isRecentLoading : isRecentlyViewedLoading;
  const previousLabel = isRecentMode ? 'Previous searches' : 'Previous views';

  React.useEffect(() => {
    if (isRecentMode) {
      void loadRecentHistory();
      return;
    }
    void loadRecentlyViewedRestaurants();
  }, [isRecentMode, loadRecentHistory, loadRecentlyViewedRestaurants]);

  const sections = React.useMemo(() => {
    if (isRecentMode) {
      return buildSections(recentSearches, (item) => item.lastSearchedAt, previousLabel);
    }
    const deduped = filterRecentlyViewedByRecentSearches(recentlyViewedRestaurants, recentSearches);
    return buildSections(deduped, (item) => item.lastViewedAt, previousLabel);
  }, [isRecentMode, recentSearches, recentlyViewedRestaurants, previousLabel]);

  const hasSections = sections.length > 0;
  const emptyLabel = isRecentMode ? 'No recent searches yet' : 'No restaurants viewed yet';
  const contentStyle = React.useMemo(
    () => [styles.content, { paddingBottom: 32 + insets.bottom }],
    [insets.bottom]
  );

  const renderRecentRow = (item: RecentSearch, index: number) => (
    <View key={`${item.queryText}-${item.lastSearchedAt}`} style={styles.recentRow}>
      <View style={styles.recentIcon}>
        <Clock size={18} color={ICON_COLOR} strokeWidth={2} />
      </View>
      <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
        <Text style={styles.recentText} numberOfLines={1}>
          {item.queryText}
        </Text>
      </View>
    </View>
  );

  const renderRecentlyViewedRow = (item: RecentlyViewedRestaurant, index: number) => (
    <View key={item.restaurantId} style={styles.recentRow}>
      <View style={styles.recentIcon}>
        <ViewIcon size={18} color={ICON_COLOR} strokeWidth={2} />
      </View>
      <View style={[styles.recentRowContent, index === 0 && styles.recentRowFirst]}>
        <Text style={styles.recentText} numberOfLines={1}>
          {item.restaurantName}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to search"
          hitSlop={12}
          style={styles.backButton}
        >
          <ChevronLeft
            size={CHEVRON_ICON_SIZE}
            color="#000000"
            strokeWidth={CHEVRON_STROKE_WIDTH}
          />
        </Pressable>
        <Text variant="subtitle" weight="semibold" style={styles.headerTitle}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading && !hasSections ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={themeColors.textBody} />
          </View>
        ) : !hasSections ? (
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        ) : (
          sections.map((section, sectionIndex) => (
            <View
              key={section.key}
              style={[styles.section, sectionIndex === 0 ? styles.sectionFirst : null]}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.items.map((item, index) =>
                isRecentMode
                  ? renderRecentRow(item as RecentSearch, index)
                  : renderRecentlyViewedRow(item as RecentlyViewedRestaurant, index)
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#0f172a',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingTop: 12,
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    paddingVertical: 12,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    color: themeColors.textBody,
  },
  section: {
    marginTop: 12,
  },
  sectionFirst: {
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: 0.4,
    textTransform: 'none',
    marginBottom: 4,
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
});

export default RecentHistoryView;
