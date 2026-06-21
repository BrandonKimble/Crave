import React from 'react';
import { Alert, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import {
  togglePollEndorsement,
  type PollCandidate,
  type PollLeaderboardEntry,
} from '../../services/polls';
import { useAuthController } from '../../hooks/use-auth-controller';
import { createProfileQueryOptions } from './profileSceneQueryOptions';

/**
 * "See the poll" on the feed card / detail page: the leaderboard candidates as
 * horizontal result bars you can tap to endorse (the §13A public endorse signal).
 * Each bar shows the candidate's share as a percentage (always solid black text);
 * the option(s) the viewer picked carry their profile picture as a small dot just
 * left of the percentage. Endorsement is optimistic and settles against the fresh
 * standings the API returns (which can reorder).
 */

const TRACK_COLOR = '#f1f3f5';
const FILL_COLOR = '#ffd6e0'; // soft pink — solid black text stays legible on it
const TEXT_COLOR = '#000000';
const ACCENT = themeColors.primary;
const BAR_HEIGHT = 36;
const BAR_RADIUS = 11;
const BAR_GAP = 7;
const MIN_VISIBLE_FRACTION = 0.03; // a sliver of fill for any non-zero candidate

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
  fraction: number; // share of total endorsements (0..1)
  viewerAvatarUrl: string | null;
  disabled: boolean;
  onToggle: (candidate: Candidate) => void;
};

const PollCandidateBarRow = React.memo(
  ({ candidate, fraction, viewerAvatarUrl, disabled, onToggle }: PollCandidateBarRowProps) => {
    const endorsed = candidate.currentUserEndorsed;
    const label = candidate.name ?? 'Unknown';
    const pctLabel = `${Math.round(fraction * 100)}%`;
    const fillFraction = fraction > 0 ? Math.max(fraction, MIN_VISIBLE_FRACTION) : 0;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        disabled={disabled}
        onPress={() => onToggle(candidate)}
        style={styles.barRow}
        accessibilityRole="button"
        accessibilityState={{ selected: endorsed }}
        accessibilityLabel={`${label}, ${pctLabel}${endorsed ? ', your pick' : ''}`}
      >
        <View style={styles.barTrack} />
        <View style={[styles.barFill, { width: `${fillFraction * 100}%` as `${number}%` }]} />
        <View style={styles.barContent} pointerEvents="none">
          <Text variant="caption" weight="semibold" numberOfLines={1} style={styles.barName}>
            {label}
          </Text>
          <View style={styles.barRight}>
            {endorsed ? (
              viewerAvatarUrl ? (
                <Image source={{ uri: viewerAvatarUrl }} style={styles.youDot} />
              ) : (
                <View style={styles.youDotFallback} />
              )
            ) : null}
            <Text variant="caption" weight="bold" style={styles.barPct}>
              {pctLabel}
            </Text>
          </View>
        </View>
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
  /**
   * Card preview: render this many full bars, then half-peek the next one so the
   * user can tell there are more options to see (tap the card to view them all).
   * Omit on the detail page to show every bar in full.
   */
  previewRows?: number;
};

export const PollCandidateBars = React.memo(
  ({
    pollId,
    candidates,
    interactive = true,
    onCandidatesChange,
    previewRows,
  }: PollCandidateBarsProps) => {
    const { isSignedIn } = useAuthController();
    const { data: viewerProfile } = useQuery({
      ...createProfileQueryOptions(),
      enabled: isSignedIn,
    });
    const viewerAvatarUrl = viewerProfile?.avatarUrl ?? null;

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
    const totalEndorsements = rows.reduce((sum, row) => sum + row.distinctEndorsers, 0);
    const fractionOf = (row: Candidate): number =>
      totalEndorsements > 0 ? row.distinctEndorsers / totalEndorsements : 0;

    const showPeek = previewRows != null && rows.length > previewRows;
    const fullRows = showPeek ? rows.slice(0, previewRows) : rows;
    const peekRow = showPeek ? rows[previewRows as number] : null;

    return (
      <View style={styles.container}>
        {fullRows.map((candidate) => (
          <PollCandidateBarRow
            key={candidate.subjectId}
            candidate={candidate}
            fraction={fractionOf(candidate)}
            viewerAvatarUrl={viewerAvatarUrl}
            disabled={!interactive}
            onToggle={handleToggle}
          />
        ))}
        {peekRow ? (
          // Half-peek the next option (tap-through to the card opens the full list).
          <View style={styles.peekClip} pointerEvents="none">
            <PollCandidateBarRow
              candidate={peekRow}
              fraction={fractionOf(peekRow)}
              viewerAvatarUrl={viewerAvatarUrl}
              disabled
              onToggle={handleToggle}
            />
          </View>
        ) : null}
      </View>
    );
  }
);

PollCandidateBars.displayName = 'PollCandidateBars';

const styles = StyleSheet.create({
  container: {
    gap: BAR_GAP,
  },
  peekClip: {
    height: Math.round(BAR_HEIGHT * 0.46),
    overflow: 'hidden',
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
    backgroundColor: FILL_COLOR,
    borderRadius: BAR_RADIUS,
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
    color: TEXT_COLOR,
  },
  barRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  youDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e9eef5',
  },
  youDotFallback: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: ACCENT,
  },
  barPct: {
    fontSize: 13,
    color: TEXT_COLOR,
    fontVariant: ['tabular-nums'],
  },
});
