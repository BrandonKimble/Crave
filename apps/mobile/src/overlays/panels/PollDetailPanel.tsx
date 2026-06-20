import React from 'react';
import { Alert, Dimensions, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, MessageCircle, Sparkles, X as LucideX } from 'lucide-react-native';

import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { OVERLAY_HORIZONTAL_PADDING, overlaySheetStyles } from '../overlaySheetStyles';
import { resolveExpandedTop } from '../sheetUtils';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';
import type { SnapPoints } from '../bottomSheetMotionTypes';
import type { SearchRoutePublishedSceneParts } from '../searchOverlayRouteHostContract';
import { normalizeSearchRouteSceneStackShellSpec } from '../searchOverlayRouteHostContract';
import { useAuthController } from '../../hooks/use-auth-controller';
import {
  fetchPoll,
  fetchPollLeaderboard,
  listPollComments,
  postPollComment,
  togglePollCommentLike,
  type EntitySpan,
  type Poll,
  type PollComment,
  type PollCommentSort,
  type PollCommentUser,
  type PollCreator,
  type PollLeaderboardEntry,
} from '../../services/polls';
import { PollCandidateBars } from './PollCandidateBars';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

type UsePollDetailPanelSpecOptions = {
  visible: boolean;
  pollId: string | null;
  poll?: Poll | null;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onClose: () => void;
};

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const resolveUserName = (user: PollCommentUser): string =>
  user.displayName ?? user.username ?? 'Member';

const resolveCreatorName = (creator: PollCreator | undefined): string =>
  creator?.origin === 'user' ? (creator.displayName ?? creator.username ?? 'Member') : 'Crave';

// ─── Entity-highlighted comment body ─────────────────────────────────────────

type BodySegment = { text: string; entity: EntitySpan | null };

const buildBodySegments = (body: string, spans: EntitySpan[] | null): BodySegment[] => {
  if (!spans || spans.length === 0) {
    return [{ text: body, entity: null }];
  }
  const sorted = [...spans]
    .filter((s) => s && s.start >= 0 && s.end <= body.length && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start < cursor) continue; // skip overlaps
    if (span.start > cursor) {
      segments.push({ text: body.slice(cursor, span.start), entity: null });
    }
    segments.push({ text: body.slice(span.start, span.end), entity: span });
    cursor = span.end;
  }
  if (cursor < body.length) {
    segments.push({ text: body.slice(cursor), entity: null });
  }
  return segments;
};

const CommentBody = React.memo(({ comment }: { comment: PollComment }) => {
  const segments = React.useMemo(
    () => buildBodySegments(comment.body, comment.entitySpans),
    [comment.body, comment.entitySpans]
  );
  return (
    <Text variant="body" style={styles.commentBody}>
      {segments.map((segment, index) =>
        segment.entity ? (
          <Text key={index} style={styles.entitySpan}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        )
      )}
    </Text>
  );
});
CommentBody.displayName = 'CommentBody';

const CommentAvatar = ({ user }: { user: PollCommentUser }) => {
  if (user.avatarUrl) {
    return <Image source={{ uri: user.avatarUrl }} style={styles.commentAvatar} />;
  }
  const initial = resolveUserName(user).trim().charAt(0).toUpperCase() || 'M';
  return (
    <View style={styles.commentAvatarFallback}>
      <Text variant="caption" weight="semibold" style={styles.commentAvatarInitial}>
        {initial}
      </Text>
    </View>
  );
};

type PollCommentRowProps = {
  comment: PollComment;
  onLike: (comment: PollComment) => void;
};

