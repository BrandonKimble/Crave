import React from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import {
  togglePollEndorsement,
  type PollCandidate,
  type PollLeaderboardEntry,
} from '../../services/polls';
import { useAuthController } from '../../hooks/use-auth-controller';

/**
 * "See the poll" on the feed card / detail page: the top leaderboard candidates
 * as horizontal result bars you can tap to endorse (the §13A public endorse
 * signal). The endorser count is split-colored — where the bar covers it, the
 * digits flip to the on-bar color — so it stays legible on and off the fill,
 * the TikTok-style trick the design called for. Endorsement is optimistic and
 * settles against the fresh standings the API returns (which can reorder).
 */

// Pink "heat" scale — leader most vivid, softening by rank. On-brand, never black;
// every shade stays dark enough for white on-bar text.
const RANK_FILL_COLORS = ['#ff3368', '#ff4d7b', '#ff6f93', '#fb8fab'];
const TRACK_COLOR = '#f1f3f5';
const ON_BAR_COLOR = '#ffffff';
const OFF_BAR_COLOR = themeColors.textPrimary;
const BAR_HEIGHT = 34;
const BAR_RADIUS = 11;
const BAR_GAP = 7;
const MIN_VISIBLE_FRACTION = 0.04; // a sliver of color for any non-zero candidate

type Candidate = Pick<
  PollCandidate,
  'rank' | 'subjectType' | 'subjectId' | 'name' | 'distinctEndorsers' | 'currentUserEndorsed'
>;

const toCandidate = (entry: PollLeaderboardEntry): Candidate => ({
  rank: entry.rank,
  subjectType: entry.subjectType,
  subjectId: entry.subjectId,
  name: entry.name,
  distinctEndorsers: entry.distinctEndorsers,
  currentUserEndorsed: entry.currentUserEndorsed,
});

type PollCandidateBarRowProps = {
  candidate: Candidate;
  maxEndorsers: number;
  disabled: boolean;
  onToggle: (candidate: Candidate) => void;
};

const PollCandidateBarRow = React.memo(
  ({ candidate, maxEndorsers, disabled, onToggle }: PollCandidateBarRowProps) => {
    const rawFraction =
      maxEndorsers > 0 ? Math.min(1, candidate.distinctEndorsers / maxEndorsers) : 0;
    const fraction = rawFraction > 0 ? Math.max(rawFraction, MIN_VISIBLE_FRACTION) : 0;
    const fillPct = `${fraction * 100}%`;
    // Re-establish full row width inside the clip so on-bar text lines up exactly
    // with the base layer, then the clip hides everything past the fill edge.
    const innerWidthPct = fraction > 0 ? `${100 / fraction}%` : '0%';
    const fillColor =
      RANK_FILL_COLORS[Math.min(candidate.rank - 1, RANK_FILL_COLORS.length - 1)] ??
      RANK_FILL_COLORS[RANK_FILL_COLORS.length - 1];
    const endorsed = candidate.currentUserEndorsed;
    const label = candidate.name ?? 'Unknown';

    const content = (color: string) => (
      <View style={styles.barContent} pointerEvents="none">
        <Text
          variant="caption"
          weight="semibold"
          numberOfLines={1}
          style={[styles.barName, { color }]}
        >
          {label}
        </Text>
        <Text
          variant="caption"
          weight={endorsed ? 'bold' : 'semibold'}
          style={[styles.barCount, { color }]}
        >
          {candidate.distinctEndorsers}
        </Text>
      </View>
    );

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        disabled={disabled}
        onPress={() => onToggle(candidate)}
        style={styles.barRow}
        accessibilityRole="button"
        accessibilityState={{ selected: endorsed }}
        accessibilityLabel={`${label}, ${candidate.distinctEndorsers} endorsers${
          endorsed ? ', endorsed by you' : ''
        }`}
      >
        <View style={styles.barTrack} />
        <View
          style={[
            styles.barFill,
            { width: fillPct as `${number}%`, backgroundColor: fillColor },
            endorsed && styles.barFillEndorsed,
          ]}
        />
        {/* Base layer: off-bar (dark) text — visible wherever the fill does not cover. */}
        {content(OFF_BAR_COLOR)}
        {/* On-bar layer: light text, clipped to the fill so it shows only over the bar. */}
        {fraction > 0 ? (
          <View style={[styles.barClip, { width: fillPct as `${number}%` }]}>
            <View style={{ width: innerWidthPct as `${number}%`, height: '100%' }}>
              {content(ON_BAR_COLOR)}
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }
);

PollCandidateBarRow.displayName = 'PollCandidateBarRow';

type PollCandidateBarsProps = {
  pollId: string;
  candidates: Candidate[];
  /** Active polls accept endorsements; closed polls render read-only standings. */
  interactive?: boolean;
  /** Lifts settled candidate state so a parent (e.g. detail page) can stay in sync. */
  onCandidatesChange?: (candidates: Candidate[]) => void;
};

export const PollCandidateBars = React.memo(
  ({ pollId, candidates, interactive = true, onCandidatesChange }: PollCandidateBarsProps) => {
    const { isSignedIn } = useAuthController();
    // Optimistic overlay, cleared whenever fresh props arrive from the feed.
    const [optimistic, setOptimistic] = React.useState<Candidate[] | null>(null);
    const inFlight = React.useRef(false);

    React.useEffect(() => {
      setOptimistic(null);
    }, [candidates]);

    const rows = optimistic ?? candidates;

    const handleToggle = React.useCallback(
      async (candidate: Candidate) => {
        if (!interactive || inFlight.current) return;
        if (!isSignedIn) {
          Alert.alert('Sign in to endorse', 'Join the discussion to weigh in on this poll.');
          return;
        }
        inFlight.current = true;
        const willEndorse = !candidate.currentUserEndorsed;
        const optimisticRows = rows.map((row) =>
          row.subjectId === candidate.subjectId
            ? {
                ...row,
                currentUserEndorsed: willEndorse,
                distinctEndorsers: Math.max(0, row.distinctEndorsers + (willEndorse ? 1 : -1)),
              }
            : row
        );
        setOptimistic(optimisticRows);
        try {
          const result = await togglePollEndorsement(
            pollId,
            candidate.subjectId,
            candidate.subjectType
          );
          const settled = result.leaderboard.slice(0, rows.length || 4).map(toCandidate);
          setOptimistic(settled);
          onCandidatesChange?.(settled);
        } catch {
          setOptimistic(null); // revert to props on failure
        } finally {
          inFlight.current = false;
        }
      },
      [interactive, isSignedIn, onCandidatesChange, pollId, rows]
    );

    if (!rows.length) return null;
    const maxEndorsers = rows.reduce((max, row) => Math.max(max, row.distinctEndorsers), 0);

    return (
      <View style={styles.container}>
        {rows.map((candidate) => (
          <PollCandidateBarRow
            key={candidate.subjectId}
            candidate={candidate}
            maxEndorsers={maxEndorsers}
            disabled={!interactive}
            onToggle={handleToggle}
          />
        ))}
      </View>
    );
  }
);

PollCandidateBars.displayName = 'PollCandidateBars';

const styles = StyleSheet.create({
  container: {
    gap: BAR_GAP,
  },
  barRow: {
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    backgroundColor: TRACK_COLOR,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barTrack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: TRACK_COLOR,
    borderRadius: BAR_RADIUS,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: BAR_RADIUS,
  },
  barFillEndorsed: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  barClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  barContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
  },
  barName: {
    flex: 1,
    marginRight: 10,
    fontSize: 13,
  },
  barCount: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
