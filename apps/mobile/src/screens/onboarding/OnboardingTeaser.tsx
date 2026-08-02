import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../../components';
import { announceFailureIfOnline } from '../../components/app-modal-store';
import { fetchTeaserPreview, type TeaserPreviewPayload } from '../../services/teaser';
import { logger } from '../../utils';

/**
 * The onboarding payoff beat (business/signal/teaser-spec.md): the first time
 * Crave ANSWERS the user, personally, with real ranked data — #1 fully
 * revealed, #2–3 visible, scope stated, nothing blurred. Non-interactive by
 * design (a narrative beat, not a browse surface).
 *
 * Failure follows THE app-wide load-failure law (scene-load-failure-policy):
 * announce through the ONE shared modal (offline-aware, no auto-retry), no
 * page-local retry button, and the body renders the static outcome fallback so
 * the flow never blocks. Re-presentation is the retry move — the step unmounts
 * on navigation, so stepping back and forward re-runs the fetch.
 */

interface Props {
  city: string;
  dishIds: string[];
  contextIds: string[];
  cuisineIds: string[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: TeaserPreviewPayload }
  | { kind: 'fallback' };

const formatScore = (score: number): string => score.toFixed(1);

export const OnboardingTeaser: React.FC<Props> = ({ city, dishIds, contextIds, cuisineIds }) => {
  const [state, setState] = React.useState<LoadState>({ kind: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchTeaserPreview(city, dishIds, contextIds, cuisineIds)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        // A null payload is a served "no data" answer, not a load failure —
        // degrade quietly; the failure law is for the error edge only.
        setState(payload ? { kind: 'ready', payload } : { kind: 'fallback' });
      })
      .catch((error) => {
        logger.warn('Teaser preview failed', error);
        if (!cancelled) {
          announceFailureIfOnline({
            message: "We couldn't pull your first answer. Step back and forward to retry.",
          });
          setState({ kind: 'fallback' });
        }
      });
    return () => {
      cancelled = true;
    };
    // (join'd deps are intentional — stable across re-renders with equal ids;
    // this package's eslint has no react-hooks plugin, so no disable needed)
  }, [city, dishIds.join('|'), contextIds.join('|'), cuisineIds.join('|')]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text variant="body" style={styles.loadingText}>
          Pulling {city}&apos;s answers…
        </Text>
      </View>
    );
  }

  if (state.kind === 'fallback') {
    return (
      <View>
        <Text variant="caption" weight="semibold" style={styles.kicker}>
          YOUR FIRST ANSWER
        </Text>
        <Text variant="subtitle" weight="bold" style={styles.headline}>
          {city} is read, scored, and waiting.
        </Text>
        <Text variant="body" weight="semibold" style={styles.claim}>
          This is dinner from now on: pick a craving, get the answer, go.
        </Text>
      </View>
    );
  }

  const { payload } = state;
  const subject = payload.dishLabel ?? 'dishes';
  const isDish = payload.source === 'dish';

  return (
    <View>
      <Text variant="caption" weight="semibold" style={styles.kicker}>
        YOUR FIRST ANSWER
      </Text>
      {isDish ? (
        <Text variant="body" style={styles.mirrorLine}>
          You said you never turn down {subject}.
        </Text>
      ) : null}
      <Text variant="subtitle" weight="bold" style={styles.headline}>
        {isDish ? `The best ${subject} in ${payload.city}` : `The dishes ${payload.city} swears by`}
      </Text>
      <Text variant="body" style={styles.subhead}>
        according to the people who&apos;ve actually eaten them:
      </Text>

      <View style={styles.heroCard}>
        <View style={styles.heroRankBadge}>
          <Text variant="body" weight="bold" style={styles.heroRankText}>
            1
          </Text>
        </View>
        <View style={styles.heroBody}>
          <Text variant="body" weight="bold" style={styles.heroDish}>
            {payload.top.dishName}
          </Text>
          <Text variant="body" style={styles.heroRestaurant}>
            at {payload.top.restaurantName}
          </Text>
        </View>
        <Text variant="subtitle" weight="bold" style={styles.heroScore}>
          {formatScore(payload.top.score)}
        </Text>
      </View>

      {payload.runners.map((runner, index) => (
        <View key={`${runner.dishName}-${runner.restaurantName}`} style={styles.runnerRow}>
          <Text variant="caption" weight="semibold" style={styles.runnerRank}>
            {index + 2}
          </Text>
          <Text variant="body" style={styles.runnerText} numberOfLines={1}>
            {runner.dishName} · {runner.restaurantName}
          </Text>
          <Text variant="body" weight="semibold" style={styles.runnerScore}>
            {formatScore(runner.score)}
          </Text>
        </View>
      ))}

      {payload.restaurants ? (
        <View style={styles.restaurantSection}>
          <Text variant="body" weight="semibold" style={styles.restaurantHeader}>
            {payload.restaurants.kind === 'context'
              ? `And your ${payload.restaurants.frame} list has already started:`
              : `Where ${payload.city} goes for ${payload.restaurants.frame}:`}
          </Text>
          {payload.restaurants.rows.map((row, index) => (
            <View key={row.restaurantName} style={styles.runnerRow}>
              <Text variant="caption" weight="semibold" style={styles.runnerRank}>
                {index + 1}
              </Text>
              <Text variant="body" style={styles.runnerText} numberOfLines={1}>
                {row.restaurantName}
              </Text>
              <Text variant="body" weight="semibold" style={styles.runnerScore}>
                {formatScore(row.score)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text variant="body" weight="semibold" style={styles.claim}>
        This is dinner from now on: pick a craving, get the answer, go.
      </Text>
    </View>
  );
};

const ACCENT = '#16a34a';

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  loadingText: {
    opacity: 0.7,
  },
  kicker: {
    letterSpacing: 1.4,
    opacity: 0.6,
    marginBottom: 8,
  },
  mirrorLine: {
    opacity: 0.75,
    marginBottom: 4,
  },
  headline: {
    marginBottom: 2,
  },
  subhead: {
    opacity: 0.75,
    marginBottom: 16,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 10,
  },
  heroRankBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRankText: {
    color: '#ffffff',
  },
  heroBody: {
    flex: 1,
    gap: 2,
  },
  heroDish: {
    textTransform: 'capitalize',
  },
  heroRestaurant: {
    opacity: 0.85,
  },
  heroScore: {
    color: ACCENT,
  },
  runnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  runnerRank: {
    width: 18,
    textAlign: 'center',
    opacity: 0.6,
  },
  runnerText: {
    flex: 1,
    textTransform: 'capitalize',
    opacity: 0.9,
  },
  runnerScore: {
    opacity: 0.9,
  },
  claim: {
    marginTop: 12,
  },
  restaurantSection: {
    marginTop: 18,
  },
  restaurantHeader: {
    marginBottom: 6,
  },
});
