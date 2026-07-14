import React from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { StructuredWeeklyHours } from '@crave-search/shared';
import { Text } from '../../components';
import { colors as themeColors, radius, spacing } from '../../constants/theme';
import { resolveHoursState, type HoursTone } from './hours-engine';

// The Google-inspired hours card (restaurant-profile revamp). Compact tone-colored status
// line ("Open · Closes 10 PM" / "Closed · Opens 7 AM Tue") that taps to reveal the full
// weekly schedule (today first + bolded, split intervals, "Open 24 hours"/"Closed"). The
// LIVE status is computed client-side from the device clock in the location's timezone via
// the pure `resolveHoursState` engine, recomputed on a low-frequency timer so it never goes
// stale — the schedule itself is immutable server data, so nothing refetches.

const TONE_COLOR: Record<HoursTone, string> = {
  positive: '#1a8a3f',
  caution: '#b26a00',
  negative: '#c0392b',
  neutral: themeColors.textBody,
};

// The lead token ("Open", "Closed", "Closes soon", …) is tone-colored + bold; the rest of
// the headline (" · Closes 10 PM") is muted. Split on the middle-dot the engine emits.
const splitHeadline = (headline: string): { lead: string; rest: string } => {
  const separator = ' · ';
  const index = headline.indexOf(separator);
  if (index === -1) {
    return { lead: headline, rest: '' };
  }
  return { lead: headline.slice(0, index), rest: headline.slice(index) };
};

const REFRESH_INTERVAL_MS = 60_000;

export const RestaurantHoursCard = React.memo(
  ({ schedule }: { schedule: StructuredWeeklyHours | null | undefined }) => {
    const [nowUtcMs, setNowUtcMs] = React.useState(() => Date.now());
    const [expanded, setExpanded] = React.useState(false);

    React.useEffect(() => {
      const id = setInterval(() => setNowUtcMs(Date.now()), REFRESH_INTERVAL_MS);
      return () => clearInterval(id);
    }, []);

    const state = React.useMemo(() => resolveHoursState(schedule, nowUtcMs), [schedule, nowUtcMs]);
    const toneColor = TONE_COLOR[state.tone];
    const { lead, rest } = splitHeadline(state.headline);
    const canExpand = state.weeklyRows.length > 0;

    const toggle = React.useCallback(() => {
      if (!canExpand) {
        return;
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded((prev) => !prev);
    }, [canExpand]);

    return (
      <View style={styles.card}>
        <Pressable
          onPress={toggle}
          disabled={!canExpand}
          accessibilityRole={canExpand ? 'button' : undefined}
          accessibilityLabel={`Hours: ${state.headline}`}
          testID="restaurant-hours-card"
          style={styles.summaryRow}
        >
          <View style={styles.summaryText}>
            <View style={[styles.dot, { backgroundColor: toneColor }]} />
            <Text style={styles.headline} numberOfLines={1}>
              <Text style={[styles.headlineLead, { color: toneColor }]}>{lead}</Text>
              {rest ? <Text style={styles.headlineRest}>{rest}</Text> : null}
            </Text>
          </View>
          {canExpand ? (
            <Feather
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={themeColors.textBody}
            />
          ) : null}
        </Pressable>
        {expanded && canExpand ? (
          <View style={styles.weekly}>
            {state.weeklyRows.map((row) => (
              <View key={row.dayLabel} style={styles.weeklyRow}>
                <Text style={[styles.weeklyDay, row.isToday && styles.weeklyToday]}>
                  {row.dayLabel}
                </Text>
                <Text
                  style={[styles.weeklyHours, row.isToday && styles.weeklyToday]}
                  numberOfLines={1}
                >
                  {row.intervalsLabel}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
);

RestaurantHoursCard.displayName = 'RestaurantHoursCard';

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.surface,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  summaryText: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  headline: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  headlineLead: {
    fontWeight: '700',
  },
  headlineRest: {
    color: themeColors.textBody,
    fontWeight: '500',
  },
  weekly: {
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  weeklyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  weeklyDay: {
    fontSize: 14,
    color: themeColors.textBody,
    fontWeight: '500',
    width: 96,
  },
  weeklyHours: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    color: themeColors.textBody,
    fontWeight: '500',
  },
  weeklyToday: {
    color: themeColors.textPrimary,
    fontWeight: '700',
  },
});