const PollCommentRow = React.memo(({ comment, onLike }: PollCommentRowProps) => {
  const liked = comment.currentUserLiked;
  return (
    <View style={styles.commentRow}>
      <CommentAvatar user={comment.user} />
      <View style={styles.commentContent}>
        <View style={styles.commentMetaRow}>
          <Text variant="caption" weight="semibold" style={styles.commentAuthor} numberOfLines={1}>
            {resolveUserName(comment.user)}
          </Text>
          <Text variant="caption" style={styles.commentTime}>
            {formatRelativeTime(comment.loggedAt)}
          </Text>
        </View>
        <CommentBody comment={comment} />
        <Pressable
          onPress={() => onLike(comment)}
          style={styles.likeButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Remove endorsement' : 'Endorse comment'}
        >
          <Heart
            size={14}
            color={liked ? ACCENT : themeColors.textMuted}
            fill={liked ? ACCENT : 'transparent'}
            strokeWidth={2}
          />
          <Text
            variant="caption"
            weight={liked ? 'semibold' : 'regular'}
            style={[styles.likeCount, liked && styles.likeCountActive]}
          >
            {comment.score}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});
PollCommentRow.displayName = 'PollCommentRow';

// ─── Panel spec ──────────────────────────────────────────────────────────────

export const usePollDetailPanelSpec = ({
  visible,
  pollId,
  poll: pollSeed,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  onClose,
}: UsePollDetailPanelSpecOptions): SearchRoutePublishedSceneParts => {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuthController();

  const [poll, setPoll] = React.useState<Poll | null>(pollSeed ?? null);
  const [comments, setComments] = React.useState<PollComment[]>([]);
  const [leaderboard, setLeaderboard] = React.useState<PollLeaderboardEntry[]>([]);
  const [sort, setSort] = React.useState<PollCommentSort>('top');
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [posting, setPosting] = React.useState(false);

  // Seed the header instantly from the feed card's snapshot.
  React.useEffect(() => {
    if (pollSeed) setPoll(pollSeed);
  }, [pollSeed]);

  // Reset when the sheet closes so a reopen starts clean.
  React.useEffect(() => {
    if (!visible) {
      setComments([]);
      setLeaderboard([]);
      setDraft('');
      setSort('top');
    }
  }, [visible]);

  const refresh = React.useCallback(async () => {
    if (!pollId) return;
    const [nextComments, nextLeaderboard] = await Promise.all([
      listPollComments(pollId, sort),
      fetchPollLeaderboard(pollId),
    ]);
    setComments(nextComments);
    setLeaderboard(nextLeaderboard);
  }, [pollId, sort]);

  React.useEffect(() => {
    if (!visible || !pollId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      listPollComments(pollId, sort),
      fetchPollLeaderboard(pollId),
      pollSeed ? Promise.resolve(pollSeed) : fetchPoll(pollId),
    ])
      .then(([nextComments, nextLeaderboard, nextPoll]) => {
        if (!active) return;
        setComments(nextComments);
        setLeaderboard(nextLeaderboard);
        if (nextPoll) setPoll(nextPoll);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, pollId, sort, pollSeed]);

  const handlePost = React.useCallback(async () => {
    const body = draft.trim();
    if (!body || posting || !pollId) return;
    if (!isSignedIn) {
      Alert.alert('Sign in to comment', 'Join the discussion to weigh in on this poll.');
      return;
    }
    setPosting(true);
    try {
      await postPollComment(pollId, { body });
      setDraft('');
      await refresh();
    } catch (error) {
      Alert.alert('Unable to post', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPosting(false);
    }
  }, [draft, isSignedIn, pollId, posting, refresh]);

  const handleLike = React.useCallback(
    async (comment: PollComment) => {
      if (!isSignedIn) {
        Alert.alert('Sign in to endorse', 'Join the discussion to weigh in on this poll.');
        return;
      }
      const willLike = !comment.currentUserLiked;
      setComments((prev) =>
        prev.map((row) =>
          row.commentId === comment.commentId
            ? {
                ...row,
                currentUserLiked: willLike,
                score: Math.max(0, row.score + (willLike ? 1 : -1)),
              }
            : row
        )
      );
      try {
        const result = await togglePollCommentLike(comment.commentId);
        setComments((prev) =>
          prev.map((row) =>
            row.commentId === comment.commentId
              ? { ...row, currentUserLiked: result.liked, score: result.score }
              : row
          )
        );
      } catch {
        void refresh(); // reconcile on failure
      }
    },
    [isSignedIn, refresh]
  );

  const isActive = poll?.state === 'active';
  const candidates = React.useMemo(
    () =>
      leaderboard.map((entry) => ({
        rank: entry.rank,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        name: entry.name,
        distinctEndorsers: entry.distinctEndorsers,
        currentUserEndorsed: entry.currentUserEndorsed,
      })),
    [leaderboard]
  );

  const renderItem = React.useCallback(
    ({ item }: { item: PollComment }) => <PollCommentRow comment={item} onLike={handleLike} />,
    [handleLike]
  );
  const keyExtractor = React.useCallback((item: PollComment) => item.commentId, []);

  const headerTitle = poll?.question ?? 'Poll';

  const headerComponent = (
    <OverlaySheetHeaderChrome
      title={
        <Text variant="title" weight="semibold" style={styles.sheetTitle} numberOfLines={1}>
          Poll
        </Text>
      }
      actionButton={
        <Pressable
          onPressIn={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close poll"
          style={overlaySheetStyles.closeButton}
          hitSlop={8}
        >
          <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
            <LucideX size={20} color="#000000" strokeWidth={2.5} />
          </View>
        </Pressable>
      }
    />
  );

  const listHeaderComponent = (
    <View>
      <View style={styles.pollHeader}>
        <View style={styles.creatorRow}>
          {poll?.creator?.origin === 'user' && poll.creator.avatarUrl ? (
            <Image source={{ uri: poll.creator.avatarUrl }} style={styles.creatorAvatar} />
          ) : poll?.creator?.origin === 'user' ? (
            <View style={styles.creatorAvatarFallback}>
              <Text variant="caption" weight="semibold" style={styles.creatorAvatarInitial}>
                {resolveCreatorName(poll?.creator).charAt(0).toUpperCase() || 'M'}
              </Text>
            </View>
          ) : (
            <View style={styles.creatorAvatarApp}>
              <Sparkles size={13} color={ACCENT} strokeWidth={2.2} />
            </View>
          )}
          <Text variant="caption" weight="semibold" style={styles.creatorName} numberOfLines={1}>
            {resolveCreatorName(poll?.creator)}
          </Text>
          {isActive ? (
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text variant="caption" weight="semibold" style={styles.liveText}>
                live
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="title" weight="semibold" style={styles.question}>
          {headerTitle}
        </Text>
      </View>

      {candidates.length > 0 ? (
        <View style={styles.barsBlock}>
          <PollCandidateBars
            pollId={pollId ?? ''}
            candidates={candidates}
            interactive={Boolean(isActive)}
          />
        </View>
      ) : (
        <View style={styles.emptyStandings}>
          <Text variant="caption" style={styles.emptyStandingsText}>
            No standings yet — start the discussion below to put a spot on the board.
          </Text>
        </View>
      )}

      <View style={styles.discussionHeader}>
        <Text variant="subtitle" weight="semibold" style={styles.discussionTitle}>
          Discussion
        </Text>
        <View style={styles.sortToggle}>
          <Pressable onPress={() => setSort('top')} hitSlop={6}>
            <Text
              variant="caption"
              weight={sort === 'top' ? 'semibold' : 'regular'}
              style={[styles.sortOption, sort === 'top' && styles.sortOptionActive]}
            >
              Top
            </Text>
          </Pressable>
          <Text variant="caption" style={styles.sortDivider}>
            ·
          </Text>
          <Pressable onPress={() => setSort('new')} hitSlop={6}>
            <Text
              variant="caption"
              weight={sort === 'new' ? 'semibold' : 'regular'}
              style={[styles.sortOption, sort === 'new' && styles.sortOptionActive]}
            >
              New
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.composeRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add to the discussion…"
          placeholderTextColor={themeColors.textMuted}
          style={styles.composeInput}
          multiline
        />
        <Pressable
          onPress={() => void handlePost()}
          disabled={posting || draft.trim().length === 0}
          style={[
            styles.composeButton,
            (posting || draft.trim().length === 0) && styles.composeButtonDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
        >
          <Text variant="caption" weight="semibold" style={styles.composeButtonText}>
            {posting ? '…' : 'Post'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const emptyComponent = loading ? null : (
    <View style={styles.emptyComments}>
      <MessageCircle size={20} color={themeColors.textMuted} strokeWidth={1.8} />
      <Text variant="caption" style={styles.emptyCommentsText}>
        Be the first to weigh in.
      </Text>
    </View>
  );

  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const expanded = resolveExpandedTop(searchBarTop, insets.top);
  const hidden = SCREEN_HEIGHT + 80;
  const snapPoints = React.useMemo(
    () =>
      snapPointsOverride ?? {
        expanded,
        middle: expanded,
        collapsed: expanded,
        hidden,
      },
    [expanded, hidden, snapPointsOverride]
  );

  return {
    shellSpec: normalizeSearchRouteSceneStackShellSpec({
      overlayKey: 'pollDetail',
      snapPoints,
      style: overlaySheetStyles.container,
    }),
    sceneChrome: {
      underlayComponent: null,
      backgroundComponent: <FrostedGlassBackground />,
      headerComponent,
      overlayComponent: null,
    },
    sceneBodyContent: {
      surfaceKind: 'list',
      data: comments,
      renderItem,
      keyExtractor,
      estimatedItemSize: 96,
      ListHeaderComponent: listHeaderComponent,
      ListEmptyComponent: emptyComponent,
    },
    sceneBodyTransport: {
      contentContainerStyle: {
        paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
        paddingTop: 12,
        paddingBottom: contentBottomPadding,
      },
      keyboardShouldPersistTaps: 'handled',
      bounces: true,
      alwaysBounceVertical: false,
    },
  };
};

const styles = StyleSheet.create({
  sheetTitle: {
    color: themeColors.text,
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  pollHeader: {
    marginBottom: 16,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  creatorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BORDER,
  },
  creatorAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 51, 104, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorAvatarInitial: {
    color: ACCENT,
    fontSize: 11,
  },
  creatorAvatarApp: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 51, 104, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorName: {
    color: themeColors.textBody,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  liveText: {
    color: ACCENT,
  },
  question: {
    color: themeColors.textPrimary,
    lineHeight: 27,
  },
  barsBlock: {
    marginBottom: 20,
  },
  emptyStandings: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  emptyStandingsText: {
    color: themeColors.textBody,
    lineHeight: 18,
  },
  discussionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  discussionTitle: {
    color: themeColors.textPrimary,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortOption: {
    color: themeColors.textMuted,
  },
  sortOptionActive: {
    color: themeColors.textPrimary,
  },
  sortDivider: {
    color: themeColors.textMuted,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 20,
  },
  composeInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    backgroundColor: SURFACE,
    color: themeColors.textPrimary,
  },
  composeButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeButtonDisabled: {
    opacity: 0.5,
  },
  composeButtonText: {
    color: '#ffffff',
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BORDER,
  },
  commentAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 51, 104, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarInitial: {
    color: ACCENT,
    fontSize: 12,
  },
  commentContent: {
    flex: 1,
    minWidth: 0,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  commentAuthor: {
    color: themeColors.textPrimary,
    flexShrink: 1,
  },
  commentTime: {
    color: themeColors.textMuted,
  },
  commentBody: {
    color: themeColors.textPrimary,
    lineHeight: 20,
  },
  entitySpan: {
    color: ACCENT,
    fontWeight: '600',
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  likeCount: {
    color: themeColors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  likeCountActive: {
    color: ACCENT,
  },
  emptyComments: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  emptyCommentsText: {
    color: themeColors.textMuted,
  },
});
