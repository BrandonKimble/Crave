import { FrostCutout, useIsInsideSceneFoundationSurface } from '../SceneBodyFoundationSurface';
import React from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { announceFailureIfOnline, showAppModal, Text } from '../../components';
import { colors as themeColors, primaryRgb } from '../../constants/theme';
import { togglePollEndorsement } from '../../services/polls';
import {
  applyOptimisticEndorsement,
  settlePollStandings,
  type PollStanding,
} from './poll-standings-model';
import { useAuthController } from '../../hooks/use-auth-controller';
import { requestPushPermissionIfEligible } from '../../services/push-permission';
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
const TEXT_COLOR = '#000000';
const ACCENT = themeColors.primary;
const BAR_HEIGHT = 36;
const BAR_RADIUS = 11;
const BAR_GAP = 7;
// FEEL/UNATTRIBUTED (F1499): the card-preview "half-peek" clip height, as a fraction of
// BAR_HEIGHT. Not literally 0.5 — no recorded reason for the difference.
const PEEK_CLIP_HEIGHT_RATIO = 0.46;
const MIN_VISIBLE_FRACTION = 0.03; // a sliver of fill for any non-zero candidate

// Graduated fill: rank 1 is the most saturated light-pink (a strong tint of the brand
// primary), and each lower-ranked option fades to a paler tint down the list — while
// staying light enough to keep the solid-black text legible on every bar.
const PRIMARY_RGB = primaryRgb; // brand primary, derived from the palette (F881)
const STRONGEST_TINT = 0.3; // rank 1 tint strength (primary mixed over white)
const FAINTEST_TINT = 0.08; // last-ranked option
const tintOfPrimary = (strength: number): string => {
  const mix = (channel: number): number => Math.round(255 * (1 - strength) + channel * strength);
  return `rgb(${mix(PRIMARY_RGB.r)}, ${mix(PRIMARY_RGB.g)}, ${mix(PRIMARY_RGB.b)})`;
};
const resolveFillColor = (index: number, total: number): string => {
  const t = total <= 1 ? 0 : Math.min(index, total - 1) / (total - 1);
  return tintOfPrimary(STRONGEST_TINT + (FAINTEST_TINT - STRONGEST_TINT) * t);
};

type Candidate = PollStanding;

type PollCandidateBarRowProps = {
  candidate: Candidate;
  fraction: number; // share of total endorsements (0..1)
  fillColor: string; // graduated primary tint by rank
  viewerAvatarUrl: string | null;
  disabled: boolean;
  onToggle: (candidate: Candidate) => void;
};

const PollCandidateBarRow = React.memo(
  ({
    candidate,
    fraction,
    fillColor,
    viewerAvatarUrl,
    disabled,
    onToggle,
  }: PollCandidateBarRowProps) => {
    const endorsed = candidate.currentUserEndorsed;
    const insideFoundationSurface = useIsInsideSceneFoundationSurface();
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
        {/* THE BAR IS A CUTOUT (owner-planned): inside a foundation surface the
            track punches through the white plate to the frost; the fill paints
            over it. Outside a surface (legacy host) the painted track stands. */}
        {insideFoundationSurface ? (
          <FrostCutout borderRadius={BAR_RADIUS} style={StyleSheet.absoluteFillObject}>
            <View style={StyleSheet.absoluteFillObject} />
          </FrostCutout>
        ) : (
          <View style={styles.barTrack} />
        )}
        <View
          style={[
            styles.barFill,
            { width: `${fillFraction * 100}%` as `${number}%`, backgroundColor: fillColor },
          ]}
        />
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
          showAppModal({
            title: 'Sign in to endorse',
            message: 'Join the discussion to weigh in on this poll.',
          });
          return;
        }
        inFlight.current = true;
        const willEndorse = !candidate.currentUserEndorsed;
        setOptimistic(applyOptimisticEndorsement(rows, candidate.subjectId, willEndorse));
        try {
          const result = await togglePollEndorsement(
            pollId,
            candidate.subjectId,
            candidate.subjectType
          );
          // EVERY standing the server sent renders (F928, owner-ruled): the settle
          // step no longer clips the fresh leaderboard to the on-screen row count.
          const settled = settlePollStandings(result.leaderboard);
          setOptimistic(settled);
          onCandidatesChange?.(settled);
          // §8.9 push-permission moment: first contribution (a poll vote).
          requestPushPermissionIfEligible();
        } catch {
          setOptimistic(null); // revert to props on failure
          announceFailureIfOnline();
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
        {fullRows.map((candidate, index) => (
          <PollCandidateBarRow
            key={candidate.subjectId}
            candidate={candidate}
            fraction={fractionOf(candidate)}
            fillColor={resolveFillColor(index, rows.length)}
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
              fillColor={resolveFillColor(previewRows as number, rows.length)}
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
    // FEEL/UNATTRIBUTED (F1499): "half-peek" (prop doc above) is the intent, but 0.46 is not
    // 0.5 — no recorded reason for the 4% short. Named so a future pass can't mistake this for
    // the exact half the doc comment describes.
    height: Math.round(BAR_HEIGHT * PEEK_CLIP_HEIGHT_RATIO),
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
